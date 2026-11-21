package store_test

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/grupon/grupon/services/api/internal/domain/merchant"
	"github.com/grupon/grupon/services/api/internal/store"
)

// TestMerchantRegistrationCreatesBusinessLocationAndOwnerRole checks the whole transaction and that
// an unknown city rolls everything back.
func TestMerchantRegistrationCreatesBusinessLocationAndOwnerRole(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()
	service := merchant.NewService(store.NewMerchantRepository(fixture.pool), time.Now)

	var ownerID uuid.UUID
	if err := fixture.pool.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1, 'Owner') RETURNING id`, uuid.NewString()+"@test.local",
	).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	var cityID, categoryID uuid.UUID
	if err := fixture.pool.QueryRow(ctx, `SELECT id FROM cities WHERE is_active LIMIT 1`).Scan(&cityID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, `SELECT id FROM categories WHERE searchable LIMIT 1`).Scan(&categoryID); err != nil {
		t.Fatal(err)
	}
	input := onboardingInput(cityID, categoryID)

	created, err := service.Register(ctx, ownerID, input)
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if created.ReviewStatus != "draft" {
		t.Fatalf("review status = %q, want draft", created.ReviewStatus)
	}

	var role string
	var locations int
	if err := fixture.pool.QueryRow(ctx,
		`SELECT ra.role::text FROM role_assignments ra WHERE ra.user_id = $1 AND ra.merchant_id = $2`,
		ownerID, created.ID).Scan(&role); err != nil {
		t.Fatal(err)
	}
	if role != "merchant_owner" {
		t.Fatalf("role = %s, want merchant_owner", role)
	}
	if err := fixture.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM merchant_locations WHERE merchant_id = $1`, created.ID).Scan(&locations); err != nil {
		t.Fatal(err)
	}
	if locations != 1 {
		t.Fatalf("locations = %d, want 1", locations)
	}

	// The registration is persisted with what the owner typed, and audited in the same transaction.
	var legal, display, stir, account string
	if err := fixture.pool.QueryRow(ctx,
		`SELECT legal_name, display_name, stir, bank_account FROM merchants WHERE id = $1`, created.ID,
	).Scan(&legal, &display, &stir, &account); err != nil {
		t.Fatal(err)
	}
	if legal != input.LegalName || display != input.DisplayName || stir != input.STIR || account != input.BankAccount {
		t.Fatalf("stored business = %q %q %q %q, want the submitted values", legal, display, stir, account)
	}
	var audits int
	if err := fixture.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM audit_logs WHERE action = 'merchant.register' AND entity_id = $1 AND actor_user_id = $2
		   AND NOT (after_data ? 'bank_account')`,
		created.ID, ownerID).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 1 {
		t.Fatalf("registration audit rows = %d, want 1", audits)
	}

	// GET /me reads the workspace from the memberships: the new owner must see the draft business
	// right away, or the web panel sends them back to the registration form.
	memberships, err := store.NewIdentityRepository(fixture.pool).ListMemberships(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if len(memberships) != 1 || memberships[0].MerchantID != created.ID ||
		string(memberships[0].Role) != "merchant_owner" || memberships[0].ReviewStatus != "draft" {
		t.Fatalf("memberships after registration = %+v, want one draft merchant_owner workspace", memberships)
	}
	if !merchant.Can(string(memberships[0].Role), merchant.PermBusinessManage) {
		t.Fatal("a new owner must hold business.manage to upload documents and submit the business")
	}

	// One business per account: the owner cannot register a second one, and nothing is written.
	input.STIR = "400000002"
	if _, err := service.Register(ctx, ownerID, input); !errors.Is(err, merchant.ErrAlreadyInAnotherBusiness) {
		t.Fatalf("second business err = %v, want ErrAlreadyInAnotherBusiness", err)
	}
	var stirTaken bool
	if err := fixture.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM merchants WHERE stir = '400000002')`).Scan(&stirTaken); err != nil || stirTaken {
		t.Fatalf("refused registration wrote a business: %v %v", stirTaken, err)
	}

	input.CityID = uuid.New()
	if _, err := service.Register(ctx, newPhoneUser(t, fixture, ""), input); err != merchant.ErrCityNotFound {
		t.Fatalf("unknown city err = %v, want ErrCityNotFound", err)
	}
}

// TestMerchantSubmitIsOneWayAndSTIRIsUnique checks FR-01: a draft goes to review once, and one
// taxpayer number can register only one business.
func TestMerchantSubmitIsOneWayAndSTIRIsUnique(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()
	service := merchant.NewService(store.NewMerchantRepository(fixture.pool), time.Now)

	owner := newPhoneUser(t, fixture, "+998901110001")
	var cityID, categoryID uuid.UUID
	if err := fixture.pool.QueryRow(ctx, `SELECT id FROM cities WHERE is_active LIMIT 1`).Scan(&cityID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, `SELECT id FROM categories WHERE searchable LIMIT 1`).Scan(&categoryID); err != nil {
		t.Fatal(err)
	}
	input := onboardingInput(cityID, categoryID)
	input.STIR = "400000001"
	created, err := service.Register(ctx, owner, input)
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	attachDocuments(t, fixture, created.ID, owner)
	submitted, err := service.Submit(ctx, owner)
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if submitted.ReviewStatus != "submitted" {
		t.Fatalf("review status = %q, want submitted", submitted.ReviewStatus)
	}
	if _, err := service.Submit(ctx, owner); !errors.Is(err, merchant.ErrNotDraft) {
		t.Fatalf("second submit err = %v, want ErrNotDraft", err)
	}
	if _, err := service.Submit(ctx, newPhoneUser(t, fixture, "+998901110002")); !errors.Is(err, merchant.ErrNoBusiness) {
		t.Fatalf("submit without business err = %v, want ErrNoBusiness", err)
	}

	other := newPhoneUser(t, fixture, "+998901110003")
	_, err = service.Register(ctx, other, input)
	var invalid *merchant.InvalidInputError
	if !errors.As(err, &invalid) || invalid.Field != "stir" || invalid.Code != "stir_taken" {
		t.Fatalf("duplicate STIR err = %v, want stir/stir_taken", err)
	}
}

