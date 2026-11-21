package merchant

// Permission is one thing a merchant role may do in its workspace. Every merchant endpoint declares
// the permission it needs, and the web hides what the signed-in role cannot use. The values are part
// of the API contract (MerchantPermission).
type Permission string

// Merchant workspace permissions.
const (
	// PermWorkspaceView reads the workspace: dashboard, business and branches, deals, media, orders,
	// customers, analytics, reviews, settings and the staff list.
	PermWorkspaceView Permission = "workspace.view"
	// PermWorkspaceEdit changes the business, branches, deals, media and settings, submits or deletes
	// deals, and replies to reviews.
	PermWorkspaceEdit Permission = "workspace.edit"
	// PermPayoutsView reads payouts.
	PermPayoutsView Permission = "payouts.view"
	// PermStaffManage invites staff, changes their role and removes them.
	PermStaffManage Permission = "staff.manage"
	// PermBusinessManage uploads and lists the business documents and sends the business to platform
	// review. These are the legal owner's acts.
	PermBusinessManage Permission = "business.manage"
	// PermRedeem looks up and redeems vouchers, and reverses the caller's own redemption within the
	// reversal window. Without PermRedemptionsViewAll the history shows only the caller's own rows.
	PermRedeem Permission = "redeem"
	// PermRedemptionsViewAll reads every redemption of the business and reverses any of them within the
	// window.
	PermRedemptionsViewAll Permission = "redemptions.view_all"
)

// allPermissions fixes the order in which permissions are reported.
var allPermissions = []Permission{
	PermWorkspaceView,
	PermWorkspaceEdit,
	PermPayoutsView,
	PermStaffManage,
	PermBusinessManage,
	PermRedeem,
	PermRedemptionsViewAll,
}

// rolePermissions is the single permission matrix for merchant roles. A cashier only redeems and sees
// their own redemption history.
var rolePermissions = map[string]map[Permission]bool{
	RoleOwner: {
		PermWorkspaceView: true, PermWorkspaceEdit: true, PermPayoutsView: true, PermStaffManage: true,
		PermBusinessManage: true, PermRedeem: true, PermRedemptionsViewAll: true,
	},
	RoleManager: {
		PermWorkspaceView: true, PermWorkspaceEdit: true, PermPayoutsView: true,
		PermRedeem: true, PermRedemptionsViewAll: true,
	},
	RoleCashier: {
		PermRedeem: true,
	},
}

// Can reports whether the merchant role holds the permission. Unknown roles hold none.
func Can(role string, permission Permission) bool {
	return rolePermissions[role][permission]
}

// PermissionsFor lists the permissions of the merchant role in a stable order. Unknown roles get an
// empty list.
func PermissionsFor(role string) []Permission {
	out := []Permission{}
	for _, permission := range allPermissions {
		if Can(role, permission) {
			out = append(out, permission)
		}
	}
	return out
}

// AllPermissions lists every merchant permission in a stable order.
func AllPermissions() []Permission {
	return append([]Permission(nil), allPermissions...)
}
