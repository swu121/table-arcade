# Staff login

Goal: the staff screen is behind a per-venue login, enforced at the socket
handshake. Today any browser at `/v/<slug>/staff` sends `auth.staff = true`
and can deliver tickets, clear tables, restart tablets, pair and revoke
devices. Pairing left that as a marked temporary hook; this replaces it.

## Pieces

| Piece | Where | Notes |
| --- | --- | --- |
| `staff` repo | `server/db/staff.js`, `server/db/{postgres,file,memory}.js` | `create({ venue, email, password, name })`, `findByEmail(venue, email)`, `list(venue)` (active only), `revoke(id)`, `verify(venue, email, password)` → the user or `null`, and stamps `last_login_at`. Passwords hashed with `crypto.scrypt` (N=16384, r=8, p=1, 16-byte salt, 64-byte key), stored as `scrypt:N:r:p:salt:hash`, compared with `timingSafeEqual`; an unknown email still runs one scrypt so timing does not say which. Emails are trimmed, lower-cased, unique per venue; `EMAIL_TAKEN` / `BAD_EMAIL` / `WEAK_PASSWORD` (under 8 chars) are thrown with a `code`. File backend: `data/venues/<slug>/staff.json`. |
| Migration | `server/db/migrations/003_staff.sql` | `staff_users.name`, `staff_users.last_login_at`, an active-per-venue index. |
| Rate limiter | `server/ratelimit.js` | `createRateLimiter` moved out of `pairing.js` (which re-exports it) so login and pairing share one. |
| Sessions | `server/staff.js` `createStaffSessions()` | Per room, in memory: `sha256(token) → { userId, name, email, expiresAt }`. 32 random bytes, base64url, 14-day expiry sliding on every use (login response, handshake). A restart logs everyone out — acceptable now; **snapshot candidate** once `server/snapshot.js` lands, alongside the room's live state. |
| Routes | `server/index.js` (registration only), `server/staff.js` (handlers) | `POST /api/venue/:slug/staff/login` `{ email, password }` → `{ token, name, expiresAt }`; 401 `BAD_LOGIN` for a wrong password, unknown email or revoked user (same answer for all three), 429 `TOO_MANY` past 10 tries a minute per IP or per venue. `POST /api/venue/:slug/staff/logout` (bearer token or `{ token }`) drops the session and its sockets. `GET /api/venue/:slug/staff/status` → `{ dev: true }` only while the dev door is open, so the login screen can show "Continue (dev)". |
| Handshake | `server/handlers.js` `roomFor`, `server/staff.js` `authenticateStaff` | A handshake with `auth.staff` takes the staff path and never the device one: a valid session token sets `socket.data.staff = { id, name, email }` and `socket.data.staffSession`; anything else is `next(new Error('Unauthorized'))`. The `auth.staff === true` exemption in `pairing.js` is gone. **Dev door:** `auth.staff === 'dev'` is admitted as `{ id: 'dev', name: 'Developer', dev: true }` only when `NODE_ENV !== 'production'` *and* the venue has no active staff users. |
| Staff events | `server/handlers.js` | Every `staff:*` handler (including `staff:join`) runs through `staffOnly`, which drops the event with `fail(socket, 'FORBIDDEN', …)` when `socket.data.staff` is absent. New: `staff:addUser { name, email, password }`, `staff:revokeUser { id }` (refuses the last active user with `LAST_STAFF`; kicks that user's sockets with `staff:signedOut { reason: 'revoked' }`), `staff:users { users, me }` on join and on change. |
| Bootstrap | `scripts/staff-add.js` | `npm run staff:add -- <slug> <email> <name>`; password from `STAFF_PASSWORD` or a hidden prompt; whichever backend `DATABASE_URL` / `DATA_DIR` selects. |
| Client session | `src/lib/staffSession.js`, `src/socket.js` | `tablearcade.staff.<slug>` in localStorage: `{ token, name, expiresAt }`. The handshake sends `auth: { staff: <token>, version }` on the staff route; the socket does not auto-connect on the staff route until there is a session. |
| Login screen | `src/screens/StaffLogin.jsx`, `src/App.jsx` | Email + password in the Pairing/Setup shell; posts to the login route, stores the session, `socket.connect()`. Shown when there is no session, on `connect_error` "Unauthorized" (session cleared), and on `staff:signedOut`. "Continue (dev)" appears when `/staff/status` says the door is open and stores `{ token: 'dev' }`. |
| Staff UI | `src/App.jsx`, `src/screens/Devices.jsx` | "Signed in as *name* · Sign out" next to the tab strip on every staff screen. Third tab renamed **Devices & staff**, with a Staff section: name, email, last sign-in, Revoke (confirmed; not for yourself when you are the last), and an Add staff form. `app:error` from staff events shows as a toast. |
| Tests | `server/staff.test.js`, `server/db/backends.test.js`, `server/{pairing,rooms,reload}.test.js` | Repo contract on memory + file (+ postgres with `DATABASE_URL`); login endpoint good / bad password / unknown / revoked / rate limit; handshake no token, valid token, tablet sending `staff:deliver` refused, dev door only with no users and outside production; revoke kicks. Existing tests that drove staff with `staff: true` use `staff: 'dev'`. |
| E2E | `e2e/env.js`, `e2e/serve.mjs`, `e2e/helpers.js`, `e2e/08-staff-login.spec.js` | The suite runs in production, so `serve.mjs` seeds `STAFF` into each venue through the file backend. `floor.staff(slug)` logs in via `staffPage`; a new spec covers a wrong password, sign out, and the staff list. |
| Docs | `README.md`, `docs/FEATURES.md` | README: running it, first staff user, the dev door. FEATURES Part 2 (login, staff management), Part 3 "Staff login" next to "Pairing", Part 4 drops "anyone who reaches /staff". |

## Order

1. Migration, `server/db/staff.js`, the three backends, contract tests.
2. `server/ratelimit.js`; `server/staff.js` (sessions, handshake, routes, list/broadcast/kick).
3. Wire `handlers.js` (middleware, `staffOnly`, new events) and `index.js` routes; fix existing tests; `server/staff.test.js`.
4. `scripts/staff-add.js` and the npm script.
5. Client: session store, socket auth, StaffLogin, gate, header control, Devices & staff.
6. E2E seed, helper, spec. Docs. `npm test`, `npm run build`, `npm run test:e2e` twice. Commit.
