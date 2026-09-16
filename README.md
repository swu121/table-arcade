# Table Arcade

Tablet games for a bar, played table against table. You claim a table number, challenge
another table on the floor plan, and pick something off the menu to play for. The loser's
tab covers it, and a ticket lands on the staff screen so a server can run the item over.

![Choosing a table to challenge](docs/screenshots/floor-plan.png)

The floor plan is the real room, so a table on screen is the table you're sitting at — you
pick an opponent by looking across the bar and finding them on the plan. Yours is the gold
one; the rest are open, in a game, or deciding.

## Playing for something

![Picking a game and a stake](docs/screenshots/pick-game-and-stake.png)

Pick a game, pick what you're playing for, and the other table gets thirty seconds to answer.

| | |
| --- | --- |
| ![An incoming challenge](docs/screenshots/challenge-incoming.png) | ![Losing a wager](docs/screenshots/result-lost.png) |

Win, lose or draw, the result screen says who's paying. Every settled wager becomes a ticket.

## The games

| Game | Format | How it ends |
| --- | --- | --- |
| **Connect 4** | Turn-based | Four in a row, or a filled board for a draw |
| **Beer Pong** | Turn-based | Sink all ten cups; a hit keeps the ball |
| **Soju Run** | Simultaneous race | Fly the bottle through gates, furthest run wins |
| **Stacker** | Simultaneous race | Climb 15 rows as the tower narrows and speeds up |

![Connect 4 mid-game](docs/screenshots/connect4.png)

Every table plays a bot if there's no human opponent, so the floor always looks busy. Every
game also has a way out: quit and the match goes to your opponent, with the item you played
for on your tab.

## Talking, and buying rounds

| | |
| --- | --- |
| ![A thread between two tables](docs/screenshots/chat.png) | ![Sending a round](docs/screenshots/gift.png) |

A challenge opens a thread between the two tables — with read receipts, muting and blocking —
and tapping that table on the floor afterwards drops you back into it, rematch button included.
Or skip the game entirely and send a round, which goes straight to the bar on the sender's tab.

## Staff screen

`/staff` is behind a login — each venue has its own staff accounts — and has three tabs.

![The staff ticket queue](docs/screenshots/staff-tickets.png)

**Tickets** — every settled wager and gift, who to charge, who to deliver to, and a "mark
delivered" button, with a running total of what's sitting on tabs.

![The floor plan editor](docs/screenshots/staff-floor-plan.png)

**Floor plan** — a drag-and-drop editor for the room layout. Tables get dragged, resized,
renumbered and reshaped; edits save to `data/venues/<slug>/floorplan.json` and push live to every
connected tablet in that venue. Selecting a table shows its tab and its activity, and clearing it for the next party
takes a confirmation listing what's about to go. A stuck tablet can be restarted from here, one
at a time or all at once, and a tablet that crashed on its own says so in its activity.

