# Tablet pairing

Goal: a tablet has to hold a device token issued by that venue's staff before
its socket is admitted to the venue namespace. Today anyone who knows
`/v/<slug>` can claim a table and put items on a real tab.

## Pieces

| Piece | Where | Notes |
| --- | --- | --- |
| `devices` repo | `server/db/{postgres,file,memory}.js` | `issue({ venue, label })` → `{ id, token, … }` (plaintext token once); `find(tokenHash)`; `list(venue)` (active only); `revoke(id)`; `touch(id)`. Tokens: 32 random bytes, base64url; only the SHA-256 hash is stored. File backend: `data/venues/<slug>/devices.json`. |
| Migration | `server/db/migrations/002_devices.sql` | `devices.last_seen_at`, `venues.require_pairing` (nullable — null means "the code's default"). |
| `venue.requirePairing` | `server/venues.js` `normalise` | Default `NODE_ENV === 'production'`; explicit `true`/`false` in the venue row wins. Dev server and existing tests are unchanged. |
| Pairing codes and handshake | `server/pairing.js` | Per-room in-memory store of 6-digit codes (5 min, single use, `crypto.randomInt`, `timingSafeEqual`). Per-IP and per-room guess limiter (10/min). `authenticate(room, socket)` for the namespace middleware. `pairHandler({ roomFor })` for the HTTP route. `broadcastDevices(room)` for the staff list. |
| Route | `server/index.js` | One line: `POST /api/venue/:slug/pair` → `{ code, label? }` → `{ token, deviceId }`. |
| Handshake | `server/handlers.js` `roomFor` | The existing `nsp.use` waits for `room.ready`, then `authenticate`. Failure → `next(new Error('Unauthorized'))`. `socket.data.deviceId` set; `touch` on connect, throttled to once a minute per device. The temporary `auth.staff === true` exemption that shipped with this was replaced by [staff login](staff-login.md). |
| Staff events | `server/handlers.js` | `staff:pairCode` → `staff:pairCode { code, expiresAt }`; `staff:revokeDevice { id }` kicks live sockets for that device with `device:revoked`; `staff:devices` list on join and on change. |
| Client token | `src/lib/device.js` | `tablearcade.device.<slug>` in localStorage; `pairDevice(code)` posts to the route. `src/socket.js` sends `auth: { token, version, staff }` (auth is a function so a reconnect picks up a fresh token). |
| Pairing screen | `src/screens/Pairing.jsx`, `src/App.jsx` | `connect_error` "Unauthorized" → disconnect, clear the stale token, show the screen. Six boxes + the Setup keypad. Success stores the token and calls `socket.connect()`. `device:revoked` does the same. |
| Staff UI | `src/screens/FloorPlanEditor.jsx`, `src/components/PairCode.jsx`, `src/screens/Devices.jsx` | "Pair a tablet" in the editor header shows the code large with a countdown. A third nav tab, Devices, lists label / last seen / online with Revoke. |
| Tests | `server/pairing.test.js`, `server/db/backends.test.js` | Repo contract on memory + file (+ postgres when `DATABASE_URL`); pair endpoint (valid, reused, expired, rate limit); handshake (no token, valid, revoked, `requirePairing: false`). |
| Docs | `README.md`, `docs/FEATURES.md` | Part 2 staff, Part 3 "Pairing", Part 4 reworded. |

## Order

1. Migration + `devices` repo on all three backends + contract tests.
2. `requirePairing` in `normalise` and the venue rows.
3. `server/pairing.js`; wire the middleware, staff events, and the route.
4. Server tests.
5. Client: device.js, socket auth, Pairing screen, staff UI.
6. Docs, `npm test`, `npm run build`, commit.
