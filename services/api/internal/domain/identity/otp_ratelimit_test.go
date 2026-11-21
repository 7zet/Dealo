package identity_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/grupon/grupon/services/api/internal/domain/identity"
	"github.com/grupon/grupon/services/api/internal/domain/identity/identitytest"
)

func limitedOTPService(t *testing.T, clk *otpClock, sender identity.CodeSender, limiter identity.RateLimiter) *identity.Service {
	t.Helper()
	issuer, err := identity.NewTokenIssuer(otpSecret, 15*time.Minute, clk.Now)
	if err != nil {
		t.Fatal(err)
	}
	return identity.NewService(identity.Dependencies{
		Repository: identitytest.NewRepository(clk.Now),
		Tokens:     issuer,
		CodeSender: sender,
		Limiter:    limiter,
		Now:        clk.Now,
	}, identity.Config{AccessTokenTTL: 15 * time.Minute, RefreshTokenTTL: 24 * time.Hour, OTPEcho: true})
}

// A code is valid for five minutes: the right code just before the end signs in, the right code at
// the end is rejected as expired (not as wrong), so the visitor is told to ask for a new one.
func TestExpiredCodeIsRejectedAsExpiredNotWrong(t *testing.T) {
	ctx := context.Background()
	meta := identity.RequestMeta{IP: "203.0.113.20"}

	clk := &otpClock{now: time.Date(2026, 6, 1, 9, 0, 0, 0, time.UTC)}
	sender := &capturedSender{}
	svc := otpService(t, clk, sender, 0)
	if _, err := svc.RequestCode(ctx, meta, "+998903333333"); err != nil {
		t.Fatal(err)
	}
	clk.now = clk.now.Add(5 * time.Minute)
	_, err := svc.VerifyCode(ctx, meta, "+998903333333", sender.code)
	if !errors.Is(err, identity.ErrOTPExpired) || errors.Is(err, identity.ErrOTPInvalid) {
		t.Fatalf("code at five minutes: got %v, want ErrOTPExpired", err)
	}

	if _, err := svc.RequestCode(ctx, meta, "+998903333333"); err != nil {
		t.Fatal(err)
	}
	clk.now = clk.now.Add(5*time.Minute - time.Second)
	if _, err := svc.VerifyCode(ctx, meta, "+998903333333", sender.code); err != nil {
		t.Fatalf("fresh code one second before expiry: %v", err)
	}
}

// The resend cooldown reports exactly how long is left, so the page can count down.
func TestCooldownReportsTheRemainingWait(t *testing.T) {
	ctx := context.Background()
	clk := &otpClock{now: time.Date(2026, 6, 1, 9, 0, 0, 0, time.UTC)}
	svc := otpService(t, clk, &capturedSender{}, time.Minute)
	meta := identity.RequestMeta{IP: "203.0.113.21"}
	if _, err := svc.RequestCode(ctx, meta, "+998904444444"); err != nil {
		t.Fatal(err)
	}
	clk.now = clk.now.Add(20*time.Second + 300*time.Millisecond)
	_, err := svc.RequestCode(ctx, meta, "+998904444444")
	if !errors.Is(err, identity.ErrOTPCooldown) {
		t.Fatalf("got %v, want ErrOTPCooldown", err)
	}
	if wait := identity.RetryAfterOf(err); wait != 40*time.Second {
		t.Fatalf("wait = %v, want 40s (rounded up)", wait)
	}
}

// Phone A hitting its limit must not lock out phone B, even from the same address (one Wi-Fi, one
// carrier NAT, or the web server forwarding everyone's sign-in).
func TestPhoneLockoutDoesNotBlockAnotherPhone(t *testing.T) {
	ctx := context.Background()
	clk := &otpClock{now: time.Date(2026, 6, 1, 9, 0, 0, 0, time.UTC)}
	svc := limitedOTPService(t, clk, &capturedSender{}, &identitytest.Limiter{})
	meta := identity.RequestMeta{IP: "198.51.100.1"}

	for i := 0; i < 10; i++ {
		if _, err := svc.RequestCode(ctx, meta, "+998905555551"); err != nil {
			t.Fatalf("phone A request %d: %v", i+1, err)
		}
	}
	_, err := svc.RequestCode(ctx, meta, "+998905555551")
	if !errors.Is(err, identity.ErrRateLimited) {
		t.Fatalf("phone A request 11: got %v, want ErrRateLimited", err)
	}
	if wait := identity.RetryAfterOf(err); wait <= 0 || wait > 15*time.Minute {
		t.Fatalf("phone A wait = %v, want a positive wait within the window", wait)
	}

	if _, err := svc.RequestCode(ctx, meta, "+998905555552"); err != nil {
		t.Fatalf("phone B from the same address was blocked: %v", err)
	}
	if _, err := svc.RequestCode(ctx, identity.RequestMeta{IP: "198.51.100.2"}, "+998905555553"); err != nil {
		t.Fatalf("phone C from another address was blocked: %v", err)
	}

	// Verification has its own per-phone budget: wrong guesses on A do not block B.
	for i := 0; i < 10; i++ {
		_, _ = svc.VerifyCode(ctx, meta, "+998905555551", "000000")
	}
	if _, err := svc.VerifyCode(ctx, meta, "+998905555551", "000000"); !errors.Is(err, identity.ErrRateLimited) {
		t.Fatalf("phone A verify 11: got %v, want ErrRateLimited", err)
	}
	if _, err := svc.VerifyCode(ctx, meta, "+998905555552", "000000"); errors.Is(err, identity.ErrRateLimited) {
		t.Fatalf("phone B verify was rate limited by phone A: %v", err)
	}
}

// The per-address limit is only a flood guard: dozens of different buyers behind one address can
// still sign in, and only a flood from one address is stopped.
func TestAddressLimitIsGenerousAndSeparateFromPhones(t *testing.T) {
	ctx := context.Background()
	clk := &otpClock{now: time.Date(2026, 6, 1, 9, 0, 0, 0, time.UTC)}
	svc := limitedOTPService(t, clk, &capturedSender{}, &identitytest.Limiter{})
	meta := identity.RequestMeta{IP: "198.51.100.9"}

	for i := 0; i < 100; i++ {
		if _, err := svc.RequestCode(ctx, meta, fmt.Sprintf("+99897%07d", i)); err != nil {
			t.Fatalf("buyer %d behind one address: %v", i+1, err)
		}
	}
	if _, err := svc.RequestCode(ctx, meta, "+998979999999"); !errors.Is(err, identity.ErrRateLimited) {
		t.Fatalf("request 101 from one address: got %v, want ErrRateLimited", err)
	}
	if _, err := svc.RequestCode(ctx, identity.RequestMeta{IP: "198.51.100.10"}, "+998979999999"); err != nil {
		t.Fatalf("the same phone from another address: %v", err)
	}
}
