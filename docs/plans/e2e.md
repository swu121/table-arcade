# Browser tests

Server rules are covered by `npm test`. This adds end-to-end tests that drive the built
client in a real browser against the real server, so a change to a screen, a socket event
or the venue routing shows up as a failing test rather than a broken demo.

## Tooling

- `@playwright/test`, Chromium only, tablet viewport 1024×768. `npm run test:e2e`.
- Config in `playwright.config.js`; specs and helpers in `e2e/`.
- One worker, no retries. The server keeps every table in memory, so specs run in order
  and each one uses its own table numbers (routes: none; claim: 1–2; challenge: 3–4;
  chat: 5–6; gift: 7–8; floor plan: staff only; isolation: 10–11).

## Server

Playwright's `webServer` runs `node e2e/serve.mjs`, which:

1. wipes and recreates `$TMPDIR/table-arcade-e2e` and writes a `venues.json` with two
   venues — `demo` (the defaults, bots at 12/17/20) and `annex` (no bots);
2. runs `vite build`;
3. starts `server/index.js` with `PORT=3457 NODE_ENV=production DATA_DIR=<that dir>`.

Playwright waits on `/healthz` and kills the process tree when the run ends. Every run
starts from a clean data dir, so the floor-plan save test can write to disk safely.

## Simulating tablets

A tablet is a browser context: its own localStorage (where the tablet remembers its table
number, per venue) and its own socket. `e2e/helpers.js` exposes a `floor` fixture that
opens contexts and closes them all after each test, plus:

- `seatTablet(page, number)` — press-and-hold the table number for 1.2s (`page.mouse`
  down, wait, up — `useHold` listens to pointer events, which Chromium fires from mouse
  input), key in the number on the keypad, "Assign this table", then "Tap to play".
- `tableOnPlan(page, number)` — a table on the floor plan SVG, via the `data-table`
  attribute added to each table group (the only markup change; class and text
  locators were ambiguous because the editor also draws seat counts as text).
- `challengeTable(pageA, numberB, { game, item })` — the wager sheet flow.

Locators are role/text based everywhere else.

## Flows

| Spec | Covers |
| --- | --- |
| `01-routes` | `/` and `/staff` redirect to the default venue; `/v/nowhere` shows the no-venue screen |
| `02-claim` | hold, key in, assign, tap to play; home shows the table number and open count; a reload remembers the table; a taken number is refused |
| `03-challenge` | A challenges B at Connect 4; B accepts; both reach the game; A forfeits; both see a result; the thread notes it; staff see the ticket |
| `04-chat` | A challenges, B declines and leaves the thread; A messages; B gets the badge and toast, opens the thread; A's receipt flips to Read |
| `05-gift` | A gifts B; both toasted; staff ticket; mark delivered |
| `06-floorplan` | staff drag a table, save; the file on disk and a reloaded editor agree |
| `07-isolation` | a table seated in `annex` is offline on `demo`'s plan and not in its open count, and vice versa |
