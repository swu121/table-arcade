# Graceful shutdown

Goal: a deploy or restart is something the room barely notices. Today SIGTERM
kills the process outright — every socket drops and every live game, pending
challenge, thread, table status and notification goes with it, because tonight's
state lives in memory by design (`docs/plans/postgres.md`). The fix is not to
make tonight durable; it is to *suspend* each room on the way out and *resume*
it on the way back in, inside the same 60s reconnect grace a dropped tablet
already gets.

## Shutdown

`server/shutdown.js` — `gracefulShutdown({ httpServer, io, app, repos, timeout, retryIn })`,
wired to SIGTERM/SIGINT in `server/index.js`. In order:

1. `httpServer.close()` — no new HTTP connections. `app.closing()` — the venue
   namespace middleware *holds* any new socket instead of admitting it. (It must
   not reject: a middleware error makes socket.io-client destroy the socket and
   never retry. Held sockets are dropped by step 4 and reconnect like everyone else.)
2. Every room is snapshotted (`snapshotRoom`) and saved through
   `repos.snapshots.save(slug, snapshot)`; a room with nothing in it clears its
   snapshot instead.
3. Every connected socket gets `app:restarting { retryIn }`.
4. `io.close()` — every socket sees `transport close` and its reconnect loop
   starts. `repos.close()`, then exit 0.

The whole routine races an 8s timer: a hung database write logs and exits
anyway, since Fly gives up at `kill_timeout` (set to 10s) and a stale snapshot
is discarded on the next boot regardless.

## Snapshot format — `server/snapshot.js`

```js
snapshotRoom(room, now)            // -> { v: 1, slug, takenAt, tables, challenges, games, threads, tickets }
restoreRoom(room, snapshot, now)   // -> true if applied, false (with a log line) if discarded
```

- `tables` — everything on the table object except `socketId` and `viewing`
  (both belong to a socket that no longer exists). Bots included, since their
  history and inbox are state too.
- `challenges` — `expiresAt` becomes `expiresIn`, relative to `takenAt`.
- `games` — the envelope with `disconnectDeadline` as `disconnectIn` and
  `createdAt` as `age`; `state` goes through the game module's optional
  `snapshot(state, now)` / `restore(saved, now)` hooks. Turn games have no
  timing in their state; the race helper turns `startsAt` into `startsIn` and
  drops the `botsRunning` flag. A countdown still pending is re-anchored to the
  new clock; a run already underway keeps its original `startsAt`, because the
  tablets' local runs are anchored to it and never saw the restart.
- `threads` — `{ key, messages, readAt }` as they are; timestamps in messages
  and history are facts, not deadlines, and stay absolute.
- `tickets` — the room's ticket Map. Postgres already rehydrates open tickets;
  the file and memory backends keep tickets in memory, and this is what carries
  them across a restart there. Restore only adds tickets the room doesn't have.

Restore discards: a different `v`, a different `slug`, or `takenAt` older than
`RECONNECT_GRACE` (60s) — each with one log line — and never throws on a
malformed snapshot.

Timer handles are never stored. They are rebuilt from deadlines in
`resumeRoom(room)` (handlers.js): challenge expiry from `expiresAt`, bot accept
for a pending challenge to a bot, and each game's `ctx` plus `mod.resume(game, ctx)`
(default `mod.tick`) — the race helper's `resume` restarts each bot from its
current score and re-arms the two-minute ceiling from `startsAt`.

Every restored table starts with `socketId: null`. For an active game that
means both players are absent, which the disconnect handler only ever models one
at a time: restore marks the first human player gone with a fresh 60s
`disconnectDeadline`, and `table:claim` learns to hand the freeze to the *other*
player if they are still absent when the first one reconnects. So a game whose
tablets never return is voided by the sweep (against a bot) or claimable as a
forfeit (against a human), exactly as if the tablets had walked off.

## Storage

`repos.snapshots.save(slug, snapshot)` / `load(slug)` / `clear(slug)` on all
three backends:

| Backend | Where |
| --- | --- |
| Postgres | `room_snapshots (venue_slug PK, taken_at, data jsonb)`, migration `002_room_snapshots.sql` |
| File | `data/venues/<slug>/snapshot.json` |
| Memory | a Map |

## Restore on boot

`hydrate(room)` in handlers.js loads the snapshot after the plan and open
tickets, applies it with `restoreRoom`, re-arms timers with `resumeRoom`, and
clears the stored snapshot so a later crash-restart can't replay it. The room's
namespace middleware already waits on `room.ready`, so the first socket in sees
the restored room. Tablets reconnect on their own, re-send `table:claim` for the
number they hold, and the existing path picks them up: `goneTable` clears, the
frozen game unfreezes, pending deliveries flush.

## Client

`app:restarting` flips a `restarting` flag: the offline banner reads
"Restarting" instead of "Reconnecting" until the next `connect`. No reload —
socket.io's reconnect loop brings it back, and the Game screen keys on
`game.id`, which the snapshot preserves, so a mid-game tablet keeps its run.
The version handshake still fires after a deploy; the reload policy already
defers it past the game.

## Tests

`server/snapshot.test.js`:

- Round trip: a room with a signed-in table, a pending challenge, an active
  Connect 4 game against a bot, an active race game and a thread with unread
  messages; `buildSync` before and after (through a second `init` sharing the
  memory repos) is equal apart from socket-derived fields, and a second
  snapshot of the restored room equals the first.
- A server boots, plays into a game, runs `gracefulShutdown`; a second server
  on the same repos, the tablets reconnect and the same game continues, bot
  included. Clients saw `app:restarting`.
- A snapshot older than the grace, or from another `v`, is discarded with a
  log line and the room boots clean.

`server/db/backends.test.js` gains the snapshots contract for every backend.

## Docs

FEATURES.md Part 3 "Builds, restarts and crashes" and "State", Part 4; README
"Running it"; fly.toml comments and `kill_timeout`.
