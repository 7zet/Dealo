package merchant

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/dealo/dealo/services/api/internal/domain/catalog"
)

type fakeDealRepo struct {
	record  DealRecord
	writes  []DealWrite
	status  string
	deleted bool
	// assets is the media library across all merchants; nil means the library photos of validDeal
	// belong to whichever merchant asks.
	assets []Asset
	// photos are the photos already on the deal being edited.
	photos []DealMediaData
}

func (f *fakeDealRepo) References(context.Context, uuid.UUID, uuid.UUID, DealInput) error { return nil }

// ReadyAssets mirrors the store query: only this merchant's ready assets among ids.
func (f *fakeDealRepo) ReadyAssets(_ context.Context, merchantID uuid.UUID, ids []uuid.UUID) ([]Asset, error) {
	library := f.assets
	if library == nil {
		for _, id := range libraryIDs {
			library = append(library, Asset{ID: id, MerchantID: merchantID, StorageKey: id.String() + ".jpg", Width: 1600, Height: 1200, Ready: true})
		}
	}
	var found []Asset
	for _, asset := range library {
		for _, id := range ids {
			if asset.ID == id && asset.MerchantID == merchantID && asset.Ready {
				found = append(found, asset)
			}
		}
	}
	return found, nil
}

func (f *fakeDealRepo) DealPhotos(context.Context, uuid.UUID, uuid.UUID) ([]DealMediaData, error) {
	return f.photos, nil
}

type fakeLinks struct{}

func (fakeLinks) PublicURL(key string) string { return "/media/" + key }

// libraryIDs are the media library photos used by validDeal.
var libraryIDs = []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}

func (f *fakeDealRepo) CategoryAllowsDealCreation(context.Context, uuid.UUID) (bool, error) {
	return true, nil
}

func (f *fakeDealRepo) ReviewStatus(context.Context, uuid.UUID) (string, error) {
	return "approved", nil
}

func (f *fakeDealRepo) Insert(_ context.Context, _ uuid.UUID, write DealWrite, _ AuditEntry) (uuid.UUID, error) {
	f.writes = append(f.writes, write)
	return uuid.New(), nil
}

func (f *fakeDealRepo) Update(_ context.Context, _, _ uuid.UUID, write DealWrite, _ AuditEntry) error {
	f.writes = append(f.writes, write)
	return nil
}

func (f *fakeDealRepo) Record(context.Context, uuid.UUID, uuid.UUID) (DealRecord, error) {
	return f.record, nil
}

func (f *fakeDealRepo) SetStatus(_ context.Context, _, _ uuid.UUID, status string, _ AuditEntry) error {
	f.status = status
	return nil
}

func (f *fakeDealRepo) SoftDeleteDraft(context.Context, uuid.UUID, uuid.UUID, AuditEntry) (bool, error) {
	f.deleted = true
	return true, nil
}

func (f *fakeDealRepo) Detail(context.Context, uuid.UUID, uuid.UUID) (catalog.Deal, error) {
	return catalog.Deal{}, nil
}

func (f *fakeDealRepo) ListIDs(context.Context, uuid.UUID, string, catalog.Page) ([]uuid.UUID, int64, error) {
	return nil, 0, nil
}

func (f *fakeDealRepo) Summaries(context.Context, []uuid.UUID) ([]catalog.DealSummary, error) {
	return nil, nil
}

// dealClock keeps the deal fixtures, which end on 2026-12-31, inside their window whatever the real date.
func dealClock() time.Time { return time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC) }

func validDeal() DealInput {
	days := 30
	text := catalog.Text{Uz: "a", Ru: "б", En: "a"}
	return DealInput{
		Slug:                   "spa-day",
		CategoryID:             uuid.New(),
		SubcategoryID:          uuid.New(),
		Title:                  text,
		ShortDescription:       text,
		Description:            text,
		Highlights:             []catalog.Text{text, text, text},
		Terms:                  text,
		RedemptionMethod:       "qr_or_code",
		RedemptionInstructions: text,
		StartsAt:               time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		EndsAt:                 time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC),
		VoucherValidDays:       &days,
		MaxPerUser:             2,
		LocationIDs:            []uuid.UUID{uuid.New()},
		Options: []DealOptionData{{
			Title: text, OriginalPrice: 200000, DealPrice: 100000, StockTotal: 10, IsActive: true,
		}},
		Media: []DealMediaData{
			{AssetID: &libraryIDs[0], Alt: text}, {AssetID: &libraryIDs[1], Alt: text, SortOrder: 1},
			{AssetID: &libraryIDs[2], Alt: text, SortOrder: 2},
		},
	}
}

