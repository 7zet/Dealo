package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityHeadersOnEveryResponse(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name     string
		strict   bool
		wantHSTS string
	}{
		{name: "development", strict: false, wantHSTS: ""},
		{name: "production", strict: true, wantHSTS: hstsValue},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			router := NewRouter(RouterOptions{Logger: discardLogger(), StrictTransportSecurity: tc.strict})
			for _, path := range []string{"/healthz", "/does-not-exist"} {
				response := httptest.NewRecorder()
				router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
				header := response.Header()
				want := map[string]string{
					"X-Content-Type-Options":    "nosniff",
					"X-Frame-Options":           "DENY",
					"Referrer-Policy":           "no-referrer",
					"Content-Security-Policy":   "default-src 'none'; frame-ancestors 'none'",
					"Strict-Transport-Security": tc.wantHSTS,
				}
				for name, value := range want {
					if got := header.Get(name); got != value {
						t.Errorf("%s %s = %q, want %q", path, name, got, value)
					}
				}
			}
		})
	}
}

func TestSecurityHeadersCacheControl(t *testing.T) {
	t.Parallel()

	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	ownPolicy := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "private, max-age=60")
		w.WriteHeader(http.StatusOK)
	})

	for _, tc := range []struct {
		name    string
		handler http.Handler
		path    string
		prepare func(*http.Request)
		want    string
	}{
		{name: "auth endpoint", handler: ok, path: "/api/v1/auth/phone/code", want: "no-store"},
		{name: "account endpoint", handler: ok, path: "/api/v1/me", want: "no-store"},
		{name: "bearer token", handler: ok, path: "/api/v1/merchant/orders", prepare: func(r *http.Request) {
			r.Header.Set("Authorization", "Bearer token")
		}, want: "no-store"},
		{name: "session cookie", handler: ok, path: "/api/v1/deals", prepare: func(r *http.Request) {
			r.AddCookie(&http.Cookie{Name: accessCookieName, Value: "token"})
		}, want: "no-store"},
		{name: "anonymous catalog read", handler: ok, path: "/api/v1/deals", want: ""},
		{name: "media with cookie keeps file caching", handler: ok, path: "/media/a.jpg", prepare: func(r *http.Request) {
			r.AddCookie(&http.Cookie{Name: accessCookieName, Value: "token"})
		}, want: ""},
		{name: "handler policy wins", handler: ownPolicy, path: "/api/v1/auth/refresh", want: "private, max-age=60"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.prepare != nil {
				tc.prepare(request)
			}
			response := httptest.NewRecorder()
			securityHeaders(false)(tc.handler).ServeHTTP(response, request)
			if got := response.Header().Get("Cache-Control"); got != tc.want {
				t.Errorf("Cache-Control = %q, want %q", got, tc.want)
			}
		})
	}
}
