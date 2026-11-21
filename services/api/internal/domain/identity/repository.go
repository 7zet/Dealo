package identity

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Repository is the persistence port for identity. Implementations live in internal/store.
type Repository interface {
	// CreateUser inserts an account and grants it the user role in one transaction.
	// It returns ErrEmailTaken when the email is already in use.
	CreateUser(ctx context.Context, input NewUser) (User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (User, error)
	UpdateProfile(ctx context.Context, id uuid.UUID, update ProfileUpdate) (User, error)
	TouchLastLogin(ctx context.Context, id uuid.UUID) error
	SoftDeleteUser(ctx context.Context, id uuid.UUID) error
	ListRoles(ctx context.Context, id uuid.UUID) ([]Role, error)
	// ListMemberships returns the merchant workspaces of the user, without soft-deleted merchants.
	ListMemberships(ctx context.Context, id uuid.UUID) ([]Membership, error)

	CreateRefreshToken(ctx context.Context, token RefreshToken) error
	GetRefreshTokenByHash(ctx context.Context, hash string) (RefreshToken, error)
	// RotateRefreshToken revokes the current token and inserts next in one transaction. It returns
	// ErrRefreshTokenReused when the current token was already claimed by another request.
	RotateRefreshToken(ctx context.Context, currentID uuid.UUID, next RefreshToken) error
	RevokeRefreshTokenByHash(ctx context.Context, hash string) error
	RevokeRefreshFamily(ctx context.Context, familyID uuid.UUID) error
	// RevokeUserSessions revokes every refresh token of the user, except the family keep when set.
	RevokeUserSessions(ctx context.Context, id uuid.UUID, keep *uuid.UUID) error

	GetUserByPhone(ctx context.Context, phone string) (User, error)
	CreatePhoneUser(ctx context.Context, phone, email string) (User, error)
	InsertPhoneOTP(ctx context.Context, phone, codeHash string, expiresAt time.Time) error
	LatestPhoneOTP(ctx context.Context, phone string) (PhoneOTP, error)
	LatestIssuedPhoneOTP(ctx context.Context, phone string) (PhoneOTP, error)
	IncrementPhoneOTPAttempts(ctx context.Context, id uuid.UUID) error
	ConsumePhoneOTP(ctx context.Context, id uuid.UUID) (bool, error)
}

// RateRule is how many attempts one key may spend in one fixed window. The domain owns the rules;
// the limiter only counts.
type RateRule struct {
	Limit  int
	Window time.Duration
}

// RateDecision reports whether an attempt is within its rule and, when it is not, how long the
// caller must wait until the window resets.
type RateDecision struct {
	Allowed    bool
	RetryAfter time.Duration
}

// RateLimiter counts attempts per key under the given rule.
type RateLimiter interface {
	Allow(ctx context.Context, key string, rule RateRule) (RateDecision, error)
}
