# Table Arcade — feature reference

Every table in the bar has a tablet. A table claims its number, sees the rest of the room on
a floor plan, and challenges another table to a game with a menu item on the line. The loser's
tab covers it and a ticket lands on the staff screen so a server can run the item over.

This document covers what is actually built, from both sides of the room. Screenshots live in
[`screenshots/`](screenshots).

---

# Part 1 — The table side

## Claiming a tablet

Before any of this, a tablet in a production venue has to be **paired**: opened at the venue's
address, it shows a six-box code entry and nothing else until staff read a pairing code off
their screen and type it in (see [Devices](#devices)). That happens once per tablet.

A tablet with no table assigned shows a dead `00` and tells the guest to ask a server. Table
numbers belong to staff, so the way into the assignment keypad is a deliberate **1.2 second
press-and-hold** on the number, not a tap a guest can hit by accident.

![A tablet with no table assigned](screenshots/tablet-unassigned.png)

Staff hold the number, key in 1–99, and assign. The keypad refuses a number that is already in
play. The tablet remembers its number in `localStorage`, so a reload or a dropped connection
puts it back on the same table.

Assigning is not the same as being open for business. The tablet then shows a single
full-screen **Tap to play** target, and until someone taps it the rest of the floor cannot see
or reach the table. That is what stops an empty table from being challenged.

## Home

![The home screen](screenshots/home.png)

Two things to do — **Challenge** and **Gift** — plus a live count of how many tables are open
right now. Unread messages badge the Challenge tile, because conversations live on the same
floor plan as challenges. The header carries the table number (hold it to reassign) and an
inbox bell with an unread badge.

**Inbox.** Challenges, gifts and messages collect in a dropdown with sender, preview and a
relative timestamp. Opening the inbox marks everything read; tapping an entry jumps to it.
Capped at 40 entries.

**Toasts.** Short banners for the things that happen while you are looking elsewhere: a
challenge declined or timed out, a gift arriving, a message landing, a table dropping off.

**Offline banner.** If the socket drops, a `Reconnecting` bar appears at the top and the
tablet keeps retrying on its own.

## The floor plan

![Choosing a table to challenge](screenshots/floor-plan.png)

The floor plan is the real room — the bar, the kitchen, the entrance, the restrooms, and every
table drawn with its own shape and its own chairs. A table on screen is the table you are
sitting at, which is the whole point: you pick an opponent by looking across the room and
finding them on the plan.

Your own table wears a gold halo. Every other table carries a status:

| Status | Meaning |
| --- | --- |
| **Open** | Signed in and idle — can be challenged |
| **In a game** | Currently playing |
| **Deciding** | Has a challenge pending either way |
| Offline | Tablet disconnected; can still be messaged for when they return |

The same plan backs both modes, filtered to suit. **Gift** shows everyone on the floor.
**Challenge** shows open tables you could play plus every table you already share a thread
with — including ones you have blocked, so you can still find the thread and unblock them.
Tables with unread messages carry a count badge.

Tapping a table in challenge mode does one of two things:

- A table you have never dealt with opens the challenge sheet below. Sending the challenge
  creates a thread between the two tables and drops both of you straight into it, with the
  challenge as a live card until they answer.
- A table you already share a thread with opens that thread instead. There is a **Challenge**
  button in the thread header for the rematch; it is greyed out with a reason if either side
  is busy or the table is blocked.

## Sending a challenge

![Picking a game and a stake](screenshots/pick-game-and-stake.png)

Tapping a table opens a two-step sheet: pick one of the four games, then pick what you are
playing for. The stake total updates live and the button spells the whole thing out —
*Play Connect 4 for Wings, 6pc*.

The menu is eight items, drinks and food, $7 to $22:

| | | | |
| --- | --- | --- | --- |
| Draft Beer $7 | House Shot $9 | Truffle Fries $9 | Wings, 6pc $12 |
| Old Fashioned $14 | Loaded Nachos $14 | Smash Burger $16 | House Pitcher $22 |

Once sent, both tables are taken into the thread they share, where the challenge sits as a
live card above the composer with the same **30 second** countdown ring on both ends.

| Sender waits | Receiver decides |
| --- | --- |
| ![Waiting on the other table](screenshots/challenge-waiting.png) | ![An incoming challenge](screenshots/challenge-incoming.png) |

The sender can cancel; the receiver can accept or decline; if nobody answers it expires. Each
of those is written into the thread as a line from the room, and so is the game starting and
how it ended — who won, who walked away, and whose tab the stake landed on. The result screen
hands you back to the thread, so the whole history of two tables is in one place. If two tables challenge each other at the same moment, the lower table
number wins the race and the other one is told to answer the invite it already has.

## The games

Four games, two shapes. **Turn** games alternate; **race** games run both tables at once
against an identical, seeded course.

| Game | Mode | Shape | How it ends |
| --- | --- | --- | --- |
| **Connect 4** | turn | 7 columns × 6 rows | Four in a row, or a full board for a draw |
| **Beer Pong** | turn | 10 cups racked 4-3-2-1 | Sink all ten; a hit keeps the ball |
| **Soju Run** | race | 60 gates | Furthest run wins |
| **Stacker** | race | 15 rows × 7 columns | Most rows climbed wins |

### Connect 4

![Connect 4 mid-game](screenshots/connect4.png)

The challenged table moves first. Tap a column to drop; the winning line lights up. The rail on
the left is the same on every game: the stake you are playing for, both tables with the active
one marked, and a status panel that goes gold on your turn.

### Beer Pong

Two-phase aiming rather than a drag: a needle sweeps for **angle**, you tap to lock it, then a
bar fills for **power** and you tap again. The server turns those two numbers into a landing
point with a little scatter, and anything within the hit radius sinks. Sinking a cup keeps the
ball, so runs happen. Bots are given a fixed aim wobble drawn once per game, tuned to land
around a 40–65% hit rate — tight enough to be a threat, loose enough that the ball comes back.

### Soju Run

![Soju Run counting in](screenshots/soju-run.png)

Tap to flap a soju bottle through 60 gates. The gap narrows and drifts more the deeper you get,
so a long run is genuinely hard rather than just long. Both tables count in together from 3 and
fly the same course; the rail shows both scores and the opponent's progress as they go.

### Stacker

Time the sliding block and lock it. Only the overlap with the row below survives — the rest is
chopped off and thrown clear. The tower narrows at the two classic tiers (3 blocks, then 2,
then 1) and speeds up as it climbs, but the ramp is deliberately held above ~160ms per cell so
the top rows stay a read rather than a coin flip. Reaching row 15 is a top-out.

### Walking away

Every game has an exit, and the confirmation says what it costs before you take it: the match
goes to your opponent and the item you played for lands on your tab. That is the wager working
as intended rather than a penalty, so the result screen names it as walking away.

### If a tablet drops mid-game

The game freezes exactly as it stands and the other table gets a *hold tight* overlay with a
**60 second** countdown. If the missing table comes back inside that window, play resumes
untouched. If it does not, the remaining table can claim the win.

## Results and settlement

![Losing a wager](screenshots/result-lost.png)

Win, lose or draw, the result screen names the game, the opponent, the item and who is paying
— *your tab covers it* or *theirs does*. A draw moves nothing. A win throws confetti. Every
settled wager creates a ticket on the staff screen; a draw does not.

The result offers two ways out. **Back to the lobby** returns to the thread with the other
table, where the outcome is already written. **Rematch** — *Double or nothing* for the loser —
opens the challenge sheet with the same game and stake already picked, so a second round is one
tap away. Either can still be changed before sending.

## Gifts

![Sending a round to another table](screenshots/gift.png)

A gift is the same menu with none of the ceremony: pick an item, pick a table, and it goes
straight to the bar and onto **your** tab. There is nothing for the other table to accept —
they just get told a round is on its way, and a ticket appears for staff.

## Messaging

![A thread between two tables](screenshots/chat.png)

One thread per pair of tables, started by the first challenge between them and reopened from
the floor plan after that. Every challenge, answer and game result is noted in it. Free text
up to 280 characters, with an emoji picker organised into six tabs. Threads keep their last
200 messages.

Senders can see whether a message landed:

- **Sent** — accepted by the server
- **Delivered** — the other tablet is online
- **Read** — the other table has the thread open

A message that arrives while you are elsewhere raises a toast and an unread badge; if you
already have the thread open it is marked read and stays quiet.

**Mute** silences the alerts from a table but keeps the conversation. **Block** cuts them off
entirely — no messages, no gifts, no challenges — clears what they already sent, and declines
any challenge of theirs still standing. Blocked tables stay tappable on the challenge floor so
you can find the thread and undo it.

## Bots

Tables **12**, **17** and **20** are always occupied, spread across the plan's three zones so
the floor reads as busy on a demo night. They accept challenges after a beat, play all four
games, reply to messages in character, and say thanks for a round.

---

# Part 2 — The staff side

The staff screen lives at `/staff` and has three tabs: tickets, the floor plan editor, and the
venue's paired tablets.

## Tickets

![The staff ticket queue](screenshots/staff-tickets.png)

Every settled wager and every gift becomes a ticket. Each one says the item, **which table to
charge**, **which table to deliver to**, the price, and where it came from — the game that was
played, or *Gift*. Open tickets sit on top, newest first; delivered ones fade into a history
below. The header keeps a running count of how many are still to run and how much is sitting on
tabs.

Marking a ticket delivered is the only action, and it is one tap.

## Floor plan editor

![The floor plan editor](screenshots/staff-floor-plan.png)

The floor plan is not decoration, so staff can edit it to match the actual room. Tables and
fixtures are dragged into place on a snapping grid and resized with corner handles. Tables can
be renumbered, switched between round and rectangular, and given a seat count that changes the
chairs drawn around them. Fixtures cover the bar, kitchen, entrance, restrooms and plain walls.

Edits are local until saved, with an unsaved-changes marker and a save that refuses to run
while two tables share a number. Saving writes `data/venues/<slug>/floorplan.json` and pushes the new plan
live to every connected tablet. There is a reset to the default 21-table plan.

## Table inspector

![Inspecting a table](screenshots/staff-table-inspector.png)

Selecting a table opens a panel with its number, shape and seats, what it currently owes and is
owed, and its activity: sat down, challenged, played, won, lost, sent a round, went offline.
*What* tables said to each other is deliberately not shown — staff can see that two tables
talked, not the conversation.

**Clear table** is how a party is turned over, and because it is irreversible it opens a dialog
listing the tab, the tickets and the activity it is about to destroy first. Clearing wipes the
threads, notifications, history, mutes and blocks, and puts the tablet back to its unassigned
screen for the next party.

**Restart tablet** is for the one somebody is standing at saying it's stuck. It reloads on the
spot, comes back on the same table, and the restart is written into its activity. The header's
**Restart all tablets** is the gentler version for after a deploy or a bad night: every tablet
reloads at its next idle moment, and busy ones wait. The staff screen that pressed it stays put.

If a tablet crashed on its own, the activity says so — `Tablet app crashed · <message>` — so the
one staff are being asked about carries its own evidence.

## Devices

A new tablet cannot join a venue that requires pairing until staff let it in. **Pair a tablet**
— in the floor plan editor's header, and on the Devices tab — asks the server for a six-digit
code and shows it large with a countdown: it works once and lasts five minutes. On the tablet,
the pairing screen (six boxes and the same keypad as table setup) takes the code and the tablet
is in; it never has to be typed again. The **Devices** tab lists every paired tablet with its
label, whether it is online, when it was paired and last seen, and a **Revoke** button behind a
confirmation. Revoking drops the tablet's connection on the spot and sends it back to the
pairing screen. See [Pairing](#pairing) for how it is enforced.

---

# Part 3 — How it works

## The server owns the truth

Clients send intent — `{ column }`, `{ power, angle }` — and the server decides what happened.
A tablet cannot declare itself the winner, because the wager settles a real tab. State is
broadcast back as a whole-world `state:sync` over Socket.IO, filtered per table so a tablet only
receives what it is allowed to see.

## Games are plugged in

Games are registered in `server/games/index.js`. A module implements four functions:

```js
create({ players, first })   // initial state
view(game, me)               // what this player is allowed to see
action(game, me, payload)    // validate + apply a move
tick(game, ctx)              // drive the bot
```

Race games are built on a shared helper (`server/games/race.js`) that handles the count-in, the
two-minute ceiling, bot pacing and settling once both tables are done. A race game only supplies
a course builder and a bot profile — which is why Soju Run and Stacker are about thirty lines
each.

## Seeded courses

Both tablets in a race build their course from the same seed, so they render an identical run
without streaming any geometry between them. The seed is the only thing that crosses the wire.

## Venues

The server hosts many restaurants at once. The venue store lists them (a Postgres table, or
`data/venues.json` without a database); each entry is `{ slug, name, menu?, botTables? }`,
with the demo defaults filling anything left out. Tablets
load `/v/<slug>`, staff load `/v/<slug>/staff`, and the bare URL redirects to the first venue.

Each venue is a socket.io namespace (`/venue/<slug>`) and a *room*: one `createRoom()` call in
`server/state.js` that owns that venue's tables, challenges, games, tickets and conversations.
Handlers take the room as an explicit argument rather than reaching for module globals, so
nothing a tablet sends can address a table outside its own venue. Connecting to a namespace
whose slug isn't a venue is refused at the handshake, and the client shows a "no such venue"
screen instead of retrying.

## Pairing

A tablet is a device that can put items on a real tab, so the URL alone must not be enough to
become one. Each guest tablet holds a **device token** — 32 random bytes, base64url — issued by
that venue's staff and sent in the socket handshake (`auth: { token, version }`). The server
stores only the token's SHA-256 (`devices`: `venue_id`, `token_hash`, `label`, `created_at`,
`revoked_at`, `last_seen_at`; or `data/venues/<slug>/devices.json` without a database), so a
copy of the data is not a way in. The per-namespace middleware in `roomFor` looks the token up
after the room is hydrated; a missing, unknown, revoked or other-venue token gets
`connect_error: Unauthorized`. The client treats that like "no such venue": it disconnects,
clears the stale token, shows the pairing screen, and only reconnects once pairing succeeds.
`last_seen_at` is refreshed on connect, at most once a minute per device.

Tokens are minted by trading a **pairing code**: a six-digit, single-use code that lives in
memory for five minutes in the room that issued it (`room.pairing`, never the database). Staff
ask for one over the socket (`staff:pairCode`); the tablet posts it to
`POST /api/venue/:slug/pair` with `{ code, label? }` and gets `{ token, deviceId }` back, and
the code is burnt. Guesses are compared in constant time and limited to 10 a minute per IP and
per room. `staff:revokeDevice` marks the row revoked, tells every socket holding that device
(`device:revoked`) and disconnects it; the tablet lands on the pairing screen with the token
gone.

Enforcement is per venue: `requirePairing` in the venue row, defaulting to on in production and
off otherwise, so `npm run dev` and the tests pair nothing. The tests that cover the enforced
path (`server/pairing.test.js`) turn it on for their venue explicitly.

**Temporary:** a handshake carrying `auth: { staff: true }` is admitted without a token. That
is what the staff screen sends, and it means the staff URL is still open to anyone who has it.
Staff login is the next piece of work and replaces this hook (`authenticate` in
`server/pairing.js`).

## Builds, restarts and crashes

Tablets sit open for days and only ever run the code they loaded, so a deploy on its own
changes nothing on the floor. Every build gets a version — the git commit, or a timestamp —
stamped into the client bundle and written to `dist/version.json` for the server to read. A
tablet sends its version in the socket handshake; if it differs from the server's, the server
asks it to reload. The tablet decides when: not while a game, a challenge, a result or an open
thread is on screen. Staff restarts use the same channel, marked urgent when a person is standing
at the tablet. The dev server is always version `dev` on both sides and never asks.

A render crash is caught at the root, reported, and followed by a restart after a moment. Errors
outside rendering — a handler, a timer, a promise — are reported but left alone, since they
usually leave the screen intact and a reload mid-game would be worse. Reports go to
`POST /api/client-error` over plain HTTP, because the socket may be the casualty; the server
logs them and writes a `crash` entry into the table's activity.

Reloading can loop — a build that crashes on boot, a server that keeps asking — so a tab
remembers its recent reloads in `sessionStorage` and refuses a fourth inside a minute. When the
guard trips after a crash, the tablet shows a "keeps going wrong" screen with a restart button
instead of a blank page.

What a hung main thread cannot do is run any of this. A tablet stuck in a true infinite loop
stops answering socket.io's pings and drops to *Tablet offline* on the staff plan within about
half a minute; getting it back is a kiosk-app or physical restart.

## State

Two kinds. **Tonight's** state — seated tables, challenges, games, chat threads, notifications,
table history — lives in memory, per room, and stopping the process wipes it. **Durable** state
— venues, floor plans and tickets — goes through the repository layer in `server/db/` and comes
back when the server does.

Handlers never touch storage directly. Each room carries `repos`, and:

- On boot the venue list is read from the store (an empty store is the single demo venue).
- When a venue's room is first created it is *hydrated*: the saved floor plan (validated and
  clamped like any save) and every open ticket are loaded before the first socket's handlers
  attach, so the staff board after a restart is the board before it.
- Every ticket created, delivered or cleared, and every floor plan saved or reset, is written
  through in the background. The room's in-memory Map stays the source for every broadcast; a
  failed write is logged with the venue slug and never reaches a socket handler.

Which store is decided once at startup:

| `DATABASE_URL` | Backend | Venues | Floor plans | Tickets |
| --- | --- | --- | --- | --- |
| set | Postgres (`pg`) | `venues` | `floorplans` | `tickets` (open ones rehydrate) |
| unset | files under `DATA_DIR` (default `data/`) | `venues.json` | `venues/<slug>/floorplan.json` | memory, lost on restart |

The Postgres schema is versioned: `server/db/migrate.js` applies each `server/db/migrations/*.sql`
once, in order, recording it in `schema_migrations`, under an advisory lock so two machines
rolling at the same time cannot both create the tables. It runs at boot and as `npm run db:migrate`.
The first migration also creates `devices` (paired tablets, see [Pairing](#pairing)) and
`staff_users` (`venue_id`, `email`, `password_hash`, …), the latter unused until staff login
lands; the second adds `devices.last_seen_at` and `venues.require_pairing`. `npm run seed` upserts the venues in
`docs/venues.example.json` for a first deploy.

The in-memory backend behind the tests has the same interface, so every test runs without a
database; the Postgres backend's tests run against the same contract when `DATABASE_URL` is set
and are skipped otherwise.

## Tunables

| Setting | Value | Where |
| --- | --- | --- |
| Challenge expiry | 30s | `server/state.js` |
| Reconnect grace | 60s | `server/state.js` |
| Bot tables | 12, 17, 20 | `server/state.js`, per venue in the venue store |
| Menu and prices | 8 items | `server/state.js`, per venue in the venue store |
| Message length / thread / inbox / history | 280 / 200 / 40 / 40 | `server/state.js` |
| Reload loop guard | 3 reloads per 60s | `src/lib/reload.js` |
| Pairing code life / guesses / last-seen writes | 5 min, once / 10 per min per IP and room / once per min | `server/pairing.js` |
| Crash report rate | 5 per 60s per tablet | `src/lib/crash.js` |
| Race count-in and ceiling | 3.2s / 120s | `server/games/race.js` |
| Beer pong bot wobble | 0.11–0.2 | `server/games/beerpong.js` |
| Default floor plan | 21 tables, 4 fixtures | `server/floorplan.js` |

---

# Part 4 — Deliberately not built

This is a demo for pitching bar owners, not a pilot. The following are missing on purpose, not
by omission:

- **No database for the night itself.** A bar night is ephemeral; a restart wipes every live
  room. Only venues, floor plans and tickets persist (Postgres, or JSON on disk without one) —
  no game history, no chat archive.
- **No staff login yet.** Tables are identified by number and tablets by a device token staff
  issue when pairing, so a venue's slug alone no longer gets a tablet in. But anyone who reaches
  a venue's `/staff` URL can still run that floor — and, for now, pair tablets. The
  `staff_users` table exists for the login that closes this; nothing reads it yet.
- **No POS or payments.** "The loser's tab" is a ticket a human acts on, not an integration.
- **No sound.** Every game is silent.
- **No stats or leaderboards** for guests, and no analytics for staff beyond the open-ticket
  total.

Open questions a bar owner will reasonably ask, and which v1 does not answer: whether every
table even has a tab, what POS integration would take, and how the wager should be framed
legally.
