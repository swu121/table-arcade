export const MENU = [
  { id: 'draft', name: 'Draft Beer', price: 7, icon: 'beer' },
  { id: 'shot', name: 'House Shot', price: 9, icon: 'shot' },
  { id: 'fries', name: 'Truffle Fries', price: 9, icon: 'fries' },
  { id: 'wings', name: 'Wings, 6pc', price: 12, icon: 'wings' },
  { id: 'old-fashioned', name: 'Old Fashioned', price: 14, icon: 'cocktail' },
  { id: 'nachos', name: 'Loaded Nachos', price: 14, icon: 'nachos' },
  { id: 'burger', name: 'Smash Burger', price: 16, icon: 'burger' },
  { id: 'pitcher', name: 'House Pitcher', price: 22, icon: 'pitcher' }
]

export const CHALLENGE_TTL = 30_000
export const RECONNECT_GRACE = 60_000
// Spread across the default floor plan's three zones so the demo floor reads as busy.
export const BOT_TABLES = [12, 17, 20]

export const tables = new Map()
export const challenges = new Map()
export const games = new Map()
export const tickets = new Map()

let seq = 0
export const nextId = (prefix) => `${prefix}_${(++seq).toString(36)}${Date.now().toString(36)}`

export function makeTable(number, isBot = false) {
  return {
    number,
    socketId: null,
    status: isBot ? 'idle' : 'gone',
    challengeId: null,
    gameId: null,
    lastResult: null,
    isBot
  }
}

export function seedBots() {
  for (const n of BOT_TABLES) tables.set(n, makeTable(n, true))
}
