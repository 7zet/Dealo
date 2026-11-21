package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/grupon/grupon/services/api/internal/domain/redemption"
)

func TestAT05ExpiredAndRefundedVoucherErrorsMapToUnprocessableProblems(t *testing.T) {
	t.Parallel()

	api := &MerchantRedemptionAPI{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	tests := []struct {
		name string
		err  error
		code string
	}{
		{name: "expired", err: redemption.ErrExpired, code: "voucher_expired"},
		{name: "refunded", err: redemption.ErrRefunded, code: "voucher_refunded"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api/v1/merchant/vouchers/test/redeem", nil)

			api.fail(recorder, request, test.err)

			if recorder.Code != http.StatusUnprocessableEntity || problemCode(t, recorder) != test.code {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if got := recorder.Header().Get("Content-Type"); got != "application/problem+json" {
				t.Fatalf("content type = %q, want application/problem+json", got)
			}
		})
	}
}

func TestScannerBlockedAnswersWithRetryAfter(t *testing.T) {
	t.Parallel()

	api := &MerchantRedemptionAPI{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/merchant/vouchers/lookup", nil)

	api.fail(recorder, request, &redemption.ScannerBlockedError{RetryAfter: 90*time.Second + 300*time.Millisecond})

	if recorder.Code != http.StatusTooManyRequests || problemCode(t, recorder) != "scanner_blocked" {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if got := recorder.Header().Get("Retry-After"); got != "91" {
		t.Fatalf("Retry-After = %q, want 91", got)
	}
	if !strings.Contains(recorder.Body.String(), `"retry_after_seconds":91`) {
		t.Fatalf("body lacks retry_after_seconds: %s", recorder.Body.String())
	}
}
