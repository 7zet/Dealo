-- +goose Up
-- The project brand moved to Dealo, and phone-only accounts now get placeholder emails at
-- phone.dealo.local. Accounts created before that keep a placeholder at the old phone.*.local
-- host, which the API and web app would no longer recognise as a placeholder. Move them over,
-- skipping any row whose new address is already taken.
UPDATE users u
SET email = regexp_replace(u.email, '@phone\.[a-z0-9-]+\.local$', '@phone.dealo.local')
WHERE u.email ~ '@phone\.[a-z0-9-]+\.local$'
  AND u.email NOT LIKE '%@phone.dealo.local'
  AND NOT EXISTS (
    SELECT 1 FROM users o
    WHERE o.email = regexp_replace(u.email, '@phone\.[a-z0-9-]+\.local$', '@phone.dealo.local')
  );

-- +goose Down
-- The old host is not restored: placeholder addresses carry no information besides the phone.
SELECT 1;
