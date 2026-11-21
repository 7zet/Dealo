package apiapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/grupon/grupon/services/api/internal/platform/config"
	"github.com/grupon/grupon/services/api/internal/platform/ratelimit"
	"github.com/grupon/grupon/services/api/internal/seed"
)

// These tests drive the real router on a seeded database and check every merchant and admin
// operation against every role. The operation lists come from the router itself, so a new endpoint
// without a row in the tables below fails the test.

type matrixEnv struct {
	t      *testing.T
	router http.Handler
	pool   *pgxpool.Pool
}

func newMatrixEnv(t *testing.T) matrixEnv {
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
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := config.Config{
		Environment:     "development",
		MediaDir:        t.TempDir(),
		DocumentsDir:    t.TempDir(),
		MediaPublicBase: "/media",
		Auth: config.AuthConfig{
			JWTSecret:       "matrix-test-secret-with-at-least-32-bytes",
			AccessTokenTTL:  15 * time.Minute,
			RefreshTokenTTL: 24 * time.Hour,
			WebPublicURL:    "http://localhost:3000",
			BrandName:       "Grupon",
		},
		Commerce: config.CommerceConfig{QRSecret: "matrix-test-qr-secret-with-32-bytes!!"},
	}
	router, err := newRouter(cfg, pool, ratelimit.Disabled{}, nil, func(context.Context) error { return nil }, logger)
	if err != nil {
		t.Fatal(err)
	}
	return matrixEnv{t: t, router: router, pool: pool}
}

// routes lists "METHOD /path" for every route under one of the prefixes.
func (e matrixEnv) routes(prefixes ...string) []string {
	e.t.Helper()
	routes, ok := e.router.(chi.Routes)
	if !ok {
		e.t.Fatal("router does not expose its routes")
	}
	var out []string
	if err := chi.Walk(routes, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		for _, prefix := range prefixes {
			if strings.HasPrefix(route, prefix) {
				out = append(out, method+" "+route)
				break
			}
		}
		return nil
	}); err != nil {
		e.t.Fatal(err)
	}
	sort.Strings(out)
	return out
}

// newUser inserts an account with a fresh phone and the given roles. A merchant role takes merchantID.
func (e matrixEnv) newUser(merchantID *uuid.UUID, roles ...string) (uuid.UUID, string) {
	e.t.Helper()
	ctx := context.Background()
	for attempt := 0; attempt < 20; attempt++ {
		phone := fmt.Sprintf("+99891%07d", rand.Intn(10_000_000))
		var id uuid.UUID
		err := e.pool.QueryRow(ctx, `INSERT INTO users (email, name, phone) VALUES ($1, 'Matrix User', $2) RETURNING id`,
			uuid.NewString()+"@matrix.test", phone).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "users_phone_key") {
				continue
			}
			e.t.Fatal(err)
		}
		if _, err := e.pool.Exec(ctx, `INSERT INTO role_assignments (user_id, role) VALUES ($1, 'user')`, id); err != nil {
			e.t.Fatal(err)
		}
		for _, role := range roles {
			var merchant any
			if strings.HasPrefix(role, "merchant_") {
				merchant = *merchantID
			}
			if _, err := e.pool.Exec(ctx, `INSERT INTO role_assignments (user_id, role, merchant_id) VALUES ($1, $2::app_role, $3)`,
				id, role, merchant); err != nil {
				e.t.Fatal(err)
			}
		}
		return id, phone
	}
	e.t.Fatal("no free phone")
	return uuid.Nil, ""
}

