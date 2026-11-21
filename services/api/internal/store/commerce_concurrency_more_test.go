package store_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/grupon/grupon/services/api/internal/domain/commerce"
	"github.com/grupon/grupon/services/api/internal/platform/mail"
	"github.com/grupon/grupon/services/api/internal/store"
)

// More AT-03 races: the last unit, multi-unit orders and multi-item orders. Every case checks the
// database invariant stock_sold + stock_reserved <= stock_total afterwards, and that failed orders
// leave no reservation behind.

func raceService(t *testing.T, pool *pgxpool.Pool) *commerce.Service {
	t.Helper()
	signer, err := commerce.NewQRSigner("test-qr-secret-with-at-least-32-bytes!!")
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	service, err := commerce.NewService(commerce.Dependencies{
		Repository: store.NewCommerceRepository(pool),
		Deals:      store.NewCatalogRepository(pool),
		Signer:     signer,
		Mailer:     mail.NewLogSender(logger),
		Logger:     logger,
		Now:        time.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	return service
}

// sellableOptions returns n options of n different sellable deals and lets each buyer take up to
// maxPerUser units of each deal. The deal limits are restored after the test.
func sellableOptions(t *testing.T, pool *pgxpool.Pool, n, maxPerUser int) []uuid.UUID {
	t.Helper()
	ctx := context.Background()
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT ON (d.id) o.id, d.id, d.max_per_user FROM deal_options o
		JOIN deals d ON d.id = o.deal_id
		JOIN merchants m ON m.id = d.merchant_id
		JOIN categories c ON c.id = d.category_id
		WHERE d.status = 'active' AND d.ends_at > now() AND o.is_active AND m.review_status = 'approved'
		  AND c.purchasable AND (d.voucher_valid_until IS NULL OR d.voucher_valid_until > now() + interval '1 day')
		ORDER BY d.id, o.id
		LIMIT $1`, n)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var options []uuid.UUID
	for rows.Next() {
		var optionID, dealID uuid.UUID
		var previous int
		if err := rows.Scan(&optionID, &dealID, &previous); err != nil {
			t.Fatal(err)
		}
		options = append(options, optionID)
		t.Cleanup(func() {
			_, _ = pool.Exec(context.Background(), `UPDATE deals SET max_per_user = $2 WHERE id = $1`, dealID, previous)
		})
	}
	if len(options) != n {
		t.Fatalf("found %d sellable deals, want %d", len(options), n)
	}
	for _, optionID := range options {
		if _, err := pool.Exec(ctx, `UPDATE deals SET max_per_user = $2 WHERE id = (SELECT deal_id FROM deal_options WHERE id = $1)`,
			optionID, maxPerUser); err != nil {
			t.Fatal(err)
		}
	}
	return options
}

// leaveFree sets the option so that exactly free units are sellable and returns the reserved count.
func leaveFree(t *testing.T, pool *pgxpool.Pool, optionID uuid.UUID, free int) int {
	t.Helper()
	var reserved int
	if err := pool.QueryRow(context.Background(), `
		UPDATE deal_options SET stock_total = stock_sold + stock_reserved + $2 WHERE id = $1
		RETURNING stock_reserved`, optionID, free).Scan(&reserved); err != nil {
		t.Fatal(err)
	}
	return reserved
}

func newBuyers(t *testing.T, pool *pgxpool.Pool, n int) []uuid.UUID {
	t.Helper()
	ids := make([]uuid.UUID, 0, n)
	for i := 0; i < n; i++ {
		var id uuid.UUID
		if err := pool.QueryRow(context.Background(), `INSERT INTO users (email, name) VALUES ($1, 'Race buyer') RETURNING id`,
			fmt.Sprintf("race-%s@test.local", uuid.NewString())).Scan(&id); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	return ids
}

// race starts every order at the same moment and returns the successful orders and the errors.
func race(service *commerce.Service, buyers []uuid.UUID, items func(i int) []commerce.OrderItemInput) ([]commerce.Order, []error) {
	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		orders []commerce.Order
		errs   []error
		start  = make(chan struct{})
	)
	for i, buyer := range buyers {
		wg.Add(1)
		go func(i int, buyer uuid.UUID) {
			defer wg.Done()
			<-start
			order, _, err := service.CreateOrder(context.Background(), buyer, commerce.OrderInput{
				IdempotencyKey: uuid.NewString(), Items: items(i),
			})
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errs = append(errs, err)
				return
			}
			orders = append(orders, order)
		}(i, buyer)
	}
	close(start)
	wg.Wait()
	return orders, errs
}

func stockOf(t *testing.T, pool *pgxpool.Pool, optionID uuid.UUID) (reserved, sold, total int) {
	t.Helper()
	if err := pool.QueryRow(context.Background(),
		`SELECT stock_reserved, stock_sold, stock_total FROM deal_options WHERE id = $1`, optionID,
	).Scan(&reserved, &sold, &total); err != nil {
		t.Fatal(err)
	}
	if reserved+sold > total || reserved < 0 || sold < 0 {
		t.Fatalf("stock invariant broken: reserved=%d sold=%d total=%d", reserved, sold, total)
	}
	return reserved, sold, total
}

func onlyInsufficientStock(t *testing.T, errs []error) {
	t.Helper()
	for _, err := range errs {
		if !errors.Is(err, commerce.ErrInsufficientStock) {
			t.Fatalf("losing order failed with %v, want ErrInsufficientStock", err)
		}
	}
}

// Two buyers press "buy" on the last unit within the same millisecond, 25 times over.
func TestLastUnitGoesToExactlyOneOfTwoBuyers(t *testing.T) {
	fixture := newCatalogFixture(t)
	service := raceService(t, fixture.pool)
	option := sellableOptions(t, fixture.pool, 1, 1)[0]

	for round := 0; round < 25; round++ {
		before := leaveFree(t, fixture.pool, option, 1)
		buyers := newBuyers(t, fixture.pool, 2)
		orders, errs := race(service, buyers, func(int) []commerce.OrderItemInput {
			return []commerce.OrderItemInput{{OptionID: option, Quantity: 1}}
		})
		if len(orders) != 1 || len(errs) != 1 {
			t.Fatalf("round %d: %d orders, %d failures; want exactly one of each", round, len(orders), len(errs))
		}
		onlyInsufficientStock(t, errs)
		if reserved, _, _ := stockOf(t, fixture.pool, option); reserved != before+1 {
			t.Fatalf("round %d: reserved %d, want %d", round, reserved, before+1)
		}
	}
}

// Orders for two units at once: 5 free units and 20 buyers wanting 2 each. Two orders fit; the fifth
// unit stays free because no order may take a partial quantity.
func TestMultiUnitOrdersNeverOversell(t *testing.T) {
	fixture := newCatalogFixture(t)
	service := raceService(t, fixture.pool)
	option := sellableOptions(t, fixture.pool, 1, 10)[0]
	before := leaveFree(t, fixture.pool, option, 5)

	orders, errs := race(service, newBuyers(t, fixture.pool, 20), func(int) []commerce.OrderItemInput {
		return []commerce.OrderItemInput{{OptionID: option, Quantity: 2}}
	})
	if len(orders) != 2 {
		t.Fatalf("%d orders succeeded, want 2", len(orders))
	}
	onlyInsufficientStock(t, errs)
	reserved, sold, total := stockOf(t, fixture.pool, option)
	if reserved != before+4 || total-sold-reserved != 1 {
		t.Fatalf("reserved=%d (before %d) free=%d; want 4 more reserved and 1 free", reserved, before, total-sold-reserved)
	}
}

// An order for two different deals is all or nothing. Buyers list the items in opposite orders, which
// would deadlock without the fixed reservation order. Losing orders must release what they reserved
// first, so the plentiful option is reserved exactly once.
func TestMultiItemOrdersAreAllOrNothingAndDoNotDeadlock(t *testing.T) {
	fixture := newCatalogFixture(t)
	service := raceService(t, fixture.pool)
	options := sellableOptions(t, fixture.pool, 2, 1)
	plenty, scarce := options[0], options[1]
	plentyBefore := leaveFree(t, fixture.pool, plenty, 10)
	scarceBefore := leaveFree(t, fixture.pool, scarce, 1)

	buyers := newBuyers(t, fixture.pool, 12)
	done := make(chan struct{})
	var orders []commerce.Order
	var errs []error
	go func() {
		defer close(done)
		orders, errs = race(service, buyers, func(i int) []commerce.OrderItemInput {
			items := []commerce.OrderItemInput{{OptionID: plenty, Quantity: 1}, {OptionID: scarce, Quantity: 1}}
			if i%2 == 1 {
				items[0], items[1] = items[1], items[0]
			}
			return items
		})
	}()
	select {
	case <-done:
	case <-time.After(30 * time.Second):
		t.Fatal("concurrent multi-item orders did not finish: deadlock")
	}

	if len(orders) != 1 {
		t.Fatalf("%d orders succeeded, want exactly 1", len(orders))
	}
	onlyInsufficientStock(t, errs)
	if reserved, _, _ := stockOf(t, fixture.pool, plenty); reserved != plentyBefore+1 {
		t.Fatalf("plentiful option reserved %d, want %d: a failed order kept its reservation", reserved, plentyBefore+1)
	}
	if reserved, _, _ := stockOf(t, fixture.pool, scarce); reserved != scarceBefore+1 {
		t.Fatalf("scarce option reserved %d, want %d", reserved, scarceBefore+1)
	}
}
