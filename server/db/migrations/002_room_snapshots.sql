-- A room, suspended across a planned restart. Written by graceful shutdown,
-- read and cleared by the first boot after it, and discarded by that boot if
-- it is older than the reconnect grace. Never something a person looks at.

CREATE TABLE room_snapshots (
  venue_slug  text PRIMARY KEY REFERENCES venues(slug) ON DELETE CASCADE ON UPDATE CASCADE,
  taken_at    timestamptz NOT NULL,
  data        jsonb NOT NULL
);
