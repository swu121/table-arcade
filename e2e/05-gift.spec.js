import { test, expect, homeTile, pickTableOnPlan, seatTablet } from './helpers.js'

test('a gift goes straight to the bar and gets delivered', async ({ floor }) => {
  const a = await floor.tablet('demo')
  const b = await floor.tablet('demo')
  await seatTablet(a, 7)
  await seatTablet(b, 8)

  await homeTile(a, 'Gift').click()
  await expect(a.getByRole('heading', { name: 'Send a table something' })).toBeVisible()
  await pickTableOnPlan(a, 8)

  await expect(a.getByText('Sending to')).toBeVisible()
  await a.getByRole('button', { name: /House Shot/ }).click()
  await a.getByRole('button', { name: 'Send Table 08 a House Shot' }).click()

  await expect(a.getByText('House Shot on its way to Table 8.')).toBeVisible()
  await expect(b.getByText("Table 7 sent you a House Shot — it's on them.")).toBeVisible()
  await expect(b.getByRole('button', { name: 'Inbox, 1 new' })).toBeVisible()

  // The round opens the conversation and drops the sender into it, the way a
  // challenge does, with the note as the thread's first line.
  const note = 'Table 7 sent Table 8 a House Shot.'
  await expect(a.getByPlaceholder('Message Table 08')).toBeVisible()
  await expect(a.getByText(note, { exact: true })).toBeVisible()

  // The other end has the same thread, reachable by tapping back on the plan.
  await homeTile(b, 'Challenge').click()
  await pickTableOnPlan(b, 7)
  await expect(b.getByText(note, { exact: true })).toBeVisible()

  // And the sender is still sitting in it, so the reply lands in front of them.
  const reply = 'you legend'
  await b.getByPlaceholder('Message Table 07').fill(reply)
  await b.keyboard.press('Enter')
  await expect(a.getByText(reply, { exact: true })).toBeVisible()

  const staff = await floor.staff('demo')
  const ticket = staff.getByRole('listitem').filter({ hasText: 'House Shot' })
  await expect(ticket).toBeVisible()
  await expect(ticket.getByText('Charge Table 07')).toBeVisible()
  await expect(ticket.getByText('Deliver to Table 08')).toBeVisible()
  await expect(ticket.getByText('Gift')).toBeVisible()

  await ticket.getByRole('button', { name: 'Mark delivered' }).click()
  await expect(ticket.getByText('Delivered')).toBeVisible()
  await expect(ticket.getByRole('button', { name: 'Mark delivered' })).toHaveCount(0)
})
