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

`/staff` has two tabs.

![The staff ticket queue](docs/screenshots/staff-tickets.png)

**Tickets** — every settled wager and gift, who to charge, who to deliver to, and a "mark
delivered" button, with a running total of what's sitting on tabs.

![The floor plan editor](docs/screenshots/staff-floor-plan.png)

**Floor plan** — a drag-and-drop editor for the room layout. Tables get dragged, resized,
renumbered and reshaped; edits save to `data/venues/<slug>/floorplan.json` and push live to every
connected tablet in that venue. Selecting a table shows its tab and its activity, and clearing it for the next party
takes a confirmation listing what's about to go.

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
bot tables and floor plan, listed in `data/venues.json` (see
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
venues, floor plans and tickets. Set `DATABASE_URL` and those live in Postgres; leave it unset
and venues and plans are JSON under `data/` (or `DATA_DIR`) with tickets kept in memory. There's
no auth yet.

## Running it

```sh
npm install
npm run dev
```

- Guest tablets — `http://localhost:5173/v/demo`
- Staff — `http://localhost:5173/v/demo/staff`

`npm run dev` prints every venue with a LAN address, which is what the tablets actually point at.

```sh
npm test            # game rules, venue isolation, persistence backends — no database needed
npm run build       # production client bundle
npm start           # serve the built client from the node server
```

### With Postgres

```sh
export DATABASE_URL=postgres://user:pass@host:5432/tablearcade
npm run seed        # inserts the venues from docs/venues.example.json (safe to re-run)
npm start           # migrations in server/db/migrations/ run at boot
```

`npm run db:migrate` applies pending migrations without starting the server. Tests against
the Postgres backend run only when `DATABASE_URL` is set, and are skipped otherwise.

On Fly, `fly secrets set DATABASE_URL=...` and deploy; no volume is needed. Then
`fly ssh console -C "npm run seed"` once.

## Layout

```
server/
  index.js        http + socket.io entry
  venues.js       the venue list: slug, name, menu, bot tables
  handlers.js     lobby, challenges, games, tickets — one room per venue
  state.js        createRoom(): per-venue in-memory tables/games/tickets/chat
  floorplan.js    per-venue layout: default plan, validation, in-room store
  rooms.test.js   two venues on one server can't reach each other; rooms rehydrate
  db/             repository layer: postgres | file | memory, migrations, seed target
  games/          one module per game, plus rng + shared race logic
scripts/
  seed.js         put docs/venues.example.json into Postgres on a first deploy
src/
  screens/        lobby, game host, per-game screens, result, staff
  components/     board, chrome, icons
  styles/         Tailwind v4 theme and per-game CSS
```

Built with React, Vite, Tailwind, Express and socket.io. Designed for a landscape tablet.

## Full feature list

[`docs/FEATURES.md`](docs/FEATURES.md) documents both sides of the room in detail — the whole
guest flow, each game's rules, messaging and gifts, the staff tools, the architecture, and
what was deliberately left out.
