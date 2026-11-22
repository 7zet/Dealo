package store_test

import (
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
