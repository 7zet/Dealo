package merchant

import (
	"reflect"
	"testing"
)

// TestPermissionMatrix pins the whole matrix. Changing who may do what must change this table.
func TestPermissionMatrix(t *testing.T) {
	t.Parallel()
	want := map[string][]Permission{
		RoleOwner: {PermWorkspaceView, PermWorkspaceEdit, PermPayoutsView, PermStaffManage, PermBusinessManage,
			PermRedeem, PermRedemptionsViewAll},
		RoleManager: {PermWorkspaceView, PermWorkspaceEdit, PermPayoutsView, PermRedeem, PermRedemptionsViewAll},
		RoleCashier: {PermRedeem},
		"user":      {},
		"admin":     {},
		"":          {},
	}
	for role, permissions := range want {
		if got := PermissionsFor(role); !reflect.DeepEqual(got, permissions) {
			t.Errorf("PermissionsFor(%q) = %v, want %v", role, got, permissions)
		}
		allowed := map[Permission]bool{}
		for _, permission := range permissions {
			allowed[permission] = true
		}
		for _, permission := range AllPermissions() {
			if got := Can(role, permission); got != allowed[permission] {
				t.Errorf("Can(%q, %s) = %v, want %v", role, permission, got, allowed[permission])
			}
		}
	}
	if Can(RoleOwner, Permission("unknown")) {
		t.Error("an unknown permission was granted")
	}
}

// TestPermissionsForReturnsACopy keeps callers from changing the matrix through the returned slice.
func TestPermissionsForReturnsACopy(t *testing.T) {
	t.Parallel()
	list := PermissionsFor(RoleCashier)
	list[0] = PermStaffManage
	if Can(RoleCashier, PermStaffManage) || PermissionsFor(RoleCashier)[0] != PermRedeem {
		t.Fatal("matrix changed through a returned slice")
	}
	all := AllPermissions()
	all[0] = "changed"
	if AllPermissions()[0] != PermWorkspaceView {
		t.Fatal("AllPermissions changed through a returned slice")
	}
}
