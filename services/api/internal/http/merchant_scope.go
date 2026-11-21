package httpapi

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"github.com/grupon/grupon/services/api/internal/domain/merchant"
)

// merchantScope authenticates the caller, resolves their merchant and checks that their role holds
// the permission the operation needs. Every merchant workspace handler goes through it, so no handler
// can reach a merchant without declaring what it needs. An account without a merchant role and a role
// without the permission both get 403 forbidden.
func merchantScope(w http.ResponseWriter, r *http.Request, auth *AuthAPI, workspace *merchant.WorkspaceService,
	logger *slog.Logger, permission merchant.Permission) (merchant.Actor, uuid.UUID, bool) {
	account, ok := auth.authenticate(w, r)
	if !ok {
		return merchant.Actor{}, uuid.Nil, false
	}
	merchantID, role, err := workspace.Authorize(r.Context(), account.ID, permission)
	switch {
	case err == nil:
		return merchant.Actor{UserID: account.ID, Role: role}, merchantID, true
	case errors.Is(err, merchant.ErrNoMerchant), errors.Is(err, merchant.ErrForbidden):
		writeProblem(w, r, http.StatusForbidden, "forbidden", nil, nil)
	default:
		logger.ErrorContext(r.Context(), "merchant authorization failed",
			slog.String("request_id", middleware.GetReqID(r.Context())),
			slog.String("error", err.Error()),
		)
		writeProblem(w, r, http.StatusInternalServerError, "internal_error", nil, nil)
	}
	return merchant.Actor{}, uuid.Nil, false
}
