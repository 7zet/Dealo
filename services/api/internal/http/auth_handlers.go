package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/dealo/dealo/services/api/internal/domain/identity"
	"github.com/dealo/dealo/services/api/internal/domain/merchant"
	"github.com/dealo/dealo/services/api/internal/http/gen"
)

const (
	accessCookieName  = "access_token"
	refreshCookieName = "refresh_token"
	// refreshCookiePath covers /api/v1/auth/* (refresh, logout) and /api/v1/me/* (password change,
	// which keeps the current session).
	refreshCookiePath = "/api/v1"
	// maxUserAgentBytes bounds the user agent stored with each refresh token.
	maxUserAgentBytes = 512
)

// AuthOptions configures transport behavior that is not part of the domain.
type AuthOptions struct {
	// SecureCookies sets the Secure attribute. It is enabled outside development.
	SecureCookies bool
	// TrustedProxies are the peers whose X-Forwarded-For and X-Real-IP headers are believed. Requests
	// from other peers are keyed by their own address, so a client cannot pick its rate-limit bucket.
	TrustedProxies []netip.Prefix
	// RefreshTokenTTL sets the refresh cookie lifetime.
	RefreshTokenTTL time.Duration
}

// AuthAPI serves the authentication and account endpoints. Handlers only translate HTTP to the
// identity service and back.
type AuthAPI struct {
	gen.Unimplemented

	identity *identity.Service
	logger   *slog.Logger
	options  AuthOptions
}

var _ gen.ServerInterface = (*AuthAPI)(nil)

// NewAuthAPI binds the identity service to the HTTP contract.
func NewAuthAPI(service *identity.Service, logger *slog.Logger, options AuthOptions) *AuthAPI {
	return &AuthAPI{identity: service, logger: logger, options: options}
}

// RefreshSession rotates the refresh token from the cookie or the bearer header.
func (a *AuthAPI) RefreshSession(w http.ResponseWriter, r *http.Request) {
	session, err := a.identity.Refresh(r.Context(), a.meta(r), refreshTokenFrom(r))
	if err != nil {
		a.clearSessionCookies(w)
		a.fail(w, r, err)
		return
	}
	a.writeSession(w, http.StatusOK, session)
}

// Logout revokes the refresh token of the current session and clears the cookies. It needs only the
// refresh token, so it still works after the access token has expired.
func (a *AuthAPI) Logout(w http.ResponseWriter, r *http.Request) {
	if err := a.identity.Logout(r.Context(), refreshTokenFrom(r)); err != nil {
		a.fail(w, r, err)
		return
	}
	a.clearSessionCookies(w)
	w.WriteHeader(http.StatusNoContent)
}

// GetMe returns the current profile with the merchant workspaces of the user.
func (a *AuthAPI) GetMe(w http.ResponseWriter, r *http.Request) {
	account, ok := a.authenticate(w, r)
	if !ok {
		return
	}
	memberships, err := a.identity.Memberships(r.Context(), account.ID)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	user := toUserResponse(account)
	items := make([]gen.MerchantMembership, 0, len(memberships))
	for _, membership := range memberships {
		granted := merchant.PermissionsFor(string(membership.Role))
		permissions := make([]gen.MerchantPermission, 0, len(granted))
		for _, permission := range granted {
			permissions = append(permissions, gen.MerchantPermission(permission))
		}
		items = append(items, gen.MerchantMembership{
			Permissions:  permissions,
			MerchantId:   gen.Uuid(membership.MerchantID),
			MerchantName: membership.MerchantName,
			MerchantSlug: membership.MerchantSlug,
			Role:         gen.MerchantMembershipRole(membership.Role),
			ReviewStatus: gen.MerchantMembershipReviewStatus(membership.ReviewStatus),
		})
	}
	user.Memberships = &items
	writeJSON(w, http.StatusOK, user)
}