func TestDealValidationRules(t *testing.T) {
	cases := map[string]func(*DealInput){
		"highlights":   func(in *DealInput) { in.Highlights = in.Highlights[:2] },
		"media":        func(in *DealInput) { in.Media = in.Media[:2] },
		"price":        func(in *DealInput) { in.Options[0].DealPrice = in.Options[0].OriginalPrice + 1 },
		"validity":     func(in *DealInput) { in.VoucherValidDays = nil },
		"order":        func(in *DealInput) { in.EndsAt = in.StartsAt },
		"locations":    func(in *DealInput) { in.LocationIDs = nil },
		"slug":         func(in *DealInput) { in.Slug = "Spa Day" },
		"localization": func(in *DealInput) { in.Terms.Ru = "" },
	}
	for name, mutate := range cases {
		in := validDeal()
		mutate(&in)
		if err := in.Validate(); err == nil {
			t.Fatalf("%s: expected validation error", name)
		}
	}
	if err := validDeal().Validate(); err != nil {
		t.Fatalf("valid deal rejected: %v", err)
	}
}

func TestStockOnlyEditKeepsReviewFingerprint(t *testing.T) {
	base := validDeal()
	stockOnly := validDeal()
	stockOnly.Options[0].StockTotal = 500
	if ReviewFingerprint(base) != ReviewFingerprint(stockOnly) {
		t.Fatal("stock change must not change the review fingerprint")
	}
	priceChange := validDeal()
	priceChange.Options[0].DealPrice = 90000
	if ReviewFingerprint(base) == ReviewFingerprint(priceChange) {
		t.Fatal("price change must change the review fingerprint")
	}
}

func TestLiveDealPriceEditReturnsToReview(t *testing.T) {
	repo := &fakeDealRepo{record: DealRecord{ID: uuid.New(), Status: DealActive, Fingerprint: ReviewFingerprint(validDeal())}}
	service := NewDealService(repo, fakeLinks{}, dealClock)
	actor := Actor{UserID: uuid.New(), Role: RoleOwner}

	stock := validDeal()
	stock.Options[0].StockTotal = 3
	if _, err := service.Update(context.Background(), uuid.New(), repo.record.ID, actor, stock); err != nil {
		t.Fatal(err)
	}
	if got := repo.writes[0].Status; got != DealActive {
		t.Fatalf("stock-only edit changed status to %s", got)
	}

	price := validDeal()
	price.Options[0].DealPrice = 90000
	if _, err := service.Update(context.Background(), uuid.New(), repo.record.ID, actor, price); err != nil {
		t.Fatal(err)
	}
	if got := repo.writes[1].Status; got != DealInReview {
		t.Fatalf("price edit status = %s, want in_review", got)
	}
}

func TestSubmitAndDeleteRespectWorkflowState(t *testing.T) {
	repo := &fakeDealRepo{record: DealRecord{ID: uuid.New(), Status: DealActive}}
	service := NewDealService(repo, fakeLinks{}, dealClock)
	actor := Actor{UserID: uuid.New(), Role: RoleManager}

	if _, err := service.Submit(context.Background(), uuid.New(), repo.record.ID, actor); !errors.Is(err, ErrDealStateInvalid) {
		t.Fatalf("submit active deal: got %v", err)
	}
	if err := service.Delete(context.Background(), uuid.New(), repo.record.ID, actor); err != nil {
		t.Fatal(err)
	}

	repo.record.Status = DealDraft
	if _, err := service.Submit(context.Background(), uuid.New(), repo.record.ID, actor); err != nil {
		t.Fatal(err)
	}
	if repo.status != DealInReview {
		t.Fatalf("submitted status = %s", repo.status)
	}
}

func TestDealThatHasAlreadyEndedIsRefused(t *testing.T) {
	repo := &fakeDealRepo{record: DealRecord{ID: uuid.New(), Status: DealDraft}}
	later := func() time.Time { return time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC) }
	service := NewDealService(repo, fakeLinks{}, later)
	actor := Actor{UserID: uuid.New(), Role: RoleManager}

	var invalid *InvalidInputError
	if _, err := service.Create(context.Background(), uuid.New(), actor, validDeal()); !errors.As(err, &invalid) || invalid.Code != "in_past" {
		t.Fatalf("create ended deal: got %v", err)
	}
	if _, err := service.Update(context.Background(), uuid.New(), repo.record.ID, actor, validDeal()); !errors.As(err, &invalid) || invalid.Code != "in_past" {
		t.Fatalf("update ended deal: got %v", err)
	}
	if len(repo.writes) != 0 {
		t.Fatalf("ended deal was written %d times", len(repo.writes))
	}
}

func expectMediaNotFound(t *testing.T, name string, err error) {
	t.Helper()
	var invalid *InvalidInputError
	if !errors.As(err, &invalid) || invalid.Field != "media" || invalid.Code != "media_not_found" {
		t.Fatalf("%s: got %v, want media_not_found on media", name, err)
	}
}

