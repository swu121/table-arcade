import { test as base, expect } from '@playwright/test'
import { STAFF, contextOptions } from './env.js'

export { expect }

/* --------------------------------------------------------------- staff --- */

export const loginForm = (page) => page.getByText('Staff sign in', { exact: false })
export const ticketBoard = (page) => page.getByRole('heading', { name: 'Open tickets' })

// Signs the page in as the seeded staff user and waits for the ticket board.
export async function signInStaff(page, { email, password } = STAFF) {
  await expect(loginForm(page)).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(ticketBoard(page)).toBeVisible()
}

// A staff screen for the venue, signed in. The context's localStorage starts
// empty, so every staff page begins at the login form.
export async function staffPage(page, slug) {
  await page.goto(`/v/${slug}/staff`)
  await signInStaff(page)
  return page
}

// How long the table number has to be held before the keypad appears
// (src/lib/hold.js), plus some slack.
const HOLD_MS = 1200 + 400

export const pad = (n) => String(n).padStart(2, '0')

// Every tablet is its own browser context: its own localStorage, where the
// tablet remembers which table it is, and its own socket. The fixture closes
// them all after the test so the tables drop off the floor before the next one.
export const test = base.extend({
  floor: async ({ browser }, use) => {
    const contexts = []

    const open = async (path) => {
      const context = await browser.newContext(contextOptions)
      contexts.push(context)
      const page = await context.newPage()
      if (path) await page.goto(path)
      return page
    }

    await use({
      tablet: (slug) => open(`/v/${slug}`),
      staff: async (slug) => staffPage(await open(null), slug),
      // Any other screen on its own context — /admin, which belongs to no venue.
      page: (path = null) => open(path)
    })

    await Promise.all(contexts.map((context) => context.close()))
  }
})

/* ------------------------------------------------------------- seating --- */

// Press and hold the big number on the launch screen. useHold listens to
// pointer events, which Chromium synthesises from mouse input, and cancels on
// pointerleave — so the mouse stays put for the whole hold.
export async function holdForKeypad(page) {
  const target = page.getByText(/^(This tablet has no table|You are at table)$/).locator('..')
  await target.hover()
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS)
  await page.mouse.up()
  await expect(page.getByText('Assign this tablet to a table')).toBeVisible()
}

export async function keyIn(page, number) {
  for (const digit of String(number)) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
}

const launchScreen = (page) => page.getByText('You are at table')
const homeScreen = (page) => page.getByRole('heading', { name: "What's it going to be?" })

// A table that was already seated stays seated on the server, so claiming it
// again lands on the home screen rather than the launch screen. Either is a
// successful claim; the number is what has to show.
export async function claimTable(page, number) {
  await holdForKeypad(page)
  await keyIn(page, number)
  await page.getByRole('button', { name: 'Assign this table' }).click()
  await expect(launchScreen(page).or(homeScreen(page))).toBeVisible()
  await expect(page.getByText(pad(number), { exact: true })).toBeVisible()
}

export async function tapToPlay(page) {
  await page.getByRole('button', { name: /Tap to play/ }).click()
  await expect(homeScreen(page)).toBeVisible()
}

export async function seatTablet(page, number) {
  await claimTable(page, number)
  if (await launchScreen(page).isVisible()) await tapToPlay(page)
  await expect(homeScreen(page)).toBeVisible()
}

/* ---------------------------------------------------------- floor plan --- */

// A table drawn on the floor plan SVG, in the lobby or the staff editor.
export const tableOnPlan = (page, number) => page.locator(`g.fp-table[data-table="${number}"]`)

export async function pickTableOnPlan(page, number) {
  const table = tableOnPlan(page, number)
  await expect(table).toHaveAttribute('data-active', 'true')
  await table.click()
}

/* ----------------------------------------------------------- challenge --- */

export const homeTile = (page, label) => page.getByRole('button', { name: new RegExp(`^${label}\\b`) })

// From the home screen: pick the table, then a game and a stake on the wager
// sheet. Leaves the challenger in the thread with the "Challenge sent" card.
export async function challengeTable(page, number, { game = 'Connect 4', item = 'Truffle Fries' } = {}) {
  await homeTile(page, 'Challenge').click()
  await expect(page.getByRole('heading', { name: 'Challenge a table' })).toBeVisible()
  await pickTableOnPlan(page, number)

  await expect(page.getByText('What are you playing?')).toBeVisible()
  await page.getByRole('button', { name: new RegExp(game) }).click()
  await page.getByRole('button', { name: new RegExp(item) }).click()
  await page.getByRole('button', { name: `Play ${game} for ${item}` }).click()

  await expect(page.getByText('Challenge sent')).toBeVisible()
}