// UpdateMe updates profile preferences. The phone is the OTP sign-in identity, so a request that
// tries to change it is rejected with a stable code instead of the generic unknown-field error.
func (a *AuthAPI) UpdateMe(w http.ResponseWriter, r *http.Request) {
	account, ok := a.authenticate(w, r)
	if !ok {
		return
	}
	raw, ok := readBody(w, r)
	if !ok {
		return
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_request", nil, nil)
		return
	}
	if _, present := fields["phone"]; present {
		writeProblem(w, r, http.StatusUnprocessableEntity, "phone_change_requires_verification", nil,
			map[string][]string{"phone": {"phone_change_requires_verification"}})
		return
	}
	var body gen.UpdateProfileRequest
	if !decodeStrict(w, r, raw, &body) {
		return
	}

	update := identity.ProfileUpdate{Name: body.Name}
	if body.Locale != nil {
		locale := string(*body.Locale)
		update.Locale = &locale
	}
	if body.Currency != nil {
		currency := string(*body.Currency)
		update.Currency = &currency
	}
	if update.Name == nil && update.Locale == nil && update.Currency == nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_request", nil, nil)
		return
	}

	updated, err := a.identity.UpdateProfile(r.Context(), account.ID, update)
	if err != nil {
		a.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toUserResponse(updated))
}

// DeleteMe soft-deletes the current account.
func (a *AuthAPI) DeleteMe(w http.ResponseWriter, r *http.Request) {
	account, ok := a.authenticate(w, r)
	if !ok {
		return
	}
	if err := a.identity.DeleteAccount(r.Context(), account.ID); err != nil {
		a.fail(w, r, err)
		return
	}
	a.clearSessionCookies(w)
	w.WriteHeader(http.StatusNoContent)
}

// authenticate resolves the request credentials to an account or writes a 401 problem.
func (a *AuthAPI) authenticate(w http.ResponseWriter, r *http.Request) (identity.Account, bool) {
	account, err := a.identity.Authenticate(r.Context(), accessTokenFrom(r.Context()))
	if err != nil {
		a.fail(w, r, err)
		return identity.Account{}, false
	}
	return account, true
}

// RequireRole returns middleware that admits only accounts holding one of the roles. Roles are
// read from the database on every request, so revoking a role takes effect immediately.
func (a *AuthAPI) RequireRole(roles ...identity.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			account, ok := a.authenticate(w, r)
			if !ok {
				return
			}
			if !account.HasRole(roles...) {
				writeProblem(w, r, http.StatusForbidden, "forbidden", nil, nil)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), accountKey{}, account)))
		})
	}
}

// AccountFromContext returns the account placed by RequireRole.
func AccountFromContext(ctx context.Context) (identity.Account, bool) {
	account, ok := ctx.Value(accountKey{}).(identity.Account)
	return account, ok
}

func (a *AuthAPI) writeSession(w http.ResponseWriter, status int, session identity.Session) {
	a.setSessionCookies(w, session)
	writeJSON(w, status, gen.AuthSession{
		AccessToken:  session.AccessToken,
		RefreshToken: session.RefreshToken,
		ExpiresIn:    gen.AuthSessionExpiresIn(a.identity.AccessTokenTTL().Seconds()),
		User:         toUserResponse(session.Account),
	})
}

func (a *AuthAPI) setSessionCookies(w http.ResponseWriter, session identity.Session) {
	http.SetCookie(w, a.cookie(accessCookieName, session.AccessToken, "/", int(a.identity.AccessTokenTTL().Seconds())))
	http.SetCookie(w, a.cookie(refreshCookieName, session.RefreshToken, refreshCookiePath, int(a.options.RefreshTokenTTL.Seconds())))
}

func (a *AuthAPI) clearSessionCookies(w http.ResponseWriter) {
	http.SetCookie(w, a.cookie(accessCookieName, "", "/", -1))
	http.SetCookie(w, a.cookie(refreshCookieName, "", refreshCookiePath, -1))
}

