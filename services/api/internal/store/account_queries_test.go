package store_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/grupon/grupon/services/api/internal/domain/catalog"
	"github.com/grupon/grupon/services/api/internal/domain/identity"
	"github.com/grupon/grupon/services/api/internal/domain/merchant"
	"github.com/grupon/grupon/services/api/internal/domain/reviews"
	"github.com/grupon/grupon/services/api/internal/store"
)

// redeemedVoucherFor creates a redeemed voucher for the buyer on the first active seeded option and
// returns it with its deal and merchant.
func redeemedVoucherFor(t *testing.T, fixture catalogFixture, buyerID uuid.UUID) (voucherID, dealID, merchantID uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	var optionID uuid.UUID
	var price int64
	if err := fixture.pool.QueryRow(ctx, `
		SELECT o.id, o.deal_price, d.id, d.merchant_id FROM deal_options o JOIN deals d ON d.id = o.deal_id
		WHERE d.status = 'active' AND o.is_active ORDER BY o.id LIMIT 1`).Scan(&optionID, &price, &dealID, &merchantID); err != nil {
		t.Fatalf("option: %v", err)
	}
	var orderID, itemID uuid.UUID
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO orders(number,user_id,status,subtotal,total,idempotency_key,paid_at)
		VALUES('GR-T-' || nextval('order_number_seq'),$1,'paid',$2,$2,$3,now()) RETURNING id`,
		buyerID, price, uuid.NewString()).Scan(&orderID); err != nil {
		t.Fatalf("order: %v", err)
	}
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO order_items(order_id,deal_id,deal_option_id,title_snapshot,unit_price_snapshot,original_price_snapshot,terms_snapshot,quantity)
		SELECT $1,o.deal_id,o.id,o.title,$2,o.original_price,d.terms,1 FROM deal_options o JOIN deals d ON d.id=o.deal_id WHERE o.id=$3 RETURNING id`,
		orderID, price, optionID).Scan(&itemID); err != nil {
		t.Fatalf("item: %v", err)
	}
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO vouchers(order_item_id,user_id,deal_id,deal_option_id,merchant_id,code,qr_token,status,valid_from,valid_until,redeemed_at,redeemed_by_user_id)
		SELECT $1,$2,deal_id,$3,$4,$5,$6,'redeemed',now() - interval '30 days',now() + interval '30 days',now(),$2 FROM order_items WHERE id=$1 RETURNING id`,
		itemID, buyerID, optionID, merchantID, testCode(), uuid.NewString()).Scan(&voucherID); err != nil {
		t.Fatalf("voucher: %v", err)
	}
	return voucherID, dealID, merchantID
}

func insertReview(t *testing.T, fixture catalogFixture, buyerID uuid.UUID, status string, age time.Duration, deleted bool) uuid.UUID {
	t.Helper()
	voucherID, dealID, merchantID := redeemedVoucherFor(t, fixture, buyerID)
	var id uuid.UUID
	if err := fixture.pool.QueryRow(context.Background(), `
		INSERT INTO reviews (deal_id, merchant_id, user_id, voucher_id, rating, text, locale, status, created_at, deleted_at)
		VALUES ($1, $2, $3, $4, 4, 'A review text that is long enough to pass.', 'en', $5::review_status, now() - make_interval(secs => $6::float8),
		        CASE WHEN $7::bool THEN now() END)
		RETURNING id`,
		dealID, merchantID, buyerID, voucherID, status, age.Seconds(), deleted).Scan(&id); err != nil {
		t.Fatalf("review: %v", err)
	}
	return id
}

// The author's review list holds every review that is not deleted, in any moderation status, newest
// first, with the deal, the merchant name and the merchant reply.
func TestListUserReviewsIncludesHiddenAndPendingWithReply(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()
	buyer := newPhoneUser(t, fixture, "")
	other := newPhoneUser(t, fixture, "")

	published := insertReview(t, fixture, buyer, "published", 3*time.Hour, false)
	hidden := insertReview(t, fixture, buyer, "hidden", 2*time.Hour, false)
	pending := insertReview(t, fixture, buyer, "pending", time.Hour, false)
	insertReview(t, fixture, buyer, "published", 30*time.Minute, true)
	insertReview(t, fixture, other, "published", 10*time.Minute, false)
	if _, err := fixture.pool.Exec(ctx, `INSERT INTO review_replies (review_id, merchant_user_id, text) VALUES ($1, $2, 'Thank you for visiting!')`,
		published, other); err != nil {
		t.Fatal(err)
	}

	mine, err := reviews.NewService(store.NewReviewRepository(fixture.pool)).ListMine(ctx, buyer)
	if err != nil {
		t.Fatal(err)
	}
	if len(mine) != 3 || mine[0].ID != pending || mine[1].ID != hidden || mine[2].ID != published {
		t.Fatalf("reviews = %+v, want pending, hidden, published", mine)
	}
	if mine[1].Status != reviews.StatusHidden || mine[0].Status != reviews.StatusPending {
		t.Fatalf("statuses = %q, %q", mine[0].Status, mine[1].Status)
	}

	var slug, merchantName string
	var rawTitle []byte
	if err := fixture.pool.QueryRow(ctx, `
		SELECT d.slug, d.title, m.display_name FROM reviews r JOIN deals d ON d.id = r.deal_id
		JOIN merchants m ON m.id = r.merchant_id WHERE r.id = $1`, published).Scan(&slug, &rawTitle, &merchantName); err != nil {
		t.Fatal(err)
	}
	title, err := catalog.ParseText(rawTitle)
	if err != nil {
		t.Fatal(err)
	}
	last := mine[2]
	if last.DealSlug != slug || last.MerchantName != merchantName || last.DealTitle.En != title.En ||
		last.DealTitle.Uz != title.Uz || last.DealTitle.Ru != title.Ru || title.Uz == "" {
		t.Fatalf("deal fields = %q %+v %q, want %q %+v %q", last.DealSlug, last.DealTitle, last.MerchantName, slug, title, merchantName)
	}
	if last.Reply == nil || last.Reply.Text != "Thank you for visiting!" {
		t.Fatalf("reply = %+v", last.Reply)
	}
	if mine[0].Reply != nil || mine[1].Reply != nil {
		t.Fatal("reviews without a reply returned one")
	}
}

// Memberships list the merchant workspace of the user with the merchant name, slug and review status,
// and leave out soft-deleted merchants and platform roles. The workspace role lookup follows the
// same rule, and the database holds at most one merchant role per account.
func TestListMembershipsSkipsDeletedMerchants(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()
	identityRepo := store.NewIdentityRepository(fixture.pool)
	workspaceRepo := store.NewMerchantWorkspaceRepository(fixture.pool)
	owner, cashier, gone := newPhoneUser(t, fixture, ""), newPhoneUser(t, fixture, ""), newPhoneUser(t, fixture, "")

	var approvedID uuid.UUID
	var approvedName, approvedSlug string
	if err := fixture.pool.QueryRow(ctx, `SELECT id, display_name, slug FROM merchants
		WHERE deleted_at IS NULL AND review_status = 'approved' ORDER BY slug LIMIT 1`).Scan(&approvedID, &approvedName, &approvedSlug); err != nil {
		t.Fatal(err)
	}
	suffix := uuid.NewString()[:8]
	var draftID, deletedID uuid.UUID
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO merchants (slug, legal_name, display_name, phone, review_status)
		VALUES ($1, 'Draft LLC', 'Draft Studio', '+998901234567', 'draft') RETURNING id`, "draft-"+suffix).Scan(&draftID); err != nil {
		t.Fatalf("draft merchant: %v", err)
	}
	if err := fixture.pool.QueryRow(ctx, `INSERT INTO merchants (slug, legal_name, display_name, phone, deleted_at)
		VALUES ($1, 'Gone LLC', 'Gone Studio', '+998901234567', now()) RETURNING id`, "gone-"+suffix).Scan(&deletedID); err != nil {
		t.Fatalf("deleted merchant: %v", err)
	}
	if _, err := fixture.pool.Exec(ctx, `
		INSERT INTO role_assignments (user_id, role, merchant_id) VALUES
		  ($1, 'user', NULL), ($1, 'merchant_owner', $2), ($3, 'merchant_cashier', $4), ($5, 'merchant_manager', $6)`,
		owner, draftID, cashier, approvedID, gone, deletedID); err != nil {
		t.Fatal(err)
	}

	check := func(user uuid.UUID, merchantID uuid.UUID, role identity.Role, name, slug, status string) {
		t.Helper()
		memberships, err := identityRepo.ListMemberships(ctx, user)
		if err != nil {
			t.Fatal(err)
		}
		if len(memberships) != 1 || memberships[0].MerchantID != merchantID || memberships[0].Role != role ||
			memberships[0].MerchantName != name || memberships[0].MerchantSlug != slug || memberships[0].ReviewStatus != status {
			t.Fatalf("memberships = %+v", memberships)
		}
		gotMerchant, gotRole, err := workspaceRepo.RoleFor(ctx, user)
		if err != nil || gotMerchant != merchantID || gotRole != string(role) {
			t.Fatalf("RoleFor = %s %q %v", gotMerchant, gotRole, err)
		}
	}
	check(owner, draftID, identity.RoleMerchantOwner, "Draft Studio", "draft-"+suffix, "draft")
	check(cashier, approvedID, identity.RoleMerchantCashier, approvedName, approvedSlug, "approved")

	deleted, err := identityRepo.ListMemberships(ctx, gone)
	if err != nil || len(deleted) != 0 {
		t.Fatalf("soft-deleted merchant listed: %+v %v", deleted, err)
	}
	if _, _, err := workspaceRepo.RoleFor(ctx, gone); !errors.Is(err, merchant.ErrNoMerchant) {
		t.Fatalf("RoleFor of a soft-deleted business = %v, want ErrNoMerchant", err)
	}

	// A second merchant role for the same account is refused by the database.
	if _, err := fixture.pool.Exec(ctx, `INSERT INTO role_assignments (user_id, role, merchant_id) VALUES ($1, 'merchant_manager', $2)`,
		owner, approvedID); err == nil || !strings.Contains(err.Error(), "role_assignments_one_merchant_per_user") {
		t.Fatalf("second merchant role: err = %v, want the one-merchant index", err)
	}

	none, err := identityRepo.ListMemberships(ctx, newPhoneUser(t, fixture, ""))
	if err != nil || none == nil || len(none) != 0 {
		t.Fatalf("memberships of a plain user = %+v, %v; want empty", none, err)
	}
}
