package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strconv"
	"testing"
	"time"

	"github.com/dealo/dealo/services/api/internal/domain/identity"
	"github.com/dealo/dealo/services/api/internal/domain/identity/identitytest"
)

var loopbackProxies = []netip.Prefix{netip.MustParsePrefix("127.0.0.0/8"), netip.MustParsePrefix("::1/128")}

func TestClientIPTrustsForwardedHeadersOnlyFromTrustedProxies(t *testing.T) {
	cases := []struct {
		name      string
		remote    string
		forwarded []string
		realIP    string
		want      string
	}{
		{name: "direct client", remote: "203.0.113.5:1234", want: "203.0.113.5"},
		{name: "untrusted peer cannot spoof", remote: "203.0.113.5:1234", forwarded: []string{"198.51.100.7"}, realIP: "198.51.100.8", want: "203.0.113.5"},
		{name: "web server forwards the browser", remote: "127.0.0.1:5000", forwarded: []string{"198.51.100.7"}, want: "198.51.100.7"},
		{name: "right-most untrusted hop wins", remote: "[::1]:5000", forwarded: []string{"10.9.9.9, 198.51.100.7, 127.0.0.1"}, want: "198.51.100.7"},
		{name: "several header lines", remote: "127.0.0.1:5000", forwarded: []string{"192.0.2.1", "198.51.100.7"}, want: "198.51.100.7"},
		{name: "x-real-ip fallback", remote: "127.0.0.1:5000", realIP: "198.51.100.9", want: "198.51.100.9"},
		{name: "garbage header ignored", remote: "127.0.0.1:5000", forwarded: []string{"not-an-ip"}, want: "127.0.0.1"},
		{name: "local browser through local web server", remote: "127.0.0.1:5000", forwarded: []string{"::1"}, want: "127.0.0.1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/", nil)
			request.RemoteAddr = tc.remote
			for _, value := range tc.forwarded {
				request.Header.Add("X-Forwarded-For", value)
			}
			if tc.realIP != "" {
				request.Header.Set("X-Real-IP", tc.realIP)
			}
			if got := clientIP(request, loopbackProxies); got != tc.want {
				t.Fatalf("clientIP = %q, want %q", got, tc.want)
			}
		})
	}
}

type otpHTTP struct {
	router http.Handler
	clock  *time.Time
}

func newOTPHTTP(t *testing.T) otpHTTP {
	t.Helper()
	now := time.Date(2026, 6, 1, 9, 0, 0, 0, time.UTC)
	clock := &now
	nowFn := func() time.Time { return *clock }
	tokens, err := identity.NewTokenIssuer(httpTestSecret, 15*time.Minute, nowFn)
	if err != nil {
		t.Fatal(err)
	}
	service := identity.NewService(identity.Dependencies{
		Repository: identitytest.NewRepository(nowFn), Tokens: tokens, Mailer: &identitytest.Mailer{},
		Limiter: &identitytest.Limiter{}, CodeSender: silentSender{}, Now: nowFn,
	}, identity.Config{AccessTokenTTL: 15 * time.Minute, RefreshTokenTTL: 24 * time.Hour, OTPEcho: true})
	auth := NewAuthAPI(service, slog.New(slog.NewTextHandler(io.Discard, nil)), AuthOptions{
		TrustedProxies: loopbackProxies, RefreshTokenTTL: 24 * time.Hour,
	})
	return otpHTTP{router: NewRouter(RouterOptions{Auth: auth}), clock: clock}
}

// post sends a sign-in step the way the Next.js proxy does: from loopback, naming the browser.
func (h otpHTTP) post(t *testing.T, path, browserIP string, body map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	raw, _ := json.Marshal(body)
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	request.Header.Set("Content-Type", "application/json")
	request.RemoteAddr = "127.0.0.1:40000"
	request.Header.Set("X-Forwarded-For", browserIP)
	recorder := httptest.NewRecorder()
	h.router.ServeHTTP(recorder, request)
	return recorder
}

func retryAfterSeconds(t *testing.T, recorder *httptest.ResponseRecorder) int {
	t.Helper()
	var problem struct {
		RetryAfterSeconds int `json:"retry_after_seconds"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	header, err := strconv.Atoi(recorder.Header().Get("Retry-After"))
	if err != nil || header != problem.RetryAfterSeconds {
		t.Fatalf("Retry-After header %q does not match body %d", recorder.Header().Get("Retry-After"), problem.RetryAfterSeconds)
	}
	return problem.RetryAfterSeconds
}

// Regression for the reported bug: after one phone was locked out, every other phone and a fresh
// browser got "too many attempts", because all sign-ins arrive from the web server's address.
func TestPhoneLockoutThroughTheWebProxyDoesNotBlockOtherPhones(t *testing.T) {
	h := newOTPHTTP(t)
	for i := 0; i < 10; i++ {
		if got := h.post(t, "/api/v1/auth/phone/code", "198.51.100.20", map[string]string{"phone": "+998906666661"}); got.Code != http.StatusAccepted {
			t.Fatalf("phone A request %d: %d %s", i+1, got.Code, got.Body.String())
		}
	}
	locked := h.post(t, "/api/v1/auth/phone/code", "198.51.100.20", map[string]string{"phone": "+998906666661"})
	if locked.Code != http.StatusTooManyRequests || authProblemCode(t, locked) != "rate_limited" {
		t.Fatalf("phone A request 11: %d %s", locked.Code, locked.Body.String())
	}
	if wait := retryAfterSeconds(t, locked); wait <= 0 || wait > 900 {
		t.Fatalf("retry after = %d, want 1..900", wait)
	}

	// Another phone in the same browser, and a different browser, are not affected.
	if got := h.post(t, "/api/v1/auth/phone/code", "198.51.100.20", map[string]string{"phone": "+998906666662"}); got.Code != http.StatusAccepted {
		t.Fatalf("phone B, same browser: %d %s", got.Code, got.Body.String())
	}
	if got := h.post(t, "/api/v1/auth/phone/code", "198.51.100.21", map[string]string{"phone": "+998906666663"}); got.Code != http.StatusAccepted {
		t.Fatalf("phone C, other browser: %d %s", got.Code, got.Body.String())
	}
}

func TestExpiredCodeAnswersOTPExpired(t *testing.T) {
	h := newOTPHTTP(t)
	sent := h.post(t, "/api/v1/auth/phone/code", "198.51.100.30", map[string]string{"phone": "+998907777771"})
	var code struct {
		DevCode string `json:"dev_code"`
	}
	if err := json.Unmarshal(sent.Body.Bytes(), &code); err != nil || code.DevCode == "" {
		t.Fatalf("request code: %d %s", sent.Code, sent.Body.String())
	}
	*h.clock = h.clock.Add(5*time.Minute + time.Second)
	got := h.post(t, "/api/v1/auth/phone/verify", "198.51.100.30", map[string]string{"phone": "+998907777771", "code": code.DevCode})
	if got.Code != http.StatusUnauthorized || authProblemCode(t, got) != "otp_expired" {
		t.Fatalf("expired code: %d %s", got.Code, got.Body.String())
	}
}