func TestDealMediaComesFromTheMerchantsOwnLibrary(t *testing.T) {
	merchantID := uuid.New()
	actor := Actor{UserID: uuid.New(), Role: RoleOwner}

	repo := &fakeDealRepo{}
	service := NewDealService(repo, fakeLinks{}, dealClock)
	if _, err := service.Create(context.Background(), merchantID, actor, validDeal()); err != nil {
		t.Fatalf("own ready media: %v", err)
	}
	// The address and size come from the stored asset, not from the client.
	got := repo.writes[0].Input.Media[0]
	if got.URL != "/media/"+libraryIDs[0].String()+".jpg" || got.Width != 1600 || got.Height != 1200 ||
		got.AssetID == nil || *got.AssetID != libraryIDs[0] {
		t.Fatalf("resolved media = %+v", got)
	}

	foreign := &fakeDealRepo{assets: []Asset{
		{ID: libraryIDs[0], MerchantID: uuid.New(), StorageKey: "x.jpg", Width: 10, Height: 10, Ready: true},
		{ID: libraryIDs[1], MerchantID: merchantID, StorageKey: "y.jpg", Width: 10, Height: 10, Ready: true},
		{ID: libraryIDs[2], MerchantID: merchantID, StorageKey: "z.jpg", Width: 10, Height: 10, Ready: true},
	}}
	_, err := NewDealService(foreign, fakeLinks{}, dealClock).Create(context.Background(), merchantID, actor, validDeal())
	expectMediaNotFound(t, "another merchant's asset", err)

	pending := &fakeDealRepo{assets: []Asset{
		{ID: libraryIDs[0], MerchantID: merchantID, StorageKey: "x.jpg"},
		{ID: libraryIDs[1], MerchantID: merchantID, StorageKey: "y.jpg", Width: 10, Height: 10, Ready: true},
		{ID: libraryIDs[2], MerchantID: merchantID, StorageKey: "z.jpg", Width: 10, Height: 10, Ready: true},
	}}
	_, err = NewDealService(pending, fakeLinks{}, dealClock).Create(context.Background(), merchantID, actor, validDeal())
	expectMediaNotFound(t, "asset not uploaded yet", err)

	external := validDeal()
	external.Media[0] = DealMediaData{URL: "https://example.com/cat.jpg", Alt: external.Title, Width: 1, Height: 1}
	_, err = service.Create(context.Background(), merchantID, actor, external)
	expectMediaNotFound(t, "external url", err)

	// A photo of the deal itself can only be kept on update; a new deal has none.
	photoID := uuid.New()
	kept := validDeal()
	kept.Media[0] = DealMediaData{ID: &photoID, Alt: kept.Title}
	_, err = service.Create(context.Background(), merchantID, actor, kept)
	expectMediaNotFound(t, "photo id on create", err)

	duplicate := validDeal()
	duplicate.Media[1].AssetID = duplicate.Media[0].AssetID
	var invalid *InvalidInputError
	if _, err := service.Create(context.Background(), merchantID, actor, duplicate); !errors.As(err, &invalid) || invalid.Code != "invalid_media" {
		t.Fatalf("duplicate photo: got %v", err)
	}
	if len(repo.writes) != 1 || len(foreign.writes) != 0 || len(pending.writes) != 0 {
		t.Fatal("a refused save was written")
	}
}

// Seeded deals use photos that are not library assets. An edit keeps them by id, unchanged.
func TestEditKeepsPhotosAlreadyOnTheDeal(t *testing.T) {
	photoID := uuid.New()
	seeded := "https://images.unsplash.com/photo-1?auto=format&fit=crop&w=1200&q=80"
	repo := &fakeDealRepo{
		record: DealRecord{ID: uuid.New(), Status: DealActive, Fingerprint: ReviewFingerprint(validDeal())},
		photos: []DealMediaData{{ID: &photoID, URL: seeded, Width: 1200, Height: 900, Blurhash: "L6PZ"}},
	}
	service := NewDealService(repo, fakeLinks{}, dealClock)
	actor := Actor{UserID: uuid.New(), Role: RoleOwner}

	in := validDeal()
	in.Media[0] = DealMediaData{ID: &photoID, Alt: in.Title}
	if _, err := service.Update(context.Background(), uuid.New(), repo.record.ID, actor, in); err != nil {
		t.Fatalf("keep seeded photo: %v", err)
	}
	got := repo.writes[0].Input.Media[0]
	if got.ID == nil || *got.ID != photoID || got.URL != seeded || got.Width != 1200 || got.Blurhash != "L6PZ" || got.AssetID != nil {
		t.Fatalf("kept photo = %+v", got)
	}
	if repo.writes[0].Status != DealActive {
		t.Fatalf("photo-only edit changed status to %s", repo.writes[0].Status)
	}

	unknown := uuid.New()
	in.Media[0] = DealMediaData{ID: &unknown, Alt: in.Title}
	_, err := service.Update(context.Background(), uuid.New(), repo.record.ID, actor, in)
	expectMediaNotFound(t, "photo of another deal", err)
}
