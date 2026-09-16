-- Staff login. A staff user is written by `npm run staff:add` or from the
-- staff screen; last_login_at is stamped by each successful login.
ALTER TABLE staff_users ADD COLUMN name text;
ALTER TABLE staff_users ADD COLUMN last_login_at timestamptz;

CREATE INDEX staff_users_active_by_venue ON staff_users (venue_id, created_at) WHERE revoked_at IS NULL;
