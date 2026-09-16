import { test, expect, loginForm, signInStaff, ticketBoard } from './helpers.js'
import { STAFF } from './env.js'

// The staff screen is behind a login. The server runs in production here, so
// there is no dev door; the launcher seeded one account per venue.

test('the staff screen starts at the login form, refuses a wrong password, and signs in', async ({ page }) => {
  await page.goto('/v/demo/staff')
  await expect(loginForm(page)).toBeVisible()
  await expect(ticketBoard(page)).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue (dev)' })).not.toBeVisible()

  await page.getByLabel('Email').fill(STAFF.email)
  await page.getByLabel('Password').fill('not the password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('That email and password do not match.')
  await expect(loginForm(page)).toBeVisible()

  await signInStaff(page)
  await expect(page.getByText(`Signed in as ${STAFF.name}`)).toBeVisible()

  // The session lives in localStorage, so a reload lands straight on the board.
  await page.reload()
  await expect(ticketBoard(page)).toBeVisible()
})

test('staff see their accounts, and signing out returns to the login form', async ({ floor }) => {
  const staff = await floor.staff('annex')
  await staff.getByRole('button', { name: 'Devices & staff' }).click()
  await expect(staff.getByRole('heading', { name: 'Staff', exact: true })).toBeVisible()
  const accounts = staff.getByRole('list', { name: 'Staff accounts' }).getByRole('listitem')
  await expect(accounts).toHaveCount(1)
  await expect(accounts.first()).toContainText(STAFF.name)
  await expect(accounts.first()).toContainText(STAFF.email)
  await expect(accounts.first()).toContainText('YOU')
  await expect(accounts.first()).toContainText('The only account here')

  await staff.getByRole('button', { name: 'Sign out' }).click()
  await expect(loginForm(staff)).toBeVisible()
  await staff.reload()
  await expect(loginForm(staff)).toBeVisible()
})
