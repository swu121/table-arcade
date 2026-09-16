# Admin

Goal: onboarding a restaurant is filling in a form, not editing JSON and
redeploying. Today venues come from `data/venues.json` or the `venues` table
via `npm run seed`, and the server reads the list once at boot — so a new
restaurant needs a file edit and a restart.

`/admin` is the platform operator's page: one login for the whole server (not
per-venue staff), a list of every venue with its live socket count, a form
that creates one, and a detail panel that edits its name, menu, bots and
pairing, adds its first staff account, issues a pairing code for its first
tablet, and archives it. Everything takes effect on the live server.

## Pieces

| Piece | Where | Notes |
| --- | --- | --- |
| Operator identity | `server/admin.js` | One platform operator, configured with `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (the `scrypt:N:r:p:salt:hash` format `server/db/staff.js` already writes and verifies). No row, no repo: an operator is not a venue's staff. |
| `npm run admin:hash` | `scripts/admin-hash.js` | Prints a hash for a password read from a hidden prompt or `ADMIN_PASSWORD`, to paste into `fly secrets set`. |
| Three modes | `server/admin.js` | **Configured:** both env vars set — the login form is the door. **Dev door:** `NODE_ENV !== 'production'` with neither set — `/admin` is open, with a visible "dev mode" note, mirroring the staff dev door. **Disabled:** production with neither set — `/admin` is 404 and every `/api/admin/*` route is 404, and the server logs once at boot that admin is off. |
| Sessions | `server/admin.js` `createAdminSessions()` | The pattern from `server/staff.js`, for a single global admin: 32 random bytes base64url, stored by SHA-256, 14-day expiry sliding on every use, in memory, gone on a restart. |
| Routes | `server/admin.js` `adminRouter()`, registered in `server/index.js` | `POST /api/admin/login` `{ email, password }` → `{ token, expiresAt, email }`; 401 `BAD_LOGIN` for a wrong email or password alike, 429 `TOO_MANY` past 10 tries a minute per IP (`server/ratelimit.js`, the limiter pairing and staff login share). `POST /api/admin/logout`, `GET /api/admin/status` → `{ enabled, dev, signedIn }`. Everything below needs the session (or the dev door). |
| Venue API | `server/admin.js` | `GET /venues` — slug, name, requirePairing, archived, botTables, menu, `devices`/`staff` counts, `live` and `sockets`. `POST /venues` — `{ slug, name, requirePairing?, botTables? }`, slug checked against `SLUG_PATTERN` and for uniqueness, menu starts from the default `MENU`. `PATCH /venues/:slug` — `name`, `requirePairing`, `botTables`, `menu` (an array of `{ id, name, price, icon }`, validated exactly as `venues.js` validates a loaded row), `archived`. `POST /venues/:slug/staff` — the venue's first account, through `repos.staff.create`. `POST /venues/:slug/pair-code` — `room.pairing.create()`, the same store the staff screen's **Pair a tablet** uses, so the first tablet can be paired remotely. No delete: `archived: true` hides a venue instead. |
| Live registry | `server/venues.js` `createVenueRegistry` | Mutable: `add(venue)` and `update(slug, patch)` alongside `all` / `get` / `find` / `every` / `default`. `update` merges through `normalise` and writes the result **into the existing object**, which is the same object every live room holds as `room.venue` — so a rename or a new menu is visible to the room without touching it. `get` and `all` skip archived venues; `find` and `every` do not, so the admin page can still see and un-archive one. `default()` is the first venue that is not archived. |
| Applying a change | `server/handlers.js` `init()` returns `addVenue` / `updateVenue` | `addVenue` puts the venue in the registry and writes through to `repos.venues.upsert`; nothing else is needed, because `roomFor` mints namespaces on demand — the venue is joinable on the next socket, with no restart. `updateVenue` updates the registry, writes through, then reconciles a live room: new bot tables are seated, dropped bots that are idle leave, and `syncAll(room)` re-sends the tablets and the staff screen. A menu change mid-game is fine — a game holds its own snapshot of the item it is played for. |
| Archiving | `server/handlers.js` `roomFor`, the namespace middleware | An archived venue is refused at the handshake like an unknown slug: `roomFor` returns null for it, and the middleware on a namespace that already exists refuses too, so archiving a live venue closes the door immediately. It also drops out of `venues.default()`, so the bare URL never lands on one. |
| Storage | `server/db/{file,postgres}.js`, `server/db/migrations/005_venue_archive.sql` | `archived` is a venue field: `normalise` carries it, the file backend writes it into `venues.json` (so a create survives a restart without a database), and Postgres gets a `venues.archived` column. |
| Route | `src/venue.js` `parseRoute` | `/admin` → `{ admin: true }`. The bare-URL redirect is unchanged; the admin page holds no socket. |
| Admin screen | `src/screens/Admin.jsx`, `src/lib/adminSession.js` | The app's visual style, plain `fetch`. Login form (or the dev-mode note), a venue list with live socket counts, a **New venue** form with the slug auto-suggested from the name, and a detail panel: name / pairing / bot tables, a menu editor (name, price, and an icon picked from the `ItemIcon` set), **Add first staff account**, **Issue pairing code** with the code and its countdown, links to the venue's tablet and staff URLs, and an Archive toggle. |
| Tests | `server/admin.test.js` | No session → 401; a bad password → 401; past the limit → 429; the dev door open with neither env var. Create a venue and connect a socket to its namespace with no restart. Patch the name and the menu and see it in a live room's next `state:sync`. An archived venue refused at the handshake and gone from `venues.default()`. First-staff creation, then that account signs in. A pair code issued from admin, then a tablet pairs with it. The file backend's `venues.json` round-trip after a create. |
| E2E | `e2e/env.js`, `e2e/serve.mjs`, `e2e/09-admin.spec.js` | `serve.mjs` sets `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (hashed at launch) for the production server. The spec signs in as admin, creates a venue, opens its tablet URL in a fresh context and sees the pairing screen, then issues a code from admin and pairs with it. |
| Docs | `README.md`, `docs/FEATURES.md`, `fly.toml` | README gets an "Onboarding a venue" section ahead of the seed CLI, which stays as the alternative. FEATURES gets an "Admin" section, Part 3 "Venues" gains the live registry and archiving, Part 4 is reworded. `fly.toml` documents the two secrets. |

## Order

1. `archived` through `normalise`, the file and Postgres backends, migration 005.
2. `createVenueRegistry`: `add`, `update`, `find`, `every`, archived-aware `get` / `all` / `default`.
3. `init()`: `addVenue`, `updateVenue`, the archived check in `roomFor` and the middleware.
4. `server/admin.js` — modes, sessions, router. Register in `server/index.js`. `scripts/admin-hash.js` and the npm script.
5. `server/admin.test.js`; keep every existing test green.
6. Client: `parseRoute`, `src/lib/adminSession.js`, `src/screens/Admin.jsx`, the `/admin` branch in `App.jsx`, `ICON_NAMES` out of `ItemIcon.jsx`.
7. `e2e/09-admin.spec.js` and the launcher's env. Docs. `npm test`, `npm run build`, `npx playwright test` twice. Commit.
