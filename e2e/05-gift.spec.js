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

  // The sender watches it go, and the round lands on the other tablet as a
  // reveal rather than a toast.
  await expect(a.getByText('is getting a House Shot.')).toBeVisible()
  await expect(b.getByText('sent you a House Shot.')).toBeVisible()
  await expect(b.getByRole('button', { name: 'Inbox, 1 new' })).toBeVisible()

  // The round opens the conversation and drops the sender into it, the way a
  // challenge does, with the gift card as the thread's first line. Until the
  // other table opens it, the receipt only says it arrived.
  await expect(a.getByPlaceholder('Message Table 08')).toBeVisible()
  await expect(a.getByText('You sent a House Shot')).toBeVisible()
  await expect(a.getByText('Received by Table 08')).toBeVisible()

  // Tapping through the reveal is the acknowledgement, and it lands B in the
  // same thread — which the sender sees on their own card.
  await b.getByRole('button', { name: 'Nice — say thanks' }).click()
  await expect(b.getByText('Table 07 sent you a House Shot')).toBeVisible()
  await expect(a.getByText('Opened by Table 08')).toBeVisible()

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

  // And the bar running it over closes the receipt on both tablets.
  await expect(a.getByText('Delivered by the bar')).toBeVisible()
  await expect(b.getByText('Delivered by the bar')).toBeVisible()
})
