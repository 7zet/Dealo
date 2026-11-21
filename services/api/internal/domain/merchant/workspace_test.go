package merchant

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeWorkspace struct {
	WorkspaceRepository
	role string
}

func (f fakeWorkspace) RoleFor(context.Context, uuid.UUID) (uuid.UUID, string, error) {
	return uuid.New(), f.role, nil
}

func TestAuthorizeChecksThePermission(t *testing.T) {
	t.Parallel()
	cashier := NewWorkspaceService(fakeWorkspace{role: RoleCashier}, time.Now)
	if _, role, err := cashier.Authorize(context.Background(), uuid.New(), PermRedeem); err != nil || role != RoleCashier {
		t.Fatalf("cashier redeem: role %q err %v", role, err)
	}
	for _, permission := range []Permission{PermWorkspaceView, PermWorkspaceEdit, PermPayoutsView, PermStaffManage, PermRedemptionsViewAll} {
		if _, _, err := cashier.Authorize(context.Background(), uuid.New(), permission); !errors.Is(err, ErrForbidden) {
			t.Fatalf("cashier %s err = %v, want ErrForbidden", permission, err)
		}
	}
	manager := NewWorkspaceService(fakeWorkspace{role: RoleManager}, time.Now)
	if _, _, err := manager.Authorize(context.Background(), uuid.New(), PermWorkspaceEdit); err != nil {
		t.Fatalf("manager edit refused: %v", err)
	}
	if _, _, err := manager.Authorize(context.Background(), uuid.New(), PermStaffManage); !errors.Is(err, ErrForbidden) {
		t.Fatalf("manager staff err = %v, want ErrForbidden", err)
	}
}

func TestChangePercentIsZeroWithoutBaseline(t *testing.T) {
	t.Parallel()
	if got := changePercent(500, 0); got != 0 {
		t.Fatalf("changePercent(500,0) = %v, want 0", got)
	}
	if got := changePercent(150, 100); got != 50 {
		t.Fatalf("changePercent(150,100) = %v, want 50", got)
	}
}

func TestLocationHoursRejectUnknownDays(t *testing.T) {
	t.Parallel()
	err := validateLocation(LocationInput{
		CityID: uuid.New(), Address: "Street 1", Lat: 41, Lng: 69, Phone: "+998901234567",
		OpeningHours: map[string]any{"funday": "09:00-18:00"},
	})
	var invalid *InvalidInputError
	if !errors.As(err, &invalid) || invalid.Code != "unknown_day" {
		t.Fatalf("err = %v, want unknown_day", err)
	}
}

func TestLocationHoursMustBeRealClockTimes(t *testing.T) {
	t.Parallel()
	for hours, want := range map[string]bool{
		"09:00-18:00": true, "18:00-02:00": true, "00:00-24:00": true, "10:30-23:59": true,
		"25:00-99:00": false, "09:00-24:30": false, "9:00-18:00": false, "09:60-18:00": false,
		"09:00-09:00": false, "": false, "09:00": false,
	} {
		err := validateLocation(LocationInput{
			CityID: uuid.New(), Address: "Street 1", Lat: 41, Lng: 69, Phone: "+998901234567",
			OpeningHours: map[string]any{"mon": hours},
		})
		var invalid *InvalidInputError
		if got := err == nil; got != want {
			t.Fatalf("hours %q valid = %v, want %v (err %v)", hours, got, want, err)
		}
		if !want && (!errors.As(err, &invalid) || invalid.Code != "invalid_hours") {
			t.Fatalf("hours %q err = %v, want invalid_hours", hours, err)
		}
	}
}
