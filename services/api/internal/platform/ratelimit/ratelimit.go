// Package ratelimit provides fixed-window attempt counters backed by Redis.
package ratelimit

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"github.com/grupon/grupon/services/api/internal/domain/identity"
)

const keyPrefix = "ratelimit:"

// Redis counts attempts per key in fixed windows. The first attempt sets the window expiry; the
// limit and window come from the rule of each call, so different keys can follow different rules.
type Redis struct {
	client *redis.Client
}

var _ identity.RateLimiter = (*Redis)(nil)

// NewRedis returns a limiter that stores its counters in Redis.
func NewRedis(client *redis.Client) *Redis {
	return &Redis{client: client}
}

// Allow records one attempt and reports whether it is within the rule. A denied attempt carries the
// time left until the key's window resets.
func (r *Redis) Allow(ctx context.Context, key string, rule identity.RateRule) (identity.RateDecision, error) {
	fullKey := keyPrefix + key
	pipe := r.client.TxPipeline()
	incr := pipe.Incr(ctx, fullKey)
	pipe.ExpireNX(ctx, fullKey, rule.Window)
	ttl := pipe.PTTL(ctx, fullKey)
	if _, err := pipe.Exec(ctx); err != nil {
		return identity.RateDecision{}, fmt.Errorf("record rate limit attempt: %w", err)
	}
	if incr.Val() <= int64(rule.Limit) {
		return identity.RateDecision{Allowed: true}, nil
	}
	wait := ttl.Val()
	if wait <= 0 || wait > rule.Window {
		wait = rule.Window
	}
	return identity.RateDecision{RetryAfter: wait}, nil
}

// Disabled allows every attempt. It is used when Redis is not configured.
type Disabled struct{}

// Allow always permits the attempt.
func (Disabled) Allow(context.Context, string, identity.RateRule) (identity.RateDecision, error) {
	return identity.RateDecision{Allowed: true}, nil
}
