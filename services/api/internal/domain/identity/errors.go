// Package identity owns accounts, sessions, roles and account recovery rules.
package identity

import (
	"errors"
	"time"
)

// Sentinel errors. The HTTP layer maps them to stable problem codes.
var (
	ErrNotFound            = errors.New("identity: not found")
	ErrEmailTaken          = errors.New("identity: email already registered")
	ErrInvalidCredentials  = errors.New("identity: invalid credentials")
	ErrAccountBlocked      = errors.New("identity: account blocked")
	ErrInvalidToken        = errors.New("identity: invalid or expired token")
	ErrRefreshTokenInvalid = errors.New("identity: refresh token invalid")
	ErrRefreshTokenReused  = errors.New("identity: refresh token reused")
	ErrUnauthenticated     = errors.New("identity: unauthenticated")
	ErrForbidden           = errors.New("identity: forbidden")
	ErrRateLimited         = errors.New("identity: rate limited")
)

// RetryAfterError wraps a "try again later" error with the wait the caller must observe. errors.Is
// still matches the wrapped sentinel (ErrRateLimited, ErrOTPCooldown).
type RetryAfterError struct {
	Err        error
	RetryAfter time.Duration
}

func (e *RetryAfterError) Error() string { return e.Err.Error() }

// Unwrap exposes the sentinel to errors.Is.
func (e *RetryAfterError) Unwrap() error { return e.Err }

// RetryAfterOf returns the wait carried by err, rounded up to whole seconds, or zero.
func RetryAfterOf(err error) time.Duration {
	var wait *RetryAfterError
	if !errors.As(err, &wait) || wait.RetryAfter <= 0 {
		return 0
	}
	// Rounded up, so a client that waits exactly this long is never refused again.
	return (wait.RetryAfter + time.Second - 1).Truncate(time.Second)
}

// ValidationError reports one invalid input field with a stable code.
type ValidationError struct {
	Field string
	Code  string
}

func (e *ValidationError) Error() string {
	return "identity: invalid " + e.Field + ": " + e.Code
}
