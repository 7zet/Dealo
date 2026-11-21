package ratelimit

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/grupon/grupon/services/api/internal/domain/identity"
)

func TestRedisLimiterCountsWithinWindowAndReportsTheWait(t *testing.T) {
	url := os.Getenv("TEST_REDIS_URL")
	if url == "" {
		t.Skip("TEST_REDIS_URL is not set")
	}
	options, err := redis.ParseURL(url)
	if err != nil {
		t.Fatal(err)
	}
	client := redis.NewClient(options)
	t.Cleanup(func() { _ = client.Close() })

	ctx := context.Background()
	limiter := NewRedis(client)
	rule := identity.RateRule{Limit: 2, Window: time.Minute}
	key := "test:" + uuid.NewString()
	other := "test:" + uuid.NewString()
	t.Cleanup(func() { client.Del(ctx, keyPrefix+key, keyPrefix+other) })

	for i := 1; i <= 2; i++ {
		decision, err := limiter.Allow(ctx, key, rule)
		if err != nil || !decision.Allowed {
			t.Fatalf("attempt %d = %+v, %v; want allowed", i, decision, err)
		}
	}
	decision, err := limiter.Allow(ctx, key, rule)
	if err != nil || decision.Allowed {
		t.Fatalf("attempt 3 = %+v, %v; want denied", decision, err)
	}
	if decision.RetryAfter <= 0 || decision.RetryAfter > time.Minute {
		t.Fatalf("retry after = %v, want the rest of the window", decision.RetryAfter)
	}
	// Another key has its own counter.
	if decision, err := limiter.Allow(ctx, other, rule); err != nil || !decision.Allowed {
		t.Fatalf("other key = %+v, %v; want allowed", decision, err)
	}
}

func TestDisabledLimiterAllowsEverything(t *testing.T) {
	decision, err := Disabled{}.Allow(context.Background(), "any", identity.RateRule{Limit: 0, Window: time.Minute})
	if err != nil || !decision.Allowed {
		t.Fatalf("Disabled.Allow() = %+v, %v", decision, err)
	}
}