// signIn runs the phone OTP flow (the development code is echoed) and returns the access token.
func (e matrixEnv) signIn(phone string) string {
	e.t.Helper()
	sent := e.call("", http.MethodPost, "/api/v1/auth/phone/code", map[string]string{"phone": phone})
	var code struct {
		DevCode string `json:"dev_code"`
	}
	if sent.Code != http.StatusOK && sent.Code != http.StatusAccepted {
		e.t.Fatalf("request code for %s: %d %s", phone, sent.Code, sent.Body.String())
	}
	if err := json.Unmarshal(sent.Body.Bytes(), &code); err != nil || code.DevCode == "" {
		e.t.Fatalf("no dev code for %s: %s", phone, sent.Body.String())
	}
	verified := e.call("", http.MethodPost, "/api/v1/auth/phone/verify", map[string]string{"phone": phone, "code": code.DevCode})
	var session struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(verified.Body.Bytes(), &session); err != nil || session.AccessToken == "" {
		e.t.Fatalf("verify %s: %d %s", phone, verified.Code, verified.Body.String())
	}
	return session.AccessToken
}

func (e matrixEnv) call(token, method, path string, body any) *httptest.ResponseRecorder {
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
	recorder := httptest.NewRecorder()
	e.router.ServeHTTP(recorder, request)
	return recorder
}

func (e matrixEnv) id(query string, args ...any) uuid.UUID {
	e.t.Helper()
	var id uuid.UUID
	if err := e.pool.QueryRow(context.Background(), query, args...).Scan(&id); err != nil {
		e.t.Fatalf("lookup %q: %v", query, err)
	}
	return id
}

func containsAny(text string, needles []string) bool {
	for _, needle := range needles {
		if strings.Contains(text, needle) {
			return true
		}
	}
	return false
}

// responseWithoutInstance drops the problem "instance" member, which echoes the request path.
func responseWithoutInstance(recorder *httptest.ResponseRecorder) string {
	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		return recorder.Body.String()
	}
	delete(body, "instance")
	out, _ := json.Marshal(body)
	return string(out)
}

func problemCodeOf(recorder *httptest.ResponseRecorder) string {
	var problem struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &problem)
	return problem.Code
}

// opRule is one row of a matrix: the route, how to fill its path, and who may use it.
type opRule struct {
	route   string // "METHOD /pattern" exactly as the router lists it
	path    string // concrete path with ids and required query parameters
	allowed map[string]bool
}

func roleSet(roles ...string) map[string]bool {
	set := map[string]bool{}
	for _, role := range roles {
		set[role] = true
	}
	return set
}

// checkCoverage fails when the router and the table disagree, so every operation is in the matrix.
func checkCoverage(t *testing.T, routes []string, rules []opRule) {
	t.Helper()
	inTable := map[string]bool{}
	for _, rule := range rules {
		if inTable[rule.route] {
			t.Errorf("route %s is listed twice", rule.route)
		}
		inTable[rule.route] = true
	}
	inRouter := map[string]bool{}
	for _, route := range routes {
		inRouter[route] = true
		if !inTable[route] {
			t.Errorf("route %s has no row in the authorization matrix", route)
		}
	}
	for route := range inTable {
		if !inRouter[route] {
			t.Errorf("matrix row %s is not a route", route)
		}
	}
	if t.Failed() {
		t.FailNow()
	}
}

func splitRoute(route string) (string, string) {
	method, path, _ := strings.Cut(route, " ")
	return method, path
}

