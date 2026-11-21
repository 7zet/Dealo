-- name: GetVoucherForReview :one
SELECT user_id, merchant_id, deal_id, status FROM vouchers WHERE id = sqlc.arg(id);

-- name: InsertReview :one
INSERT INTO reviews (deal_id, merchant_id, user_id, voucher_id, rating, text, locale)
VALUES (sqlc.arg(deal_id), sqlc.arg(merchant_id), sqlc.arg(user_id), sqlc.arg(voucher_id),
        sqlc.arg(rating), sqlc.arg(text), sqlc.arg(locale)::locale_code)
RETURNING id, created_at;

-- name: GetReviewRow :one
SELECT id, deal_id, merchant_id, user_id, voucher_id, rating, text, locale, status, created_at, deleted_at
FROM reviews WHERE id = sqlc.arg(id);

-- name: UpdateOwnReview :execrows
UPDATE reviews SET rating = sqlc.arg(rating), text = sqlc.arg(text), locale = sqlc.arg(locale)::locale_code,
  updated_at = now()
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND deleted_at IS NULL;

-- name: SoftDeleteOwnReview :execrows
UPDATE reviews SET deleted_at = now(), updated_at = now()
WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND deleted_at IS NULL;

-- name: InsertReviewReport :execrows
INSERT INTO review_reports (review_id, reporter_user_id, reason)
VALUES (sqlc.arg(review_id), sqlc.arg(reporter_user_id), sqlc.arg(reason))
ON CONFLICT (review_id, reporter_user_id) DO NOTHING;

-- name: ListUserReviews :many
-- Every review the user still has, whatever its moderation status, newest first.
SELECT r.id, r.deal_id, r.merchant_id, r.user_id, r.voucher_id, r.rating, r.text, r.locale, r.status,
       r.created_at, d.slug AS deal_slug, d.title AS deal_title, m.display_name AS merchant_name,
       rr.id AS reply_id, rr.text AS reply_text, rr.created_at AS reply_created_at
FROM reviews r
JOIN deals d ON d.id = r.deal_id
JOIN merchants m ON m.id = r.merchant_id
LEFT JOIN review_replies rr ON rr.review_id = r.id
WHERE r.user_id = sqlc.arg(user_id) AND r.deleted_at IS NULL
ORDER BY r.created_at DESC, r.id DESC;
