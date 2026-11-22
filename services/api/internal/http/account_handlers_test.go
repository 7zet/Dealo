package httpapi

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/dealo/dealo/services/api/internal/domain/reviews"
)

func TestUpdateMeRejectsPhoneChange(t *testing.T) {
	h := newAuthHarness(t, 0, false)
	cookie, _ := h.signIn(t, "+998901234567")

	for _, body := range []any{
		map[string]any{"phone": "+998907654321"},
		map[string]any{"phone": nil},
		map[string]any{"name": "Aziz", "phone": "+998907654321"},
	} {
		recorder := h.do(t, http.MethodPatch, "/api/v1/me", body, cookie)
		if recorder.Code != http.StatusUnprocessableEntity {
			t.Fatalf("body %v: status = %d, want 422: %s", body, recorder.Code, recorder.Body.String())
		}
		if code := authProblemCode(t, recorder); code != "phone_change_requires_verification" {
			t.Fatalf("body %v: code = %q", body, code)
		}
	}

	me := h.do(t, http.MethodGet, "/api/v1/me", nil, cookie)
	var profile struct {
		Name  string  `json:"name"`
		Phone *string `json:"phone"`
	}
	if err := json.Unmarshal(me.Body.Bytes(), &profile); err != nil {
		t.Fatal(err)
	}
	if profile.Phone == nil || *profile.Phone != "+998901234567" || profile.Name == "Aziz" {
		t.Fatalf("rejected update changed the profile: %s", me.Body.String())
	}

	recorder := h.do(t, http.MethodPatch, "/api/v1/me", map[string]any{"name": "Aziz", "locale": "ru"}, cookie)
	if recorder.Code != http.StatusOK {
		t.Fatalf("name update status = %d: %s", recorder.Code, recorder.Body.String())
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &profile); err != nil {
		t.Fatal(err)
	}
	if profile.Name != "Aziz" {
		t.Fatalf("name = %q, want Aziz", profile.Name)
	}

	unknown := h.do(t, http.MethodPatch, "/api/v1/me", map[string]any{"email": "x@example.test"}, cookie)
	if unknown.Code != http.StatusBadRequest || authProblemCode(t, unknown) != "invalid_request" {
		t.Fatalf("unknown field status = %d: %s", unknown.Code, unknown.Body.String())
	}
}

func TestGetMeReturnsCreatedAtAndMemberships(t *testing.T) {
	h := newAuthHarness(t, 0, false)
	cookie, _ := h.signIn(t, "+998901234568")

	recorder := h.do(t, http.MethodGet, "/api/v1/me", nil, cookie)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
	}
	var body struct {
		CreatedAt *time.Time `json:"created_at"`
	}
	raw := map[string]json.RawMessage{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.CreatedAt == nil || body.CreatedAt.IsZero() {
		t.Fatalf("created_at missing: %s", recorder.Body.String())
	}
	if string(raw["memberships"]) != "[]" {
		t.Fatalf("memberships = %s, want []", raw["memberships"])
	}
}

func TestListMyReviewsRequiresAuthAndReturnsOwnReviews(t *testing.T) {
	h := newAuthHarness(t, 0, false)

	anonymous := h.do(t, http.MethodGet, "/api/v1/me/reviews", nil)
	if anonymous.Code != http.StatusUnauthorized || authProblemCode(t, anonymous) != "unauthenticated" {
		t.Fatalf("anonymous status = %d: %s", anonymous.Code, anonymous.Body.String())
	}

	cookie, userID := h.signIn(t, "+998901234569")
	created := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)
	h.reviews.items = []reviews.MyReview{
		{
			Review: reviews.Review{
				ID: uuid.New(), DealID: uuid.New(), MerchantID: uuid.New(), UserID: userID, VoucherID: uuid.New(),
				Rating: 4, Text: "Hidden review text that is long enough.", Locale: "en",
				Status: reviews.StatusHidden, CreatedAt: created,
			},
			DealSlug:     "spa-day",
			DealTitle:    reviews.LocalizedText{Uz: "Spa kuni", Ru: "День спа", En: "Spa day"},
			MerchantName: "Oasis Spa",
			Reply:        &reviews.Reply{ID: uuid.New(), Text: "Thank you!", CreatedAt: created.Add(time.Hour)},
		},
		{Review: reviews.Review{ID: uuid.New(), UserID: uuid.New(), Status: reviews.StatusPublished}},
	}

	recorder := h.do(t, http.MethodGet, "/api/v1/me/reviews", nil, cookie)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
	}
	var list struct {
		Items []struct {
			Status       string            `json:"status"`
			DealSlug     string            `json:"deal_slug"`
			DealTitle    map[string]string `json:"deal_title"`
			MerchantName string            `json:"merchant_name"`
			Reply        *struct {
				Text string `json:"text"`
			} `json:"reply"`
		} `json:"items"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Items) != 1 {
		t.Fatalf("items = %d, want 1: %s", len(list.Items), recorder.Body.String())
	}
	item := list.Items[0]
	if item.Status != "hidden" || item.DealSlug != "spa-day" || item.DealTitle["ru"] != "День спа" ||
		item.MerchantName != "Oasis Spa" || item.Reply == nil || item.Reply.Text != "Thank you!" {
		t.Fatalf("unexpected item: %s", recorder.Body.String())
	}
}
