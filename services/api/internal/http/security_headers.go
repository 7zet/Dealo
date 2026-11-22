package httpapi

import (
	"net/http"
	"strings"
)

// apiContentSecurityPolicy forbids every kind of active content. API responses are JSON, problem
// documents or stored media; none of them is a page, so nothing may run, load or frame them. The
// policy of an image response does not apply when another page embeds it with <img>, so merchant
// media stays displayable on the web app.
const apiContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'"

// hstsValue is sent only outside development, where the API is reached over HTTPS.
const hstsValue = "max-age=63072000; includeSubDomains"

// mediaPathPrefix is where the local storage adapter serves public media files.
const mediaPathPrefix = "/media/"

// securityHeaders sets defensive headers on every response. Authentication endpoints and requests
// that carry credentials also get Cache-Control: no-store before the handler runs, so a handler that
// sets its own caching policy still wins. Public media keeps the file server's caching.
func securityHeaders(strictTransport bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := w.Header()
			header.Set("X-Content-Type-Options", "nosniff")
			header.Set("X-Frame-Options", "DENY")
			header.Set("Referrer-Policy", "no-referrer")
			header.Set("Content-Security-Policy", apiContentSecurityPolicy)
			if strictTransport {
				header.Set("Strict-Transport-Security", hstsValue)
			}
			if !strings.HasPrefix(r.URL.Path, mediaPathPrefix) && (isAuthPath(r.URL.Path) || hasCredentials(r)) {
				header.Set("Cache-Control", "no-store")
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isAuthPath(path string) bool {
	return strings.HasPrefix(path, "/api/v1/auth/") || path == "/api/v1/me" || strings.HasPrefix(path, "/api/v1/me/")
}

func hasCredentials(r *http.Request) bool {
	if r.Header.Get("Authorization") != "" {
		return true
	}
	if _, err := r.Cookie(accessCookieName); err == nil {
		return true
	}
	_, err := r.Cookie(refreshCookieName)
	return err == nil
}
