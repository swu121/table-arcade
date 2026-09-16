# Postgres persistence

Goal: a restart or deploy no longer loses the things a bar owner set up or is
owed. Live state — tables, challenges, games, chat, notifications — stays in
memory per room exactly as it is; only *durable* data gets a second home.

## What is durable

| Table | Rows | Notes |
| --- | --- | --- |
| `venues` | one per restaurant | `slug`, `name`, `menu` (jsonb), `bot_tables` (int[]) — the `{ slug, name, menu, botTables }` shape from `server/venues.js` |
| `floorplans` | one per venue | `plan` jsonb, the exact object `cleanPlan()` produces |
| `tickets` | every settled wager and gift | `from_table` (owes), `to_table` (owed), `item` jsonb, `price`, `kind` gift/wager, `status` open/delivered, `created_at`, `delivered_at`, plus `game_id`/`game_name`/`reason` so a rehydrated ticket is indistinguishable from a live one |
| `devices` | created now, unused | `venue_id`, `token_hash`, `label`, `created_at`, `revoked_at` — for tablet pairing |
| `staff_users` | created now, unused | `venue_id`, `email`, `password_hash`, `created_at`, `revoked_at` — for staff login |
| `schema_migrations` | one per applied SQL file | written by the migration runner |

In-memory tickets say `status: 'pending'`; the database says `open`. The
mapping lives in one place (`server/db/tickets.js`) so the client payload does
not change.

## Modules

```
server/db/
  index.js        createRepos({ databaseUrl, dataDir }) → picks a backend
  tickets.js      ticket <-> row mapping shared by every backend
  memory.js       Maps only (tests, and the no-DATA_DIR case)
  file.js         data/venues.json + data/venues/<slug>/floorplan.json; tickets in memory
  postgres.js     pg Pool, runs migrations on open
  migrate.js      versioned runner over server/db/migrations/*.sql
  migrations/
    001_init.sql
scripts/seed.js   upserts docs/venues.example.json into Postgres
```

Every backend exposes the same interface, all async:

```js
repos.venues.list()                    // -> [{ slug, name, menu, botTables }]
repos.venues.upsert(venue)
repos.floorplans.get(slug)             // -> plan | null
repos.floorplans.save(slug, plan)
repos.tickets.create(slug, ticket)     // in-memory ticket shape
repos.tickets.deliver(slug, id, deliveredAt)
repos.tickets.openFor(slug)            // -> [ticket] in-memory shape
repos.tickets.clearFor(slug, table)    // staff cleared the table; its tickets go too
repos.close()
```

Backend choice at startup (`server/index.js`): `DATABASE_URL` set → postgres;
otherwise file, rooted at `DATA_DIR` (default `data/`). `init()` in
`handlers.js` defaults to the memory backend, so every existing test runs
unchanged and without a database.

## Changes to handlers

- `init(io, { repos, venues })` — venues are loaded by the caller from the
  repo (`loadVenues(repos)` in `venues.js`, which keeps today's fallback to the
  single demo venue when the store is empty).
- `roomFor(slug)` still creates the room synchronously, then starts
  `room.ready = hydrate(room)`: load the floor plan and open tickets from the
  repo into the room's plan store and `tickets` Map. A namespace middleware
  awaits `room.ready` before a socket's handlers attach, so the first tablet to
  connect after a restart already sees the rehydrated board.
- The plan store (`floorplan.js`) no longer touches the filesystem. It holds
  the plan in memory and calls a `persist` hook on save/reset; the hook writes
  through to `repos.floorplans.save`.
- `endGame`, `gift:send`, `staff:deliver` and `wipeTable` write through to
  `repos.tickets` fire-and-forget. Failures are logged with the venue slug,
  never thrown — the in-memory Map remains the source for every broadcast.

## Tests

- `server/db/backends.test.js` — one interface contract, run against the
  memory backend, the file backend (temp dir; venues and plans re-read from
  disk by a second repo instance) and, when `DATABASE_URL` is set, Postgres.
- `server/db/migrate.test.js` — the runner applies files in order and is
  idempotent; skipped without `DATABASE_URL`.
- `server/rooms.test.js` — new cases: a ticket and a plan saved to the repo
  before boot appear on the staff board of a freshly created room; a ticket
  created in one server instance is on the board of a second instance sharing
  the repo, and delivering it there is remembered too.

## Deploy

`fly secrets set DATABASE_URL=...` (Fly Postgres or any hosted instance).
Migrations run at boot; `npm run seed` inserts the venues from
`docs/venues.example.json` once. No volume.
