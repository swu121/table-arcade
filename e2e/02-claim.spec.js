import { test, expect, claimTable, holdForKeypad, keyIn, seatTablet, tapToPlay } from './helpers.js'

// The demo venue seats bots at 12, 17 and 20, so the floor is never empty.
const BOTS = 3

test('a tablet claims a table and the home screen shows the floor', async ({ floor }) => {
  const a = await floor.tablet('demo')
  await claimTable(a, 1)

  // Claimed but not yet seated: the launch screen and nothing else.
  await expect(a.getByText("Until you tap, the rest of the floor can't see or reach this table.")).toBeVisible()

  await tapToPlay(a)
  await expect(a.getByText('You are')).toBeVisible()
  await expect(a.getByText('01', { exact: true })).toBeVisible()
  await expect(a.getByText(`${BOTS} tables are open right now.`)).toBeVisible()

  // A second table sitting down shows up in the count.
  const b = await floor.tablet('demo')
  await seatTablet(b, 2)
  await expect(a.getByText(`${BOTS + 1} tables are open right now.`)).toBeVisible()
  await expect(b.getByText(`${BOTS + 1} tables are open right now.`)).toBeVisible()

  // The tablet remembers its table across a reload, and the server remembers
  // it was seated, so it comes straight back to the home screen.
  await a.reload()
  await expect(a.getByRole('heading', { name: "What's it going to be?" })).toBeVisible()
  await expect(a.getByText('01', { exact: true })).toBeVisible()
  await expect(a.getByText(`${BOTS + 1} tables are open right now.`)).toBeVisible()
})

test('a number another tablet holds cannot be assigned', async ({ floor }) => {
  const a = await floor.tablet('demo')
  await seatTablet(a, 1)

  const b = await floor.tablet('demo')
  await holdForKeypad(b)
  await keyIn(b, 1)
  await expect(b.getByText('Table 1 is already in play')).toBeVisible()
  await expect(b.getByRole('button', { name: 'Assign this table' })).toBeDisabled()

  await b.getByRole('button', { name: 'Delete' }).click()
  await keyIn(b, 2)
  await expect(b.getByRole('button', { name: 'Assign this table' })).toBeEnabled()
})