// TestMerchantAuthorizationMatrix checks every /api/v1/merchant operation for the owner, manager and
// cashier of business A, a plain user, and the owner of business B. Ids in paths belong to business A,
// so business B's owner must never read or change them.
func TestMerchantAuthorizationMatrix(t *testing.T) {
	env := newMatrixEnv(t)
	ctx := context.Background()

	merchantA := env.id(`SELECT id FROM merchants WHERE slug = 'seed-merchant-01'`)
	dealA := env.id(`SELECT id FROM deals WHERE merchant_id = $1 ORDER BY id LIMIT 1`, merchantA)
	locationA := env.id(`SELECT id FROM merchant_locations WHERE merchant_id = $1 ORDER BY id LIMIT 1`, merchantA)
	reviewA := env.id(`SELECT id FROM reviews WHERE merchant_id = $1 ORDER BY id LIMIT 1`, merchantA)
	voucherA := env.id(`SELECT id FROM vouchers WHERE merchant_id = $1 ORDER BY id LIMIT 1`, merchantA)
	mediaA := env.id(`INSERT INTO merchant_media_assets (merchant_id, filename, content_type, size, storage_key)
		VALUES ($1, 'matrix.jpg', 'image/jpeg', 10, $2) RETURNING id`, merchantA, "matrix/"+uuid.NewString()+".jpg")
	_, managerPhone := env.newUser(&merchantA, "merchant_manager")
	spareID, _ := env.newUser(&merchantA, "merchant_cashier")
	staffA := env.id(`SELECT id FROM role_assignments WHERE user_id = $1 AND merchant_id = $2`, spareID, merchantA)

	tokens := map[string]string{
		"owner":   env.signIn("+998900000002"),
		"manager": env.signIn(managerPhone),
		"cashier": env.signIn("+998900000003"),
		"user":    env.signIn("+998900000001"),
		"other":   env.signIn("+998900000005"), // owner of seed-merchant-02
	}

	view := roleSet("owner", "manager", "other")
	edit := roleSet("owner", "manager", "other")
	ownerOnly := roleSet("owner", "other")
	redeem := roleSet("owner", "manager", "cashier", "other")
	signedIn := roleSet("owner", "manager", "cashier", "user", "other")
	today := time.Now().Format("2006-01-02")
	rules := []opRule{
		{"GET /api/v1/merchant/dashboard", "/api/v1/merchant/dashboard", view},
		{"GET /api/v1/merchant/business", "/api/v1/merchant/business", view},
		{"PATCH /api/v1/merchant/business", "/api/v1/merchant/business", edit},
		{"GET /api/v1/merchant/locations", "/api/v1/merchant/locations", redeem},
		{"POST /api/v1/merchant/locations", "/api/v1/merchant/locations", edit},
		{"PATCH /api/v1/merchant/locations/{id}", "/api/v1/merchant/locations/" + locationA.String(), edit},
		{"DELETE /api/v1/merchant/locations/{id}", "/api/v1/merchant/locations/" + locationA.String(), edit},
		{"GET /api/v1/merchant/deals", "/api/v1/merchant/deals", view},
		{"POST /api/v1/merchant/deals", "/api/v1/merchant/deals", edit},
		{"GET /api/v1/merchant/deals/{id}", "/api/v1/merchant/deals/" + dealA.String(), view},
		{"PUT /api/v1/merchant/deals/{id}", "/api/v1/merchant/deals/" + dealA.String(), edit},
		{"DELETE /api/v1/merchant/deals/{id}", "/api/v1/merchant/deals/" + dealA.String(), edit},
		{"POST /api/v1/merchant/deals/{id}/submit", "/api/v1/merchant/deals/" + dealA.String() + "/submit", edit},
		{"GET /api/v1/merchant/orders", "/api/v1/merchant/orders", view},
		{"GET /api/v1/merchant/customers", "/api/v1/merchant/customers", view},
		{"GET /api/v1/merchant/analytics", "/api/v1/merchant/analytics?from=2026-01-01&to=" + today, view},
		{"GET /api/v1/merchant/payouts", "/api/v1/merchant/payouts", view},
		{"GET /api/v1/merchant/reviews", "/api/v1/merchant/reviews", view},
		{"PUT /api/v1/merchant/reviews/{id}/reply", "/api/v1/merchant/reviews/" + reviewA.String() + "/reply", edit},
		{"GET /api/v1/merchant/media", "/api/v1/merchant/media", view},
		{"POST /api/v1/merchant/media", "/api/v1/merchant/media", edit},
		{"PUT /api/v1/merchant/media/{id}/content", "/api/v1/merchant/media/" + mediaA.String() + "/content", edit},
		{"DELETE /api/v1/merchant/media/{id}", "/api/v1/merchant/media/" + mediaA.String(), edit},
		{"GET /api/v1/merchant/settings", "/api/v1/merchant/settings", view},
		{"PATCH /api/v1/merchant/settings", "/api/v1/merchant/settings", edit},
		{"GET /api/v1/merchant/staff", "/api/v1/merchant/staff", view},
		{"POST /api/v1/merchant/staff", "/api/v1/merchant/staff", ownerOnly},
		{"PATCH /api/v1/merchant/staff/{id}", "/api/v1/merchant/staff/" + staffA.String(), ownerOnly},
		{"DELETE /api/v1/merchant/staff/{id}", "/api/v1/merchant/staff/" + staffA.String(), ownerOnly},
		{"POST /api/v1/merchant/vouchers/lookup", "/api/v1/merchant/vouchers/lookup", redeem},
		{"POST /api/v1/merchant/vouchers/{id}/redeem", "/api/v1/merchant/vouchers/" + voucherA.String() + "/redeem", redeem},
		// A random voucher: reversing a real one depends on who redeemed it, which the redemption rules
		// decide after the permission check. Business B on business A's voucher is checked below.
		{"POST /api/v1/merchant/vouchers/{id}/reverse", "/api/v1/merchant/vouchers/" + uuid.NewString() + "/reverse", redeem},
		{"GET /api/v1/merchant/redemptions", "/api/v1/merchant/redemptions", redeem},
		{"GET /api/v1/merchant/documents", "/api/v1/merchant/documents", ownerOnly},
		{"PUT /api/v1/merchant/documents/{kind}", "/api/v1/merchant/documents/certificate", ownerOnly},
		{"POST /api/v1/merchant/submit", "/api/v1/merchant/submit", ownerOnly},
		// Registration is open to any signed-in account; one business per account is checked below.
		{"POST /api/v1/merchants", "/api/v1/merchants", signedIn},
	}
	// payouts.view is a separate permission with the same holders as workspace.view today.
	checkCoverage(t, env.routes("/api/v1/merchant/", "/api/v1/merchants"), rules)

	// Strings that identify business A's rows. Business B's owner must never get any of them back.
	foreign := []string{merchantA.String(), dealA.String(), locationA.String(), reviewA.String(), voucherA.String(),
		mediaA.String(), staffA.String()}
	snapshot := func() string {
		var state string
		if err := env.pool.QueryRow(ctx, `SELECT concat_ws('|',
			(SELECT row(d.*)::text FROM deals d WHERE id = $1),
			(SELECT row(l.*)::text FROM merchant_locations l WHERE id = $2),
			(SELECT row(a.*)::text FROM merchant_media_assets a WHERE id = $3),
			(SELECT row(ra.*)::text FROM role_assignments ra WHERE id = $4),
			(SELECT row(v.*)::text FROM vouchers v WHERE id = $5),
			(SELECT row(m.*)::text FROM merchants m WHERE id = $6),
			(SELECT count(*)::text FROM review_replies WHERE review_id = $7),
			(SELECT count(*)::text FROM merchant_locations WHERE merchant_id = $6),
			(SELECT count(*)::text FROM deals WHERE merchant_id = $6),
			(SELECT count(*)::text FROM role_assignments WHERE merchant_id = $6))`,
			dealA, locationA, mediaA, staffA, voucherA, merchantA, reviewA).Scan(&state); err != nil {
			t.Fatal(err)
		}
		return state
	}
	before := snapshot()

	// Business B cannot reverse business A's voucher: the redemption is out of its reach.
	if recorder := env.call(tokens["other"], http.MethodPost, "/api/v1/merchant/vouchers/"+voucherA.String()+"/reverse",
		map[string]string{"reason": "matrix"}); recorder.Code != http.StatusConflict || problemCodeOf(recorder) != "no_redemption" {
		t.Errorf("business B reversing business A's voucher: %d %s", recorder.Code, recorder.Body.String())
	}

	// Refused roles and business B run before anything is allowed to change business A, so the
	// snapshot proves that none of them touched it.
	for _, role := range []string{"user", "cashier", "other", "manager", "owner"} {
		if role == "manager" {
			if after := snapshot(); after != before {
				t.Fatalf("business A changed while only refused roles and business B ran:\nbefore %s\nafter  %s", before, after)
			}
		}
		for _, rule := range rules {
			method, _ := splitRoute(rule.route)
			recorder := env.call(tokens[role], method, rule.path, map[string]any{})
			label := fmt.Sprintf("%s %s as %s", method, rule.path, role)
			if recorder.Code >= 500 {
				t.Errorf("%s: %d %s", label, recorder.Code, recorder.Body.String())
				continue
			}
			allowed := rule.allowed[role]
			// Business B on business A's ids: the permission check passes, then the row must be out of reach.
			crossTenant := role == "other" && containsAny(rule.path, foreign)
			switch {
			case crossTenant:
				if recorder.Code < 400 || recorder.Code == http.StatusUnauthorized {
					t.Errorf("%s: business B reached a business A row: %d %s", label, recorder.Code, recorder.Body.String())
				}
			case !allowed:
				if recorder.Code != http.StatusForbidden || problemCodeOf(recorder) != "forbidden" {
					t.Errorf("%s: got %d %s, want 403 forbidden", label, recorder.Code, recorder.Body.String())
				}
			case recorder.Code == http.StatusUnauthorized || recorder.Code == http.StatusForbidden:
				t.Errorf("%s: got %d %s, want the operation to run", label, recorder.Code, recorder.Body.String())
			}
			if role == "other" {
				if leaked := responseWithoutInstance(recorder); containsAny(leaked, foreign) {
					t.Errorf("%s: response leaks a business A id: %s", label, leaked)
				}
				// A row of business A must look missing to business B, never "in use" or "locked".
				if crossTenant && recorder.Code == http.StatusConflict {
					t.Errorf("%s: business B learns about a business A row: %s", label, recorder.Body.String())
				}
			}
		}
	}
}

