import { test, expect, challengeTable, seatTablet } from './helpers.js'

test('two tables play Connect 4 for a menu item, one forfeits, staff get a ticket', async ({ floor }) => {
  const a = await floor.tablet('demo')
  const b = await floor.tablet('demo')
  await seatTablet(a, 3)
  await seatTablet(b, 4)

  await challengeTable(a, 4, { game: 'Connect 4', item: 'Truffle Fries' })
  await expect(a.getByText('Waiting on Table 04 to answer at Connect 4')).toBeVisible()

  // The challenged table is pulled into the thread with the incoming card.
  await expect(b.getByText('Incoming challenge')).toBeVisible()
  await expect(b.getByText('Table 03 wants to play you at Connect 4')).toBeVisible()
  await expect(b.getByText('Playing for Truffle Fries')).toBeVisible()
  await b.getByRole('button', { name: 'Accept' }).click()

  // Both land in the game. The challenged table moves first.
  for (const page of [a, b]) {
    await expect(page.getByRole('button', { name: 'Exit game' })).toBeVisible()
    await expect(page.getByText('Connect 4 · playing for')).toBeVisible()
  }
  await expect(b.getByText('Your turn')).toBeVisible()
  await expect(a.getByText('Thinking…')).toBeVisible()

  // The challenger walks away, at the price of the wager.
  await a.getByRole('button', { name: 'Exit game' }).click()
  await expect(a.getByRole('heading', { name: 'Forfeit to Table 04?' })).toBeVisible()
  await a.getByRole('button', { name: 'Exit and forfeit' }).click()

  await expect(a.getByText('You lost')).toBeVisible()
  await expect(a.getByText('You called it early.')).toBeVisible()
  await expect(b.getByText('You won')).toBeVisible()
  await expect(b.getByText('Table 03 walked away from it.')).toBeVisible()

  // The result is written into the thread the challenge started from.
  await a.getByRole('button', { name: 'Back to the lobby' }).click()
  await expect(a.getByText("Table 3 walked away from Connect 4. Table 3's tab covers the Truffle Fries.")).toBeVisible()

  // And the loser's tab shows up on the staff screen.
  const staff = await floor.staff('demo')
  const ticket = staff.getByRole('listitem').filter({ hasText: 'Truffle Fries' })
  await expect(ticket).toBeVisible()
  await expect(ticket.getByText('Charge Table 03')).toBeVisible()
  await expect(ticket.getByText('Deliver to Table 04')).toBeVisible()
  await expect(ticket.getByText('Connect 4')).toBeVisible()
  await expect(ticket.getByRole('button', { name: 'Mark delivered' })).toBeVisible()
})
