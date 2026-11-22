package store_test

import (
	"context"
	"fmt"
	"math/rand"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/dealo/dealo/services/api/internal/domain/merchant"
	"github.com/dealo/dealo/services/api/internal/store"
)

// TestStaffInviteReturnsFullMemberAndGrantsWorkspace covers the QA report where an invite and a role
// change persisted but answered 500: the re-read member had no email, which fails the response's
// email format. It also checks that the invited manager sees the business in /me and may open the panel.
func TestStaffInviteReturnsFullMemberAndGrantsWorkspace(t *testing.T) {
	fixture := newCatalogFixture(t)
	ctx := context.Background()

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
	created, err := merchant.NewService(store.NewMerchantRepository(fixture.pool), time.Now).Register(ctx, ownerID, onboardingInput(cityID, categoryID))
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	phone := fmt.Sprintf("+99877%07d", rand.Intn(10_000_000))
	email := uuid.NewString() + "@test.local"
	var managerID uuid.UUID
	if err := fixture.pool.QueryRow(ctx,
		`INSERT INTO users (email, name, phone) VALUES ($1, 'Manager', $2) RETURNING id`, email, phone,
	).Scan(&managerID); err != nil {
		t.Fatal(err)
	}

	staff := merchant.NewStaffService(store.NewMerchantStaffRepository(fixture.pool))
	owner := merchant.Actor{UserID: ownerID, Role: merchant.RoleOwner}
	member, err := staff.Invite(ctx, owner, created.ID, phone, merchant.RoleManager)
	if err != nil {
		t.Fatalf("Invite: %v", err)
	}
	if member.Email != email || member.Phone != phone || member.Name != "Manager" || member.Locale == "" || member.Status == "" {
		t.Fatalf("invited member = %+v, want the user's email, phone, name, locale and status", member)
	}

	changed, err := staff.ChangeRole(ctx, owner, created.ID, member.AssignmentID, merchant.RoleCashier)
	if err != nil {
		t.Fatalf("ChangeRole: %v", err)
	}
	if changed.Email != email || changed.Role != merchant.RoleCashier {
		t.Fatalf("changed member = %+v, want cashier with the user's email", changed)
	}
	if _, err := staff.ChangeRole(ctx, owner, created.ID, member.AssignmentID, merchant.RoleManager); err != nil {
		t.Fatalf("ChangeRole back: %v", err)
	}

	memberships, err := store.NewIdentityRepository(fixture.pool).ListMemberships(ctx, managerID)
	if err != nil {
		t.Fatal(err)
	}
	if len(memberships) != 1 || memberships[0].MerchantID != created.ID || string(memberships[0].Role) != merchant.RoleManager {
		t.Fatalf("memberships = %+v, want one manager membership", memberships)
	}
	workspace := merchant.NewWorkspaceService(store.NewMerchantWorkspaceRepository(fixture.pool), nil)
	merchantID, role, err := workspace.Authorize(ctx, managerID, merchant.PermWorkspaceEdit)
	if err != nil || merchantID != created.ID || role != merchant.RoleManager {
		t.Fatalf("Authorize = %v %s %v, want the manager's business", merchantID, role, err)
	}

	var audits int
	if err := fixture.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM audit_logs WHERE entity_id = $1 AND action IN ('staff_invited', 'staff_role_changed')`, created.ID,
	).Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if audits != 3 {
		t.Fatalf("staff audits = %d, want 3", audits)
	}
}
