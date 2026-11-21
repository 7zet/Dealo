package httpapi

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"

	"github.com/grupon/grupon/services/api/internal/domain/merchant"
)

// TestStaffMemberResponseNeedsTheUserEmail pins the cause of the staff invite 500: the generated
// email type refuses to marshal an empty address, so the member must carry the user's email.
func TestStaffMemberResponseNeedsTheUserEmail(t *testing.T) {
	member := merchant.StaffMember{AssignmentID: uuid.New(), UserID: uuid.New(), Role: merchant.RoleManager}
	if _, err := json.Marshal(mapStaffMember(member)); err == nil {
		t.Fatal("marshal without email succeeded; the guard this test documents is gone")
	}
	member.Email, member.Name, member.Phone = "m@test.local", "Manager", "+998900000014"
	member.Locale, member.Currency, member.Status = "uz", "UZS", "active"
	payload, err := json.Marshal(mapStaffMember(member))
	if err != nil {
		t.Fatalf("marshal full member: %v", err)
	}
	var body struct {
		Role string `json:"role"`
		User struct {
			Email string   `json:"email"`
			Roles []string `json:"roles"`
		} `json:"user"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		t.Fatal(err)
	}
	if body.User.Email != "m@test.local" || len(body.User.Roles) != 1 || body.Role != merchant.RoleManager {
		t.Fatalf("member body = %s", payload)
	}
}
