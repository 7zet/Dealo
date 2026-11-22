package store_test

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/dealo/dealo/services/api/internal/domain/catalog"
	"github.com/dealo/dealo/services/api/internal/domain/merchant"
	"github.com/dealo/dealo/services/api/internal/store"
)

// The deal editor does not send redemptions_allowed. Saving an edit must keep a multi-use option multi-use.
func TestDealEditKeepsMultiUseOption(t *testing.T) {
	env := newATEnv(t, 1)
	merchantID, locationID := env.merchantAndLocation(t)
	ownerID := seededID(t, env.fixture, `SELECT id FROM users WHERE email='owner@local.test'`)
	repo := store.NewMerchantDealRepository(env.fixture.pool, store.NewCatalogRepository(env.fixture.pool))
	category := categoryBySlug(t, env, "beauty-and-spas")

	days := 30
	text := catalog.Text{Uz: "a", Ru: "б", En: "a"}
	optionID := uuid.New()
	in := merchant.DealInput{
		Slug: "multi-use-edit", CategoryID: category, SubcategoryID: subcategoryOf(t, env, category),
		Title: text, ShortDescription: text, Description: text, Highlights: []catalog.Text{text, text, text},
		Terms: text, RedemptionMethod: "qr_or_code", RedemptionInstructions: text,
		StartsAt: time.Now(), EndsAt: time.Now().Add(30 * 24 * time.Hour), VoucherValidDays: &days, MaxPerUser: 1,
		LocationIDs: []uuid.UUID{locationID},
		Options: []merchant.DealOptionData{{
			ID: &optionID, Title: text, OriginalPrice: 200000, DealPrice: 100000, StockTotal: 10, IsActive: true,
			RedemptionsAllowed: 5,
		}},
		Media: []merchant.DealMediaData{
			{URL: "/media/a.jpg", Alt: text, Width: 1, Height: 1}, {URL: "/media/b.jpg", Alt: text, SortOrder: 1, Width: 1, Height: 1},
			{URL: "/media/c.jpg", Alt: text, SortOrder: 2, Width: 1, Height: 1},
		},
	}
	audit := merchant.AuditEntry{ActorID: ownerID, Role: merchant.RoleOwner, Action: "deal_created", After: map[string]any{"status": merchant.DealDraft}}
	dealID, err := repo.Insert(env.ctx, merchantID, merchant.DealWrite{Input: in, Status: merchant.DealDraft}, audit)
	if err != nil {
		t.Fatal(err)
	}

	in.Options[0].RedemptionsAllowed = 0
	in.Options[0].StockTotal = 20
	if err := repo.Update(env.ctx, merchantID, dealID, merchant.DealWrite{Input: in, Status: merchant.DealDraft}, audit); err != nil {
		t.Fatal(err)
	}
	if got := env.count(t, `SELECT redemptions_allowed FROM deal_options WHERE id = $1`, optionID); got != 5 {
		t.Fatalf("redemptions_allowed after edit = %d, want 5", got)
	}
	if got := env.count(t, `SELECT stock_total FROM deal_options WHERE id = $1`, optionID); got != 20 {
		t.Fatalf("stock_total after edit = %d, want 20", got)
	}
}

type testMediaLinks struct{}

func (testMediaLinks) PublicURL(key string) string { return "/media/" + key }

// readyAsset stores a fully uploaded library photo of the merchant.
func readyAsset(t *testing.T, env atEnv, merchantID uuid.UUID) uuid.UUID {
	t.Helper()
	return seededID(t, env.fixture, `
		INSERT INTO merchant_media_assets (merchant_id, filename, content_type, size, storage_key, width, height, status)
		VALUES ($1, 'photo.jpg', 'image/jpeg', 1000, $2, 1600, 1200, 'ready') RETURNING id`,
		merchantID, "t/"+uuid.NewString()+".jpg")
}

// ownDeal is a complete draft for the merchant with the given photos.
func ownDeal(t *testing.T, env atEnv, locationID uuid.UUID, media []merchant.DealMediaData) merchant.DealInput {
	t.Helper()
	category := categoryBySlug(t, env, "beauty-and-spas")
	days := 30
	text := catalog.Text{Uz: "a", Ru: "б", En: "a"}
	return merchant.DealInput{
		Slug: "media-" + uuid.NewString()[:8], CategoryID: category, SubcategoryID: subcategoryOf(t, env, category),
		Title: text, ShortDescription: text, Description: text, Highlights: []catalog.Text{text, text, text},
		Terms: text, RedemptionMethod: "qr_or_code", RedemptionInstructions: text,
		StartsAt: time.Now(), EndsAt: time.Now().Add(30 * 24 * time.Hour), VoucherValidDays: &days, MaxPerUser: 1,
		LocationIDs: []uuid.UUID{locationID},
		Options: []merchant.DealOptionData{{
			Title: text, OriginalPrice: 200000, DealPrice: 100000, StockTotal: 10, IsActive: true,
		}},
		Media: media,
	}
}

