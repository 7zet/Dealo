package apiapp

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dealo/dealo/services/api/internal/platform/config"
	"github.com/dealo/dealo/services/api/internal/platform/ratelimit"
	"github.com/dealo/dealo/services/api/internal/seed"
)

// These tests drive the real router on a seeded database as two buyers. Buyer A completes a purchase
// with the mock provider; buyer B then tries every buyer-scoped id of A's.

// newBuyerEnv is newMatrixEnv with the mock payment provider switched on.
func newBuyerEnv(t *testing.T) matrixEnv {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	if err := seed.Run(ctx, url); err != nil {
		t.Fatalf("seed database: %v", err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	cfg := config.Config{
		Environment:     "development",
		MediaDir:        t.TempDir(),
		DocumentsDir:    t.TempDir(),
		MediaPublicBase: "/media",
		Auth: config.AuthConfig{
			JWTSecret:       "buyer-test-secret-with-at-least-32-bytes!",
			AccessTokenTTL:  15 * time.Minute,
			RefreshTokenTTL: 24 * time.Hour,
			WebPublicURL:    "http://localhost:3000",
			BrandName:       "Dealo",
		},
		Commerce: config.CommerceConfig{
			QRSecret:            "buyer-test-qr-secret-with-32-bytes!!",
			MockPaymentsEnabled: true,
			MockWebhookSecret:   "buyer-test-mock-webhook-secret-32-bytes!",
		},
	}
	router, err := newRouter(cfg, pool, ratelimit.Disabled{}, nil, func(context.Context) error { return nil },
		slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return matrixEnv{t: t, router: router, pool: pool}
}

func (e matrixEnv) send(token, method, path string, body any, headers map[string]string) *httptest.ResponseRecorder {
	e.t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			e.t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	request := httptest.NewRequest(method, path, reader)
	request.Header.Set("Content-Type", "application/json")
	request.RemoteAddr = "192.0.2.10:4321"
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	recorder := httptest.NewRecorder()
	e.router.ServeHTTP(recorder, request)
	return recorder
}

func decodeInto(t *testing.T, recorder *httptest.ResponseRecorder, dst any) {
	t.Helper()
	if err := json.Unmarshal(recorder.Body.Bytes(), dst); err != nil {
		t.Fatalf("decode %s: %v", recorder.Body.String(), err)
	}
}

type purchase struct {
	optionID  uuid.UUID
	orderID   string
	voucherID string
	price     int64
	title     string
	terms     string
}

// buy makes buyer A purchase one unit of a sellable seeded option through the HTTP API.
func (e matrixEnv) buy(token string) purchase {
	e.t.Helper()
	ctx := context.Background()
	var p purchase
	if err := e.pool.QueryRow(ctx, `
		SELECT o.id, o.deal_price, o.title->>'en', d.terms->>'en' FROM deal_options o
		JOIN deals d ON d.id = o.deal_id
		JOIN merchants m ON m.id = d.merchant_id
		JOIN categories c ON c.id = d.category_id
		WHERE d.status = 'active' AND d.ends_at > now() AND o.is_active AND m.review_status = 'approved'
		  AND c.purchasable AND (d.voucher_valid_until IS NULL OR d.voucher_valid_until > now() + interval '1 day')
		ORDER BY o.id LIMIT 1`).Scan(&p.optionID, &p.price, &p.title, &p.terms); err != nil {
		e.t.Fatal(err)
	}
	if _, err := e.pool.Exec(ctx, `UPDATE deal_options SET stock_total = stock_sold + stock_reserved + 5 WHERE id = $1`, p.optionID); err != nil {
		e.t.Fatal(err)
	}

	created := e.send(token, http.MethodPost, "/api/v1/orders",
		map[string]any{"items": []map[string]any{{"deal_option_id": p.optionID, "quantity": 1}}},
		map[string]string{"Idempotency-Key": uuid.NewString()})
	if created.Code != http.StatusCreated && created.Code != http.StatusOK {
		e.t.Fatalf("create order: %d %s", created.Code, created.Body.String())
	}
	var order struct {
		ID string `json:"id"`
	}
	decodeInto(e.t, created, &order)
	p.orderID = order.ID

	paid := e.send(token, http.MethodPost, "/api/v1/orders/"+p.orderID+"/pay",
		map[string]any{"provider": "mock", "terms_accepted": true}, nil)
	if paid.Code != http.StatusOK {
		e.t.Fatalf("pay order: %d %s", paid.Code, paid.Body.String())
	}
	var session struct {
		PaymentID string `json:"payment_id"`
	}
	decodeInto(e.t, paid, &session)
	completed := e.send("", http.MethodPost, "/api/v1/payments/mock/"+session.PaymentID+"/complete",
		map[string]string{"outcome": "succeeded"}, nil)
	if completed.Code != http.StatusAccepted {
		e.t.Fatalf("complete payment: %d %s", completed.Code, completed.Body.String())
	}

	if err := e.pool.QueryRow(ctx, `
		SELECT v.id::text FROM vouchers v JOIN order_items oi ON oi.id = v.order_item_id
		WHERE oi.order_id = $1 LIMIT 1`, p.orderID).Scan(&p.voucherID); err != nil {
		e.t.Fatalf("voucher for order %s: %v", p.orderID, err)
	}
	return p
}

// AT IDOR: buyer B must not see or act on buyer A's order, voucher or QR, by id or by listing.
func TestBuyerCannotReachAnotherBuyersOrderVoucherOrQR(t *testing.T) {
	e := newBuyerEnv(t)
	_, phoneA := e.newUser(nil)
	_, phoneB := e.newUser(nil)
	tokenA, tokenB := e.signIn(phoneA), e.signIn(phoneB)
	p := e.buy(tokenA)

	// A sees their own order and voucher, including the QR token.
	if got := e.send(tokenA, http.MethodGet, "/api/v1/me/orders/"+p.orderID, nil, nil); got.Code != http.StatusOK {
		t.Fatalf("A reads own order: %d %s", got.Code, got.Body.String())
	}
	own := e.send(tokenA, http.MethodGet, "/api/v1/me/vouchers/"+p.voucherID, nil, nil)
	if own.Code != http.StatusOK {
		t.Fatalf("A reads own voucher: %d %s", own.Code, own.Body.String())
	}
	var voucher struct {
		QRToken    string `json:"qr_token"`
		Code       string `json:"code"`
		BackupCode string `json:"backup_code"`
	}
	decodeInto(t, own, &voucher)
	if voucher.QRToken == "" {
		t.Fatal("own voucher has no QR token")
	}

	// B gets a plain 404 for every A id: the answer does not even confirm the id exists.
	for _, probe := range []struct {
		method, path string
		body         any
		code         string
	}{
		{http.MethodGet, "/api/v1/me/orders/" + p.orderID, nil, "order_not_found"},
		{http.MethodGet, "/api/v1/me/vouchers/" + p.voucherID, nil, "voucher_not_found"},
		{http.MethodPost, "/api/v1/orders/" + p.orderID + "/pay", map[string]any{"provider": "mock", "terms_accepted": true}, "order_not_found"},
		{http.MethodPost, "/api/v1/me/vouchers/" + p.voucherID + "/refund", map[string]string{"reason": "not mine"}, "not_found"},
		{http.MethodPost, "/api/v1/me/vouchers/" + p.voucherID + "/dispute", map[string]string{"reason": "not mine"}, "not_found"},
	} {
		got := e.send(tokenB, probe.method, probe.path, probe.body, nil)
		if got.Code != http.StatusNotFound || problemCodeOf(got) != probe.code {
			t.Errorf("B %s %s = %d %s, want 404 %s", probe.method, probe.path, got.Code, got.Body.String(), probe.code)
		}
		for _, secret := range []string{voucher.QRToken, voucher.Code, voucher.BackupCode} {
			if secret != "" && bytes.Contains(got.Body.Bytes(), []byte(secret)) {
				t.Errorf("B %s %s leaked a voucher secret", probe.method, probe.path)
			}
		}
	}

	// B's own lists do not contain A's order or voucher.
	for _, path := range []string{"/api/v1/me/orders", "/api/v1/me/vouchers"} {
		got := e.send(tokenB, http.MethodGet, path, nil, nil)
		if got.Code != http.StatusOK {
			t.Fatalf("B lists %s: %d %s", path, got.Code, got.Body.String())
		}
		for _, id := range []string{p.orderID, p.voucherID, voucher.QRToken} {
			if bytes.Contains(got.Body.Bytes(), []byte(id)) {
				t.Errorf("B's %s contains A's %s", path, id)
			}
		}
	}

	// Without a session nothing is readable.
	for _, path := range []string{"/api/v1/me/orders/" + p.orderID, "/api/v1/me/vouchers/" + p.voucherID} {
		if got := e.send("", http.MethodGet, path, nil, nil); got.Code != http.StatusUnauthorized {
			t.Errorf("anonymous GET %s = %d, want 401", path, got.Code)
		}
	}

	// B's refund and dispute attempts changed nothing.
	var status string
	var refunds, disputes int
	if err := e.pool.QueryRow(context.Background(), `
		SELECT v.status::text,
		       (SELECT COUNT(*) FROM refunds r WHERE r.voucher_id = v.id),
		       (SELECT COUNT(*) FROM disputes x JOIN redemptions rd ON rd.id = x.redemption_id WHERE rd.voucher_id = v.id)
		FROM vouchers v WHERE v.id = $1`, p.voucherID).Scan(&status, &refunds, &disputes); err != nil {
		t.Fatal(err)
	}
	if status != "active" || refunds != 0 || disputes != 0 {
		t.Fatalf("A's voucher after B's attempts: status=%s refunds=%d disputes=%d", status, refunds, disputes)
	}
}

// AT-06 at the HTTP level: after a purchase the merchant changes the option title and price and the
// deal terms. The buyer's order and voucher responses still carry what the buyer agreed to.
func TestBuyerSeesTheAgreedSnapshotAfterTheDealChanges(t *testing.T) {
	e := newBuyerEnv(t)
	_, phone := e.newUser(nil)
	token := e.signIn(phone)
	p := e.buy(token)

	ctx := context.Background()
	if _, err := e.pool.Exec(ctx, `
		UPDATE deal_options SET deal_price = deal_price + 500000, original_price = original_price + 500000,
		       title = '{"uz":"Yangi nom","ru":"Новое имя","en":"Renamed option"}'
		WHERE id = $1`, p.optionID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.pool.Exec(ctx, `
		UPDATE deals SET terms = '{"uz":"Yangi shart","ru":"Новое условие","en":"New term"}'
		WHERE id = (SELECT deal_id FROM deal_options WHERE id = $1)`, p.optionID); err != nil {
		t.Fatal(err)
	}

	orderResp := e.send(token, http.MethodGet, "/api/v1/me/orders/"+p.orderID, nil, nil)
	var order struct {
		Total struct{ Amount int64 } `json:"total"`
		Items []struct {
			TitleSnapshot struct{ En string }    `json:"title_snapshot"`
			TermsSnapshot struct{ En string }    `json:"terms_snapshot"`
			UnitPrice     struct{ Amount int64 } `json:"unit_price"`
		} `json:"items"`
	}
	decodeInto(t, orderResp, &order)
	if len(order.Items) != 1 {
		t.Fatalf("order items: %s", orderResp.Body.String())
	}
	item := order.Items[0]
	if order.Total.Amount != p.price || item.UnitPrice.Amount != p.price || item.TitleSnapshot.En != p.title || item.TermsSnapshot.En != p.terms {
		t.Fatalf("order changed after the deal edit: total=%d item=%+v; want price %d title %q terms %q",
			order.Total.Amount, item, p.price, p.title, p.terms)
	}

	for _, path := range []string{"/api/v1/me/vouchers/" + p.voucherID, "/api/v1/me/vouchers?status=active"} {
		resp := e.send(token, http.MethodGet, path, nil, nil)
		var one struct {
			ID                string                  `json:"id"`
			TitleSnapshot     *struct{ En string }    `json:"title_snapshot"`
			TermsSnapshot     struct{ En string }     `json:"terms_snapshot"`
			UnitPriceSnapshot *struct{ Amount int64 } `json:"unit_price_snapshot"`
		}
		if path == "/api/v1/me/vouchers/"+p.voucherID {
			decodeInto(t, resp, &one)
		} else {
			var page struct {
				Items []json.RawMessage `json:"items"`
			}
			decodeInto(t, resp, &page)
			for _, raw := range page.Items {
				if err := json.Unmarshal(raw, &one); err != nil {
					t.Fatal(err)
				}
				if one.ID == p.voucherID {
					break
				}
			}
		}
		if one.ID != p.voucherID {
			t.Fatalf("%s: voucher %s not found in %s", path, p.voucherID, resp.Body.String())
		}
		if one.TitleSnapshot == nil || one.TitleSnapshot.En != p.title {
			t.Errorf("%s: title snapshot = %+v, want %q", path, one.TitleSnapshot, p.title)
		}
		if one.UnitPriceSnapshot == nil || one.UnitPriceSnapshot.Amount != p.price {
			t.Errorf("%s: price snapshot = %+v, want %d", path, one.UnitPriceSnapshot, p.price)
		}
		if one.TermsSnapshot.En != p.terms {
			t.Errorf("%s: terms snapshot = %q, want %q", path, one.TermsSnapshot.En, p.terms)
		}
	}
}
