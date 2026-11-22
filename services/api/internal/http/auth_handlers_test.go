package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/dealo/dealo/services/api/internal/domain/identity"
	"github.com/dealo/dealo/services/api/internal/domain/identity/identitytest"
	"github.com/dealo/dealo/services/api/internal/domain/reviews"
)

const (
	httpTestSecret = "http-test-secret-with-at-least-32-bytes"
	httpPassword   = "correct-horse-battery"
)

type authHarness struct {
	router  http.Handler
	auth    *AuthAPI
	repo    *identitytest.Repository
	reviews *myReviewsRepo
}

func newAuthHarness(t *testing.T, limit int, secure bool) authHarness {
	t.Helper()
	repo := identitytest.NewRepository(time.Now)
	mailer := &identitytest.Mailer{}
	tokens, err := identity.NewTokenIssuer(httpTestSecret, 15*time.Minute, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	var limiter identity.RateLimiter
	if limit > 0 {
		limiter = &identitytest.Limiter{Max: limit}
	}
	service := identity.NewService(identity.Dependencies{
		Repository: repo, Tokens: tokens, Mailer: mailer, Limiter: limiter, CodeSender: silentSender{}, Now: time.Now,
	}, identity.Config{
		AccessTokenTTL: 15 * time.Minute, RefreshTokenTTL: 30 * 24 * time.Hour,
		VerifyEmailTTL: 24 * time.Hour, OTPEcho: true,
		WebBaseURL: "https://dealo.test", BrandName: "Dealo",
	})
	auth := NewAuthAPI(service, slog.New(slog.NewTextHandler(io.Discard, nil)), AuthOptions{
		SecureCookies:   secure,
		RefreshTokenTTL: 30 * 24 * time.Hour,
	})
	reviewRepo := &myReviewsRepo{}
	reviewAPI := NewReviewAPI(reviews.NewService(reviewRepo), auth, slog.New(slog.NewTextHandler(io.Discard, nil)))
	return authHarness{router: NewRouter(RouterOptions{Auth: auth, Reviews: reviewAPI}), auth: auth, repo: repo, reviews: reviewRepo}
}

// silentSender accepts sign-in codes without delivering them; the harness reads the echoed code.
type silentSender struct{}

func (silentSender) SendCode(context.Context, string, string) error { return nil }

// signIn signs a phone in through the OTP flow and returns its access cookie.
func (h authHarness) signIn(t *testing.T, phone string) (*http.Cookie, uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	meta := identity.RequestMeta{IP: "192.0.2.10"}
	code, err := h.auth.identity.RequestCode(ctx, meta, phone)
	if err != nil {
		t.Fatal(err)
	}
	session, err := h.auth.identity.VerifyCode(ctx, meta, phone, code.DevCode)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: accessCookieName, Value: session.AccessToken}, session.Account.ID
}

// myReviewsRepo is a reviews.Repository that only serves the author's list.
type myReviewsRepo struct {
	items []reviews.MyReview
}

func (r *myReviewsRepo) Voucher(context.Context, uuid.UUID) (reviews.VoucherOwner, error) {
	return reviews.VoucherOwner{}, reviews.ErrVoucherNotFound
}
func (r *myReviewsRepo) Insert(context.Context, reviews.VoucherOwner, uuid.UUID, uuid.UUID, reviews.Input) (reviews.Review, error) {
	return reviews.Review{}, errors.New("not used")
}
func (r *myReviewsRepo) Find(context.Context, uuid.UUID) (reviews.Review, error) {
	return reviews.Review{}, reviews.ErrNotFound
}
func (r *myReviewsRepo) Update(context.Context, uuid.UUID, uuid.UUID, reviews.Input) (bool, error) {
	return false, nil
}
func (r *myReviewsRepo) SoftDelete(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return false, nil
}
func (r *myReviewsRepo) Report(context.Context, uuid.UUID, uuid.UUID, string) error { return nil }
func (r *myReviewsRepo) ListByUser(_ context.Context, userID uuid.UUID) ([]reviews.MyReview, error) {
	mine := []reviews.MyReview{}
	for _, item := range r.items {
		if item.UserID == userID {
			mine = append(mine, item)
		}
	}
	return mine, nil
}

func (h authHarness) do(t *testing.T, method, path string, body any, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	}
	request := httptest.NewRequest(method, path, reader)
	request.Header.Set("Content-Type", "application/json")
	request.RemoteAddr = "192.0.2.10:4321"
	for _, cookie := range cookies {
		request.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	h.router.ServeHTTP(recorder, request)
	return recorder
}

func cookieNamed(recorder *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}

func authProblemCode(t *testing.T, recorder *httptest.ResponseRecorder) string {
	t.Helper()
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/problem+json" {
		t.Fatalf("content type = %q, want application/problem+json", contentType)
	}
	var problem struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	return problem.Code
}

// userID extracts the account id from a session response.
func userID(t *testing.T, recorder *httptest.ResponseRecorder) uuid.UUID {
	t.Helper()
	var session struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	id, err := uuid.Parse(session.User.ID)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func registerBody() map[string]string {
	return map[string]string{
		"email": "shopper@example.test", "password": httpPassword, "name": "Shopper",
		"locale": "en", "currency": "UZS",
	}
}