func libraryMedia(ids ...uuid.UUID) []merchant.DealMediaData {
	text := catalog.Text{Uz: "a", Ru: "б", En: "a"}
	media := make([]merchant.DealMediaData, 0, len(ids))
	for index := range ids {
		media = append(media, merchant.DealMediaData{AssetID: &ids[index], Alt: text, SortOrder: index})
	}
	return media
}

func wantInvalid(t *testing.T, name string, err error, field, code string) {
	t.Helper()
	var invalid *merchant.InvalidInputError
	if !errors.As(err, &invalid) || invalid.Field != field || invalid.Code != code {
		t.Fatalf("%s: got %v, want %s on %s", name, err, code, field)
	}
}

// Deal photos must be ready assets of the merchant's own library; option ids must be options of the deal.
func TestDealSaveChecksMediaAndOptionOwnership(t *testing.T) {
	env := newATEnv(t, 1)
	merchantID, locationID := env.merchantAndLocation(t)
	otherMerchant := seededID(t, env.fixture, `SELECT id FROM merchants WHERE id <> $1 ORDER BY slug LIMIT 1`, merchantID)
	ownerID := seededID(t, env.fixture, `SELECT id FROM users WHERE email='owner@local.test'`)
	actor := merchant.Actor{UserID: ownerID, Role: merchant.RoleOwner}
	repo := store.NewMerchantDealRepository(env.fixture.pool, store.NewCatalogRepository(env.fixture.pool))
	service := merchant.NewDealService(repo, testMediaLinks{}, time.Now)

	own := []uuid.UUID{readyAsset(t, env, merchantID), readyAsset(t, env, merchantID), readyAsset(t, env, merchantID)}
	deal, err := service.Create(env.ctx, merchantID, actor, ownDeal(t, env, locationID, libraryMedia(own...)))
	if err != nil {
		t.Fatalf("own ready media: %v", err)
	}
	// The stored photo takes its address and size from the asset (the wizard used to send 1x1).
	if got := env.count(t, `SELECT count(*) FROM deal_media WHERE deal_id = $1 AND media_asset_id IS NOT NULL
		AND width = 1600 AND height = 1200 AND url LIKE '/media/t/%'`, deal.ID); got != 3 {
		t.Fatalf("library photos stored = %d, want 3", got)
	}
	// A photo used by a deal stays in the library (media_in_use).
	if removed, err := store.NewMerchantMediaRepository(env.fixture.pool).SoftDeleteUnused(env.ctx, merchantID, own[0]); err != nil || removed {
		t.Fatalf("delete used asset: removed=%v err=%v", removed, err)
	}

	foreign := readyAsset(t, env, otherMerchant)
	_, err = service.Create(env.ctx, merchantID, actor, ownDeal(t, env, locationID, libraryMedia(own[0], own[1], foreign)))
	wantInvalid(t, "another merchant's asset", err, "media", "media_not_found")

	pending := seededID(t, env.fixture, `
		INSERT INTO merchant_media_assets (merchant_id, filename, content_type, size, storage_key)
		VALUES ($1, 'p.jpg', 'image/jpeg', 1000, $2) RETURNING id`, merchantID, "t/"+uuid.NewString()+".jpg")
	_, err = service.Create(env.ctx, merchantID, actor, ownDeal(t, env, locationID, libraryMedia(own[0], own[1], pending)))
	wantInvalid(t, "asset not uploaded", err, "media", "media_not_found")

	deleted := readyAsset(t, env, merchantID)
	if _, err := env.fixture.pool.Exec(env.ctx, `UPDATE merchant_media_assets SET deleted_at = now() WHERE id = $1`, deleted); err != nil {
		t.Fatal(err)
	}
	_, err = service.Create(env.ctx, merchantID, actor, ownDeal(t, env, locationID, libraryMedia(own[0], own[1], deleted)))
	wantInvalid(t, "deleted asset", err, "media", "media_not_found")

	external := ownDeal(t, env, locationID, libraryMedia(own...))
	external.Media[2] = merchant.DealMediaData{URL: "https://example.com/cat.jpg", Alt: external.Title, SortOrder: 2, Width: 1, Height: 1}
	_, err = service.Create(env.ctx, merchantID, actor, external)
	wantInvalid(t, "external url", err, "media", "media_not_found")

	// Option ids: another deal's option is refused on update, and any id is refused on create.
	foreignOption := env.optionID
	edit := ownDeal(t, env, locationID, libraryMedia(own...))
	edit.Slug = deal.Slug
	edit.Options[0].ID = &foreignOption
	_, err = service.Update(env.ctx, merchantID, deal.ID, actor, edit)
	wantInvalid(t, "option of another deal", err, "options", "option_not_found")
	edit.Slug = "media-" + uuid.NewString()[:8]
	_, err = service.Create(env.ctx, merchantID, actor, edit)
	wantInvalid(t, "option id on create", err, "options", "option_not_found")
	if got := env.count(t, `SELECT count(*) FROM deal_options WHERE deal_id = $1`, deal.ID); got != 1 {
		t.Fatalf("options after refused edit = %d, want 1", got)
	}

	// The deal's own option and a photo already on the deal are kept by id.
	ownOption := seededID(t, env.fixture, `SELECT id FROM deal_options WHERE deal_id = $1`, deal.ID)
	photo := seededID(t, env.fixture, `SELECT id FROM deal_media WHERE deal_id = $1 ORDER BY sort_order LIMIT 1`, deal.ID)
	edit = ownDeal(t, env, locationID, nil)
	edit.Slug = deal.Slug
	edit.Options[0].ID = &ownOption
	edit.Media = append([]merchant.DealMediaData{{ID: &photo, Alt: edit.Title}}, libraryMedia(own[1], own[2])...)
	edit.Media[1].SortOrder, edit.Media[2].SortOrder = 1, 2
	if _, err := service.Update(env.ctx, merchantID, deal.ID, actor, edit); err != nil {
		t.Fatalf("edit with own option and kept photo: %v", err)
	}
	if got := env.count(t, `SELECT count(*) FROM deal_media WHERE id = $1 AND media_asset_id = $2`, photo, own[0]); got != 1 {
		t.Fatal("kept photo lost its id or asset")
	}
}