func onboardingInput(cityID, categoryID uuid.UUID) merchant.RegisterInput {
	return merchant.RegisterInput{
		LegalName: "Test Business LLC", DisplayName: "Test Business", CategoryID: categoryID,
		CityID: cityID, Phone: "+998901234567", Address: "Test street 1", Lat: 41.3, Lng: 69.2,
		STIR: "400000000", OrgForm: "mchj", TaxRegime: "vat_payer", BankMFO: "00014",
		BankAccount: "20208000900100100001", ResponsibleName: "Test Owner", ContractVersion: "v1.1",
		ContractAccepted: true, ContractIP: "198.51.100.7",
	}
}

func newPhoneUser(t *testing.T, fixture catalogFixture, _ string) uuid.UUID {
	t.Helper()
	// Accounts from earlier runs survive reseeds, so every test user gets a fresh phone and email.
	suffix := uuid.New().String()
	// Phones repeat across runs, so a clash with an earlier account draws another number.
	for attempt := 0; attempt < 20; attempt++ {
		phone := fmt.Sprintf("+99890%07d", rand.Intn(10000000))
		var id uuid.UUID
		err := fixture.pool.QueryRow(context.Background(),
			`INSERT INTO users (email, name, phone) VALUES ($1, 'Owner', $2) RETURNING id`,
			suffix+"@test.local", phone,
		).Scan(&id)
		if err == nil {
			return id
		}
		if !strings.Contains(err.Error(), "users_phone_key") {
			t.Fatal(err)
		}
	}
	t.Fatal("no free test phone after 20 attempts")
	return uuid.Nil
}

// TestMerchantReviewMovesBusinessAndWritesAudit checks FR-01.3 against PostgreSQL: a submitted business
// is started, approved, and every decision leaves an audit row.
func TestMerchantReviewMovesBusinessAndWritesAudit(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()
	registration := merchant.NewService(store.NewMerchantRepository(fixture.pool), time.Now)
	review := merchant.NewReviewService(store.NewMerchantReviewRepository(fixture.pool))

	owner := newPhoneUser(t, fixture, "+998901110010")
	reviewer := newPhoneUser(t, fixture, "+998901110011")
	var cityID, categoryID uuid.UUID
	if err := fixture.pool.QueryRow(ctx, `SELECT id FROM cities WHERE is_active LIMIT 1`).Scan(&cityID); err != nil {
		t.Fatal(err)
	}
	if err := fixture.pool.QueryRow(ctx, `SELECT id FROM categories WHERE searchable LIMIT 1`).Scan(&categoryID); err != nil {
		t.Fatal(err)
	}
	input := onboardingInput(cityID, categoryID)
	input.STIR = "400000010"
	created, err := registration.Register(ctx, owner, input)
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	attachDocuments(t, fixture, created.ID, owner)
	if _, err := registration.Submit(ctx, owner); err != nil {
		t.Fatalf("Submit: %v", err)
	}

	admin := merchant.ReviewActor{UserID: reviewer, Role: "admin"}
	if err := review.Approve(ctx, admin, created.ID); !errors.Is(err, merchant.ErrInvalidTransition) {
		t.Fatalf("approve before review: got %v, want ErrInvalidTransition", err)
	}
	if err := review.Start(ctx, admin, created.ID); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := review.Approve(ctx, admin, created.ID); err != nil {
		t.Fatalf("Approve: %v", err)
	}

	var status string
	if err := fixture.pool.QueryRow(ctx, `SELECT review_status FROM merchants WHERE id = $1`, created.ID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "approved" {
		t.Fatalf("status = %s, want approved", status)
	}
	var audits int
	if err := fixture.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'merchant' AND entity_id = $1
		   AND action <> 'merchant.register'`, created.ID).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 2 {
		t.Fatalf("review audit rows = %d, want 2 (start and approve)", audits)
	}
}

// attachDocuments stores both required document rows, so submission is allowed in tests.
func attachDocuments(t *testing.T, fixture catalogFixture, merchantID, ownerID uuid.UUID) {
	t.Helper()
	for i, kind := range []string{"certificate", "bank_letter"} {
		if _, err := fixture.pool.Exec(context.Background(),
			`INSERT INTO merchant_documents (merchant_id, kind, storage_key, content_type, size_bytes, uploaded_by)
			 VALUES ($1, $2, $3, 'application/pdf', 1024, $4)`,
			merchantID, kind, uuid.NewString()+".pdf", ownerID); err != nil {
			t.Fatalf("attach %d: %v", i, err)
		}
	}
}
