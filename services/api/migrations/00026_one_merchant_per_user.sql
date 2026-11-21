-- +goose Up
-- Pilot rule: an account works for at most one business. A second merchant role would make the
-- workspace silently pick one of them, so the database refuses it. Existing violations stop the
-- migration instead of being resolved by guesswork.
-- +goose StatementBegin
DO $$
DECLARE
  violators text;
BEGIN
  SELECT string_agg(user_id::text, ', ') INTO violators FROM (
    SELECT user_id FROM role_assignments WHERE merchant_id IS NOT NULL GROUP BY user_id HAVING count(*) > 1
  ) v;
  IF violators IS NOT NULL THEN
    RAISE EXCEPTION 'users with more than one merchant role must be resolved first: %', violators;
  END IF;
END
$$;
-- +goose StatementEnd
CREATE UNIQUE INDEX role_assignments_one_merchant_per_user ON role_assignments (user_id) WHERE merchant_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS role_assignments_one_merchant_per_user;