**Devices & staff** — the tablets staff have paired with this venue, and the accounts that can
sign in. In production a tablet can't join a venue until staff press **Pair a tablet** (here or
in the floor plan editor's header), read the six-digit code off the screen, and type it into
the tablet. The list shows each device's label, when it was last seen, and a Revoke button that
drops it on the spot. Below it, every staff account with when it last signed in, a Revoke that
signs them out everywhere, and a form to add the next one. See
[pairing](docs/FEATURES.md#pairing) and [staff login](docs/FEATURES.md#staff-login).

Every build carries a version, and a tablet still running an older one is told to reload the
next time it connects — at its next idle moment, never mid-game. See
[the feature reference](docs/FEATURES.md#builds-restarts-and-crashes).

## How it fits together

The server owns the truth. Clients send intent (`{ column }`, `{ power, angle }`) and the
server decides what happened — a tablet can't declare itself the winner, because the wager
settles a real tab.

Games are plugged in through a small registry (`server/games/index.js`). A module implements:

```js
create({ players, first })   // initial state
view(game, me)               // what this player is allowed to see
action(game, me, payload)    // validate + apply a move
tick(game, ctx)              // drive the bot
```

Two modes exist: `turn` (Connect 4, Beer Pong) and `race` (Soju Run, Stacker), where both
tables play at once against a shared seeded course. The seed means both tablets render an
identical run without streaming any geometry between them.

## Venues

One server runs any number of restaurants. Each is a **venue** with its own slug, name, menu,
bot tables, floor plan and paired tablets, listed in `data/venues.json` (see
[`docs/venues.example.json`](docs/venues.example.json)). Onboarding a restaurant is adding an
entry there; nothing gets deployed.

- Guest tablets — `/v/<slug>`
- Staff — `/v/<slug>/staff`
- The bare URL sends you to the first venue listed, so the single-venue demo still works.

Every venue is its own socket.io namespace and its own in-memory room (`server/state.js`,
`createRoom`). A tablet only ever holds a connection into one namespace, and every handler
resolves tables, challenges, games, tickets and chat threads from that one room — so a table in
one restaurant cannot see, message, challenge or be billed by a table in another, by
construction rather than by a check. `server/rooms.test.js` proves it.

Live state — who's seated, challenges, games, chat — lives in memory, and stopping the process
wipes it. What has to outlive a deploy goes through a small repository layer (`server/db/`):
venues, floor plans, tickets and paired devices. Set `DATABASE_URL` and those live in Postgres;
leave it unset and venues, plans and devices are JSON under `data/` (or `DATA_DIR`) with tickets
kept in memory.

A guest tablet needs a device token to join a venue — staff issue one by pairing it with a
six-digit code — so knowing a venue's URL isn't enough to put items on a real tab. Pairing is
enforced when `NODE_ENV=production` (or per venue with `requirePairing` in the venue row); the
dev server leaves it off. The staff screen needs a staff session: an email and password per
venue (`staff_users`, or `data/venues/<slug>/staff.json`), checked at the socket handshake, so
the staff URL on its own runs nothing.

Live state — who's seated, challenges, games, chat — lives in memory. What has to outlive a
deploy goes through a small repository layer (`server/db/`): venues, floor plans and tickets.
Set `DATABASE_URL` and those live in Postgres; leave it unset and venues and plans are JSON
under `data/` (or `DATA_DIR`) with tickets kept in memory. A planned restart is the one
exception for live state: on SIGTERM every room is snapshotted through the same layer and picked
back up on the next boot, so a deploy mid-game is a few seconds of "Restarting" on the tablet
and then the same board.

## Running it

```sh
npm install
npm run dev
```

- Guest tablets — `http://localhost:5173/v/demo`
- Staff — `http://localhost:5173/v/demo/staff`

`npm run dev` prints every venue with a LAN address, which is what the tablets actually point at.

The staff screen asks you to sign in. On the dev server a venue with no staff accounts yet
offers **Continue (dev)** instead, so the first run is one click; add an account from the
Devices & staff tab (or below) and that door closes.

### The first staff user

```sh
npm run staff:add -- demo owner@example.com Sam
```

Prompts for a password (or reads `STAFF_PASSWORD`) and writes the account to whichever store
the server uses — `data/venues/demo/staff.json`, or Postgres when `DATABASE_URL` is set. Once
one account exists, the rest are added from the staff screen. In production this is the only
way in: a venue with no accounts has no staff screen.

```sh
npm test            # game rules, venue isolation, persistence, pairing, staff login, restarts — no database needed
npm run test:e2e    # browser tests: tablets and staff screen, in Chromium
npm run build       # production client bundle
npm start           # serve the built client from the node server
```

Stopping the server (Ctrl-C, or SIGTERM from a deploy) is graceful: it snapshots every room,
tells the tablets it is restarting, and exits within 8s. Start it again inside a minute and
the tablets reconnect to the same games and threads; leave it longer and the snapshot is
discarded. Without Postgres the snapshot sits at `data/venues/<slug>/snapshot.json`.

### With Postgres

```sh
export DATABASE_URL=postgres://user:pass@host:5432/tablearcade
npm run seed        # inserts the venues from docs/venues.example.json (safe to re-run)
npm start           # migrations in server/db/migrations/ run at boot
```

`npm run db:migrate` applies pending migrations without starting the server. Tests against
the Postgres backend run only when `DATABASE_URL` is set, and are skipped otherwise.

On Fly, `fly secrets set DATABASE_URL=...` and deploy; no volume is needed. Then
`fly ssh console -C "npm run seed"` once, and
`fly ssh console -C "STAFF_PASSWORD=... npm run staff:add -- <slug> <email> <name>"` per venue.

### Browser tests

`npm run test:e2e` runs the Playwright suite in `e2e/`. It builds the client, starts the
production server on port 3457 with a throwaway `DATA_DIR` holding two venues (each seeded
with one staff account), and drives real tablets — each one a browser context with its own
localStorage and socket — through claiming a table, challenging, playing, chatting, gifting,
the staff login, the staff ticket board and the floor plan editor, plus cross-venue isolation. Chromium is the only browser; install it once
with `npx playwright install chromium`. The plan is in [`docs/plans/e2e.md`](docs/plans/e2e.md).

## Layout

```
server/
  index.js        http + socket.io entry
  venues.js       the venue list: slug, name, menu, bot tables
  handlers.js     lobby, challenges, games, tickets — one room per venue
  pairing.js      pairing codes, the device-token handshake, POST /api/venue/:slug/pair
  staff.js        staff sessions, the staff handshake, /api/venue/:slug/staff/{login,logout,status}
  ratelimit.js    the sliding-window limiter pairing and login share
  state.js        createRoom(): per-venue in-memory tables/games/tickets/chat
  snapshot.js     a room written down for a restart, and read back
  shutdown.js     SIGTERM: suspend every room, tell the tablets, close, exit
  floorplan.js    per-venue layout: default plan, validation, in-room store
  rooms.test.js   two venues on one server can't reach each other; rooms rehydrate
  db/             repository layer: postgres | file | memory, migrations, seed target
  games/          one module per game, plus rng + shared race logic
scripts/
  seed.js         put docs/venues.example.json into Postgres on a first deploy
  staff-add.js    the first staff account for a venue
src/
  screens/        lobby, game host, per-game screens, result, staff
  components/     board, chrome, icons
  styles/         Tailwind v4 theme and per-game CSS
e2e/
  helpers.js      tablets as browser contexts, the staff sign-in, the hold-to-assign gesture
  *.spec.js       routes, claim, challenge, chat, gift, floor plan, isolation, staff login
  serve.mjs       builds the client and starts the server for the suite
```

Built with React, Vite, Tailwind, Express and socket.io. Designed for a landscape tablet.

## Full feature list

[`docs/FEATURES.md`](docs/FEATURES.md) documents both sides of the room in detail — the whole
guest flow, each game's rules, messaging and gifts, the staff tools, the architecture, and
what was deliberately left out.