// TestOneBusinessPerAccount: a member of one business cannot be invited to another, nor register one.
func TestOneBusinessPerAccount(t *testing.T) {
	env := newMatrixEnv(t)
	owner := env.signIn("+998900000002")

	invite := env.call(owner, http.MethodPost, "/api/v1/merchant/staff", map[string]string{"phone": "+998900000009", "role": "merchant_cashier"})
	if invite.Code != http.StatusConflict || problemCodeOf(invite) != "already_in_another_business" {
		t.Fatalf("invite of business B's cashier: %d %s", invite.Code, invite.Body.String())
	}
	again := env.call(owner, http.MethodPost, "/api/v1/merchant/staff", map[string]string{"phone": "+998900000003", "role": "merchant_manager"})
	if again.Code != http.StatusConflict || problemCodeOf(again) != "already_staff" {
		t.Fatalf("invite of own cashier: %d %s", again.Code, again.Body.String())
	}

	city := env.id(`SELECT id FROM cities WHERE is_active ORDER BY sort_order LIMIT 1`)
	category := env.id(`SELECT id FROM categories WHERE searchable ORDER BY sort_order LIMIT 1`)
	register := map[string]any{
		"legal_name": "Matrix LLC", "display_name": "Matrix Studio", "category_id": category, "city_id": city,
		"phone": "+998901234567", "address": "Matrix street 1", "lat": 41.3, "lng": 69.2,
		"stir": fmt.Sprintf("4%08d", rand.Intn(100_000_000)), "org_form": "mchj", "tax_regime": "vat_payer",
		"bank_mfo": "00014", "bank_account": "20208000900100100001", "responsible_name": "Matrix Owner",
		"contract_version": "v1.1", "contract_accepted": true,
	}
	for _, phone := range []string{"+998900000003", "+998900000002"} {
		recorder := env.call(env.signIn(phone), http.MethodPost, "/api/v1/merchants", register)
		if recorder.Code != http.StatusConflict || problemCodeOf(recorder) != "already_in_another_business" {
			t.Fatalf("registration by %s: %d %s", phone, recorder.Code, recorder.Body.String())
		}
	}
	_, freePhone := env.newUser(nil)
	if recorder := env.call(env.signIn(freePhone), http.MethodPost, "/api/v1/merchants", register); recorder.Code != http.StatusCreated {
		t.Fatalf("registration by a free account: %d %s", recorder.Code, recorder.Body.String())
	}
}

