package store_test

import (
	"context"
	"testing"

	"github.com/google/uuid"

	"github.com/grupon/grupon/services/api/internal/domain/merchant"
	"github.com/grupon/grupon/services/api/internal/store"
)

// TestDashboardShowsLatestOrdersAndAMissingBaseline covers the QA report where the dashboard said there
// were no orders while the orders page listed them, and the KPIs said "unchanged" with no previous sales.
func TestDashboardShowsLatestOrdersAndAMissingBaseline(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()
	var merchantID uuid.UUID
	if err := fixture.pool.QueryRow(ctx, `SELECT id FROM merchants WHERE slug = 'seed-merchant-01'`).Scan(&merchantID); err != nil {
		t.Fatal(err)
	}
	dashboard, err := merchant.NewWorkspaceService(store.NewMerchantWorkspaceRepository(fixture.pool), nil).Dashboard(ctx, merchantID)
	if err != nil {
		t.Fatal(err)
	}
	orders, err := store.NewMerchantPanelRepository(fixture.pool).Orders(ctx, merchantID)
	if err != nil {
		t.Fatal(err)
	}
	if len(orders) == 0 || len(dashboard.LatestOrders) != min(5, len(orders)) || dashboard.LatestOrders[0].ID != orders[0].ID {
		t.Fatalf("latest orders = %d (orders page %d), want the newest five", len(dashboard.LatestOrders), len(orders))
	}
	// Seeded sales are two days old: all in the current window, none in the previous one.
	if !dashboard.TotalSales.Compared || dashboard.TotalSales.Previous != 0 || dashboard.TotalSales.Value == 0 {
		t.Fatalf("total sales = %+v, want a compared metric with no baseline", dashboard.TotalSales)
	}
	if dashboard.ActiveDeals.Compared {
		t.Fatalf("active deals = %+v, want an uncompared metric", dashboard.ActiveDeals)
	}
}
