package store_test

import (
	"context"
	"os"
	"testing"

	"github.com/dealo/dealo/services/api/internal/seed"
)

// TestSeedRoleAccountsSurviveASelfRegisteredPhone checks the development role accounts and that a
// reseed reuses an account that signed in with the manager phone before it was seeded. It also pins the
// sold counters to the seeded orders, so no card shows invented sales.
func TestSeedRoleAccountsSurviveASelfRegisteredPhone(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()

	// The manager phone signs in on its own first: a phone-only account the reseed keeps.
	if _, err := fixture.pool.Exec(ctx, `DELETE FROM users WHERE phone = '+998900000014'`); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.pool.Exec(ctx,
		`INSERT INTO users (email, name, phone) VALUES ('998900000014@phone.dealo.local', 'Self', '+998900000014')`); err != nil {
		t.Fatal(err)
	}
	if err := seed.Run(ctx, os.Getenv("TEST_DATABASE_URL")); err != nil {
		t.Fatalf("reseed with a self-registered manager phone: %v", err)
	}
	if err := seed.Run(ctx, os.Getenv("TEST_DATABASE_URL")); err != nil {
		t.Fatalf("second reseed: %v", err)
	}

	want := map[string]string{
		"+998900000010": "finance",
		"+998900000011": "support",
		"+998900000012": "moderator",
		"+998900000014": "merchant_manager",
	}
	for phone, role := range want {
		var count int
		if err := fixture.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM users u JOIN role_assignments ra ON ra.user_id = u.id AND ra.role::text = $2
			 WHERE u.phone = $1 AND u.deleted_at IS NULL`, phone, role).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("%s has %d %s roles, want 1", phone, count, role)
		}
	}
	var merchantName string
	if err := fixture.pool.QueryRow(ctx,
		`SELECT m.display_name FROM users u JOIN role_assignments ra ON ra.user_id = u.id JOIN merchants m ON m.id = ra.merchant_id
		 WHERE u.phone = '+998900000014'`).Scan(&merchantName); err != nil {
		t.Fatal(err)
	}
	if merchantName != "Atlas Wellness 1" {
		t.Fatalf("manager works for %q, want Atlas Wellness 1", merchantName)
	}

	var mismatched int
	if err := fixture.pool.QueryRow(ctx, `SELECT COUNT(*) FROM deals d WHERE d.sold_count <> (
		SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
		WHERE oi.deal_id = d.id AND o.status IN ('paid', 'completed', 'partially_refunded'))`).Scan(&mismatched); err != nil {
		t.Fatal(err)
	}
	if mismatched != 0 {
		t.Fatalf("%d deals have a sold count that does not match their orders", mismatched)
	}
}
