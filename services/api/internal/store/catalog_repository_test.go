package store_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/dealo/dealo/services/api/internal/domain/catalog"
	"github.com/dealo/dealo/services/api/internal/seed"
	"github.com/dealo/dealo/services/api/internal/store"
)

// catalogFixture is a freshly seeded database with the public catalog service wired to it.
type catalogFixture struct {
	pool    *pgxpool.Pool
	service *catalog.Service
	now     time.Time
}

// newCatalogFixture seeds a database and returns the catalog service. TEST_DATABASE_URL must point
// at a disposable database because the seed truncates its tables; otherwise a container is used.
func newCatalogFixture(t *testing.T) catalogFixture {
	t.Helper()
	ctx := context.Background()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		container, err := postgres.Run(ctx, "postgres:18.6-alpine",
			postgres.WithDatabase("app"), postgres.WithUsername("app"), postgres.WithPassword("app"),
			testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(60*time.Second)),
		)
		if err != nil {
			t.Skipf("Docker is unavailable and TEST_DATABASE_URL is not set: %v", err)
		}
		t.Cleanup(func() { _ = container.Terminate(ctx) })
		url, err = container.ConnectionString(ctx, "sslmode=disable")
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := seed.Run(ctx, url); err != nil {
		t.Fatalf("seed database: %v", err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	now := time.Now()
	repo := store.NewCatalogRepository(pool)
	return catalogFixture{
		pool:    pool,
		service: catalog.NewService(repo, nil, func() time.Time { return now }),
		now:     now,
	}
}

func mustPage(t *testing.T, number, size int) catalog.Page {
	t.Helper()
	page, err := catalog.NewPage(&number, &size)
	if err != nil {
		t.Fatal(err)
	}
	return page
}

func cheapestPrice(deal catalog.DealSummary) int64 {
	cheapest := int64(-1)
	for _, option := range deal.Options {
		if cheapest < 0 || option.DealPrice.Amount < cheapest {
			cheapest = option.DealPrice.Amount
		}
	}
	return cheapest
}

// Category suggestions once queried a column that migration 00025 renamed, so every search-box
// suggestion request failed with a 500.
func TestSuggestionsIncludeCategories(t *testing.T) {
	fixture := newCatalogFixture(t)
	suggestions, err := fixture.service.Suggestions(context.Background(), "beauty", "en")
	if err != nil {
		t.Fatalf("suggestions: %v", err)
	}
	for _, suggestion := range suggestions {
		if suggestion.Type == "category" {
			return
		}
	}
	t.Fatalf("expected a category suggestion for %q, got %+v", "beauty", suggestions)
}

// Suggestions follow the same capability rule as search: deals in closed categories are not offered.
func TestSuggestionsSkipClosedCategories(t *testing.T) {
	fixture := newCatalogFixture(t)
	suggestions, err := fixture.service.Suggestions(context.Background(), "Uy xizmatlari", "uz")
	if err != nil {
		t.Fatalf("suggestions: %v", err)
	}
	for _, suggestion := range suggestions {
		if strings.Contains(suggestion.Label, "Uy xizmatlari") {
			t.Fatalf("closed-category suggestion offered: %+v", suggestion)
		}
	}
}

func TestMapLocationsListOnlyApprovedMerchants(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()

	var hidden string
	if err := fixture.pool.QueryRow(ctx, `
		UPDATE merchants SET review_status = 'submitted'
		WHERE id = (SELECT merchant_id FROM merchant_locations ORDER BY created_at, id LIMIT 1)
		RETURNING slug`).Scan(&hidden); err != nil {
		t.Fatalf("hide merchant: %v", err)
	}

	locations, err := fixture.service.MapLocations(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(locations) == 0 {
		t.Fatal("expected seeded branch locations on the map")
	}
	withDeals := 0
	for _, location := range locations {
		if location.MerchantSlug == hidden {
			t.Fatalf("merchant %q is not approved but its branch %s is on the map", hidden, location.ID)
		}
		if location.Lat == 0 || location.Lng == 0 || location.Address == "" || location.MerchantName == "" {
			t.Fatalf("incomplete map location: %+v", location)
		}
		if location.ActiveDealCount > 0 {
			withDeals++
		}
	}
	if withDeals == 0 {
		t.Fatal("expected at least one branch with active deals")
	}
}

// The deal page decides whether to sell from the category flags carried by the deal, so they must
// come from the database (a missing column read as false paused sales on every deal).
func TestDealCarriesItsCategoryFlags(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()
	var slug string
	var purchasable, redeemable bool
	if err := fixture.pool.QueryRow(ctx, `
		SELECT d.slug, c.purchasable, c.redeemable FROM deals d
		JOIN categories c ON c.id = d.category_id
		WHERE d.status = 'active' AND c.purchasable LIMIT 1`).Scan(&slug, &purchasable, &redeemable); err != nil {
		t.Fatal(err)
	}
	deal, err := store.NewCatalogRepository(fixture.pool).DealBySlug(ctx, slug)
	if err != nil {
		t.Fatal(err)
	}
	if deal.Category.Purchasable != purchasable || deal.Category.Redeemable != redeemable || !deal.Category.Searchable {
		t.Fatalf("category flags = %+v, want purchasable=%v redeemable=%v searchable", deal.Category, purchasable, redeemable)
	}
}