func (a *AuthAPI) cookie(name, value, path string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     path,
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   a.options.SecureCookies,
		SameSite: http.SameSiteLaxMode,
	}
}

func (a *AuthAPI) meta(r *http.Request) identity.RequestMeta {
	userAgent := r.UserAgent()
	if len(userAgent) > maxUserAgentBytes {
		userAgent = userAgent[:maxUserAgentBytes]
	}
	return identity.RequestMeta{
		IP:        clientIP(r, a.options.TrustedProxies),
		UserAgent: userAgent,
	}
}

// fail maps domain errors to stable problem codes. Internal details are logged, not returned.
func (a *AuthAPI) fail(w http.ResponseWriter, r *http.Request, err error) {
	var validation *identity.ValidationError
	switch {
	case errors.As(err, &validation):
		writeProblem(w, r, http.StatusUnprocessableEntity, "validation_failed", nil,
			map[string][]string{validation.Field: {validation.Code}})
	case errors.Is(err, identity.ErrRateLimited):
		writeRetryProblem(w, r, "rate_limited", err)
	case errors.Is(err, identity.ErrEmailTaken):
		writeProblem(w, r, http.StatusConflict, "email_already_registered", nil, nil)
	case errors.Is(err, identity.ErrInvalidCredentials):
		writeProblem(w, r, http.StatusUnauthorized, "invalid_credentials", nil, nil)
	case errors.Is(err, identity.ErrAccountBlocked):
		writeProblem(w, r, http.StatusForbidden, "account_blocked", nil, nil)
	case errors.Is(err, identity.ErrInvalidToken):
		writeProblem(w, r, http.StatusBadRequest, "invalid_token", nil, nil)
	case errors.Is(err, identity.ErrRefreshTokenInvalid):
		writeProblem(w, r, http.StatusUnauthorized, "refresh_token_invalid", nil, nil)
	case errors.Is(err, identity.ErrRefreshTokenReused):
		writeProblem(w, r, http.StatusUnauthorized, "refresh_token_reused", nil, nil)
	case errors.Is(err, identity.ErrUnauthenticated):
		writeProblem(w, r, http.StatusUnauthorized, "unauthenticated", nil, nil)
	case errors.Is(err, identity.ErrForbidden):
		writeProblem(w, r, http.StatusForbidden, "forbidden", nil, nil)
	case errors.Is(err, identity.ErrNotFound):
		writeProblem(w, r, http.StatusNotFound, "not_found", nil, nil)
	default:
		a.logger.ErrorContext(r.Context(), "identity request failed",
			slog.String("request_id", middleware.GetReqID(r.Context())),
			slog.String("error", err.Error()),
		)
		writeProblem(w, r, http.StatusInternalServerError, "internal_error", nil, nil)
	}
}

// decodeBody reads a JSON object into dst with unknown fields rejected. It returns the raw body so
// callers that need presence information can reuse it.
func decodeBody(w http.ResponseWriter, r *http.Request, dst any) ([]byte, bool) {
	raw, ok := readBody(w, r)
	if !ok {
		return nil, false
	}
	if !decodeStrict(w, r, raw, dst) {
		return nil, false
	}
	return raw, true
}

// readBody reads the whole request body, writing a problem when it is too large or unreadable.
func readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeProblem(w, r, http.StatusRequestEntityTooLarge, "payload_too_large", nil, nil)
			return nil, false
		}
		writeProblem(w, r, http.StatusBadRequest, "invalid_request", nil, nil)
		return nil, false
	}
	return raw, true
}

// decodeStrict decodes one JSON value from raw into dst with unknown fields rejected.
func decodeStrict(w http.ResponseWriter, r *http.Request, raw []byte, dst any) bool {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeProblem(w, r, http.StatusBadRequest, "invalid_request", nil, nil)
		return false
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		writeProblem(w, r, http.StatusBadRequest, "invalid_request", nil, nil)
		return false
	}
	return true
}