// A seeded deal's photos are external images, not library assets. The editor keeps them by id.
func TestEditingASeededDealKeepsItsPhotos(t *testing.T) {
	env := newATEnv(t, 1)
	var dealID, merchantID uuid.UUID
	var slug string
	if err := env.fixture.pool.QueryRow(env.ctx, `
		SELECT d.id, d.merchant_id, d.slug FROM deals d JOIN categories c ON c.id = d.category_id
		WHERE d.status = 'active' AND d.ends_at > now() + interval '1 day' AND c.deal_creation_enabled
		  AND d.slug LIKE 'seed-deal-%' ORDER BY d.slug LIMIT 1`).Scan(&dealID, &merchantID, &slug); err != nil {
		t.Fatal(err)
	}
	ownerID := seededID(t, env.fixture, `SELECT id FROM users WHERE email='owner@local.test'`)
	repo := store.NewMerchantDealRepository(env.fixture.pool, store.NewCatalogRepository(env.fixture.pool))
	service := merchant.NewDealService(repo, testMediaLinks{}, time.Now)

	current, err := repo.Detail(env.ctx, merchantID, dealID)
	if err != nil {
		t.Fatal(err)
	}
	locationID := seededID(t, env.fixture, `SELECT merchant_location_id FROM deal_locations WHERE deal_id = $1 LIMIT 1`, dealID)
	in := ownDeal(t, env, locationID, nil)
	in.Slug, in.CategoryID, in.SubcategoryID = slug, current.Category.ID, current.Subcategory.ID
	for index, item := range current.Media {
		id := item.ID
		in.Media = append(in.Media, merchant.DealMediaData{ID: &id, Alt: item.Alt, SortOrder: index})
	}
	optionID := current.Options[0].ID
	in.Options[0].ID = &optionID
	if _, err := service.Update(env.ctx, merchantID, dealID, merchant.Actor{UserID: ownerID, Role: merchant.RoleOwner}, in); err != nil {
		t.Fatalf("edit seeded deal: %v", err)
	}
	if got := env.count(t, `SELECT count(*) FROM deal_media WHERE deal_id = $1 AND url LIKE 'https://images.unsplash.com/%'
		AND width = 1200 AND media_asset_id IS NULL`, dealID); got != len(current.Media) || got == 0 {
		t.Fatalf("seeded photos after edit = %d, want %d", got, len(current.Media))
	}
}
