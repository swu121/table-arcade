-- Tablet pairing. A device row is written the moment staff pair a tablet, and
-- last_seen_at is refreshed (throttled) each time that tablet connects.
ALTER TABLE devices ADD COLUMN last_seen_at timestamptz;

CREATE INDEX devices_active_by_venue ON devices (venue_id, created_at) WHERE revoked_at IS NULL;

-- Whether a venue's tablets need a device token to connect. NULL means "the
-- server's default": required in production, open in development.
ALTER TABLE venues ADD COLUMN require_pairing boolean;