func toUserResponse(account identity.Account) gen.User {
	roles := make([]gen.Role, 0, len(account.Roles))
	for _, role := range account.Roles {
		roles = append(roles, gen.Role(role))
	}
	user := gen.User{
		Id:              uuid.UUID(account.ID),
		Email:           openapi_types.Email(account.Email),
		Name:            account.Name,
		Phone:           account.Phone,
		AvatarUrl:       account.AvatarURL,
		Locale:          gen.Locale(account.Locale),
		Currency:        gen.Currency(account.Currency),
		EmailVerifiedAt: account.EmailVerifiedAt,
		Status:          gen.UserStatus(account.Status),
		Roles:           roles,
	}
	if !account.CreatedAt.IsZero() {
		createdAt := account.CreatedAt
		user.CreatedAt = &createdAt
	}
	return user
}

// refreshTokenFrom returns the refresh token from the cookie, or the bearer value for native clients.
func refreshTokenFrom(r *http.Request) string {
	if value := refreshCookieValue(r); value != "" {
		return value
	}
	return bearerValue(r)
}

func refreshCookieValue(r *http.Request) string {
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func bearerValue(r *http.Request) string {
	header := r.Header.Get("Authorization")
	scheme, value, found := strings.Cut(header, " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}
	return strings.TrimSpace(value)
}

// clientIP returns the address the rate limiter and the session audit key on. A request from a
// trusted proxy (by default only loopback: the Next.js server on the same host) is attributed to the
// client the proxy names: the right-most X-Forwarded-For entry that is not itself a trusted proxy,
// or X-Real-IP. Headers from any other peer are ignored, so a client cannot choose its own bucket.
func clientIP(r *http.Request, trusted []netip.Prefix) string {
	peer := peerAddr(r)
	if !peer.IsValid() {
		return r.RemoteAddr
	}
	if !isTrusted(peer, trusted) {
		return peer.String()
	}
	if forwarded := r.Header.Values("X-Forwarded-For"); len(forwarded) > 0 {
		hops := strings.Split(strings.Join(forwarded, ","), ",")
		for i := len(hops) - 1; i >= 0; i-- {
			hop, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
			if err != nil {
				break
			}
			hop = hop.Unmap()
			if !isTrusted(hop, trusted) {
				return hop.String()
			}
		}
	}
	if real, err := netip.ParseAddr(strings.TrimSpace(r.Header.Get("X-Real-IP"))); err == nil {
		return real.Unmap().String()
	}
	return peer.String()
}

func peerAddr(r *http.Request) netip.Addr {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}
	}
	return addr.Unmap()
}

func isTrusted(addr netip.Addr, trusted []netip.Prefix) bool {
	for _, prefix := range trusted {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

// writeRetryProblem answers 429 with the wait in both the Retry-After header and the problem body,
// so the client can show an exact countdown.
func writeRetryProblem(w http.ResponseWriter, r *http.Request, code string, err error) {
	seconds := int(identity.RetryAfterOf(err) / time.Second)
	if seconds > 0 {
		w.Header().Set("Retry-After", strconv.Itoa(seconds))
	}
	writeProblemWithRetry(w, r, http.StatusTooManyRequests, code, seconds)
}

type accountKey struct{}
type accessTokenKey struct{}

// withCredentials records the access token from the cookie or the bearer header on the request
// context. It does not verify the token; handlers that need an account call authenticate.
func (a *AuthAPI) withCredentials(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerValue(r)
		if token == "" {
			if cookie, err := r.Cookie(accessCookieName); err == nil {
				token = cookie.Value
			}
		}
		if token != "" {
			r = r.WithContext(context.WithValue(r.Context(), accessTokenKey{}, token))
		}
		next.ServeHTTP(w, r)
	})
}

func accessTokenFrom(ctx context.Context) string {
	token, _ := ctx.Value(accessTokenKey{}).(string)
	return token
}

// limitRequestBody caps request bodies so that a single request cannot exhaust memory.
func limitRequestBody(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil && r.Body != http.NoBody {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}
