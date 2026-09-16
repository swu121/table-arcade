import { test, expect, challengeTable, homeTile, pickTableOnPlan, seatTablet } from './helpers.js'

test('a message reaches the other table, badges it, and reads back', async ({ floor }) => {
  const a = await floor.tablet('demo')
  const b = await floor.tablet('demo')
  await seatTablet(a, 5)
  await seatTablet(b, 6)

  // A thread between two tables starts with a challenge. B passes on it.
  await challengeTable(a, 6, { game: 'Connect 4', item: 'Draft Beer' })
  await expect(b.getByText('Incoming challenge')).toBeVisible()
  await b.getByRole('button', { name: 'Decline' }).click()
  await expect(a.getByText('Table 6 passed on playing for Draft Beer.')).toBeVisible()
  await expect(b.getByText('Table 6 passed on playing for Draft Beer.')).toBeVisible()

  // B leaves the thread, so anything A says next is unread.
  await b.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(b.getByRole('heading', { name: "What's it going to be?" })).toBeVisible()

  const line = "Round's on us if you win the next one"
  await a.getByPlaceholder('Message Table 06').fill(line)
  await a.keyboard.press('Enter')
  await expect(a.getByText(line, { exact: true })).toBeVisible()
  await expect(a.getByText('Delivered', { exact: true })).toBeVisible()

  // B is toasted and the Challenge tile carries the unread count.
  await expect(b.getByText(`Table 5: ${line}`)).toBeVisible()
  await expect(homeTile(b, 'Challenge').getByText('1', { exact: true })).toBeVisible()
  await expect(b.getByRole('button', { name: 'Inbox, 2 new' })).toBeVisible()

  // Tapping A on the floor opens the thread now that the two tables know each other.
  await homeTile(b, 'Challenge').click()
  await pickTableOnPlan(b, 5)
  await expect(b.getByText('Talking to')).toBeVisible()
  await expect(b.getByText(line, { exact: true })).toBeVisible()

  // Which A sees as a read receipt.
  await expect(a.getByText('Read', { exact: true })).toBeVisible()
})