// TestMeListsMembershipPermissions: GET /me gives each role exactly its permissions.
func TestMeListsMembershipPermissions(t *testing.T) {
	env := newMatrixEnv(t)
	merchantA := env.id(`SELECT id FROM merchants WHERE slug = 'seed-merchant-01'`)
	_, managerPhone := env.newUser(&merchantA, "merchant_manager")
	want := map[string][]string{
		"+998900000002": {"workspace.view", "workspace.edit", "payouts.view", "staff.manage", "business.manage", "redeem", "redemptions.view_all"},
		managerPhone:    {"workspace.view", "workspace.edit", "payouts.view", "redeem", "redemptions.view_all"},
		"+998900000003": {"redeem"},
	}
	for phone, permissions := range want {
		recorder := env.call(env.signIn(phone), http.MethodGet, "/api/v1/me", nil)
		var me struct {
			Memberships []struct {
				MerchantID  uuid.UUID `json:"merchant_id"`
				Permissions []string  `json:"permissions"`
			} `json:"memberships"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &me); err != nil {
			t.Fatal(err)
		}
		if len(me.Memberships) != 1 || me.Memberships[0].MerchantID != merchantA ||
			strings.Join(me.Memberships[0].Permissions, ",") != strings.Join(permissions, ",") {
			t.Errorf("%s: %s, want permissions %v", phone, recorder.Body.String(), permissions)
		}
	}
	plain := env.call(env.signIn("+998900000001"), http.MethodGet, "/api/v1/me", nil)
	if !strings.Contains(plain.Body.String(), `"memberships":[]`) {
		t.Errorf("plain user memberships: %s", plain.Body.String())
	}
}

// TestAdminAuthorizationMatrix checks every /api/v1/admin operation for each platform role.
func TestAdminAuthorizationMatrix(t *testing.T) {
	env := newMatrixEnv(t)
	tokens := map[string]string{
		"user":       env.signIn("+998900000001"),
		"superadmin": env.signIn("+998900000004"),
	}
	for _, role := range []string{"moderator", "admin", "support", "finance"} {
		_, phone := env.newUser(nil, role)
		tokens[role] = env.signIn(phone)
	}

	missing := "/" + uuid.NewString()
	review := roleSet("superadmin", "admin", "moderator")
	audit := roleSet("superadmin", "admin")
	financeOnly := roleSet("superadmin", "finance")
	supportOnly := roleSet("superadmin", "support")
	desk := roleSet("superadmin", "finance", "support")
	rules := []opRule{
		{"GET /api/v1/admin/moderation/deals", "/api/v1/admin/moderation/deals", review},
		{"POST /api/v1/admin/deals/{id}/approve", "/api/v1/admin/deals" + missing + "/approve", review},
		{"POST /api/v1/admin/deals/{id}/reject", "/api/v1/admin/deals" + missing + "/reject", review},
		{"GET /api/v1/admin/review-reports", "/api/v1/admin/review-reports", review},
		{"POST /api/v1/admin/review-reports/{id}/dismiss", "/api/v1/admin/review-reports" + missing + "/dismiss", review},
		{"POST /api/v1/admin/reviews/{id}/hide", "/api/v1/admin/reviews" + missing + "/hide", review},
		{"GET /api/v1/admin/audit-logs", "/api/v1/admin/audit-logs", audit},
		{"GET /api/v1/admin/merchants", "/api/v1/admin/merchants", review},
		{"POST /api/v1/admin/merchants/{id}/start-review", "/api/v1/admin/merchants" + missing + "/start-review", review},
		{"POST /api/v1/admin/merchants/{id}/approve", "/api/v1/admin/merchants" + missing + "/approve", review},
		{"POST /api/v1/admin/merchants/{id}/reject", "/api/v1/admin/merchants" + missing + "/reject", review},
		{"GET /api/v1/admin/merchants/{id}/documents/{kind}", "/api/v1/admin/merchants" + missing + "/documents/certificate", review},
		{"POST /api/v1/admin/merchants/{id}/payouts", "/api/v1/admin/merchants" + missing + "/payouts", financeOnly},
		{"POST /api/v1/admin/payouts/{id}/approve", "/api/v1/admin/payouts" + missing + "/approve", financeOnly},
		{"POST /api/v1/admin/payouts/{id}/reconcile", "/api/v1/admin/payouts" + missing + "/reconcile", financeOnly},
		{"POST /api/v1/admin/refunds/{id}/paid", "/api/v1/admin/refunds" + missing + "/paid", financeOnly},
		{"POST /api/v1/admin/refunds/{id}/approve", "/api/v1/admin/refunds" + missing + "/approve", desk},
		{"POST /api/v1/admin/disputes/{id}/resolve", "/api/v1/admin/disputes" + missing + "/resolve", financeOnly},
		{"POST /api/v1/admin/disputes/{id}/request-evidence", "/api/v1/admin/disputes" + missing + "/request-evidence", supportOnly},
		{"POST /api/v1/admin/disputes/{id}/start-review", "/api/v1/admin/disputes" + missing + "/start-review", supportOnly},
		{"POST /api/v1/admin/disputes/{id}/close", "/api/v1/admin/disputes" + missing + "/close", supportOnly},
		{"POST /api/v1/admin/vouchers/{id}/reverse", "/api/v1/admin/vouchers" + missing + "/reverse", supportOnly},
		{"GET /api/v1/admin/finance/queue", "/api/v1/admin/finance/queue", desk},
		// The status stub is not implemented for anyone (501).
		{"GET /api/v1/admin/status", "/api/v1/admin/status", nil},
	}
	checkCoverage(t, env.routes("/api/v1/admin/"), rules)

	for _, rule := range rules {
		method, _ := splitRoute(rule.route)
		if anonymous := env.call("", method, rule.path, map[string]any{}); rule.allowed != nil && anonymous.Code != http.StatusUnauthorized {
			t.Errorf("%s %s anonymous: got %d, want 401", method, rule.path, anonymous.Code)
		}
		for _, role := range []string{"user", "moderator", "admin", "support", "finance", "superadmin"} {
			recorder := env.call(tokens[role], method, rule.path, map[string]any{})
			label := fmt.Sprintf("%s %s as %s", method, rule.path, role)
			switch {
			case rule.allowed == nil:
				if recorder.Code != http.StatusNotImplemented {
					t.Errorf("%s: got %d, want 501", label, recorder.Code)
				}
			case recorder.Code >= 500:
				t.Errorf("%s: %d %s", label, recorder.Code, recorder.Body.String())
			case !rule.allowed[role]:
				if recorder.Code != http.StatusForbidden {
					t.Errorf("%s: got %d %s, want 403", label, recorder.Code, recorder.Body.String())
				}
			case recorder.Code == http.StatusUnauthorized || recorder.Code == http.StatusForbidden:
				t.Errorf("%s: got %d %s, want the operation to run", label, recorder.Code, recorder.Body.String())
			}
		}
	}
}
