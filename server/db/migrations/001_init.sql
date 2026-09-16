-- Durable state. Everything about tonight (tables, challenges, games, chat)
-- stays in memory; these are the things that must outlive a deploy.

CREATE TABLE venues (
  id          bigserial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  menu        jsonb NOT NULL DEFAULT '[]'::jsonb,
  bot_tables  integer[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE floorplans (
  venue_slug  text PRIMARY KEY REFERENCES venues(slug) ON DELETE CASCADE ON UPDATE CASCADE,
  plan        jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
  id            text PRIMARY KEY,
  venue_slug    text NOT NULL REFERENCES venues(slug) ON DELETE CASCADE ON UPDATE CASCADE,
  from_table    integer NOT NULL,   -- the tab that pays
  to_table      integer NOT NULL,   -- the table the item goes to
  item          jsonb NOT NULL,     -- the menu item as it was at the time
  price         numeric(10, 2) NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('gift', 'wager')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'delivered')),
  game_id       text,
  game_name     text,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz
);

CREATE INDEX tickets_open_by_venue ON tickets (venue_slug, created_at DESC) WHERE status = 'open';

-- Tablet pairing, for the auth work that follows. Nothing writes here yet.
CREATE TABLE devices (
  id          bigserial PRIMARY KEY,
  venue_id    bigint NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

-- Staff login, likewise unused until the handlers exist.
CREATE TABLE staff_users (
  id             bigserial PRIMARY KEY,
  venue_id       bigint NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  email          text NOT NULL,
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz
);

CREATE UNIQUE INDEX staff_users_email_per_venue ON staff_users (venue_id, lower(email));
