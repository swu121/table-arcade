import { test, expect } from './helpers.js'
import { ADMIN, ADMIN_VENUE } from './env.js'

// Onboarding a restaurant, end to end, against the production server: sign in
// as the operator, make a venue that is in no config file and no seed, watch a
// tablet reach it with nothing restarted, and pair that tablet from /admin.

async function signInAdmin(page) {
  await page.goto('/admin')
  await expect(page.getByText('Admin sign in')).toBeVisible()
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('list', { name: 'Venues' })).toBeVisible()
  return page
}

test('an operator signs in, creates a venue, and pairs its first tablet', async ({ floor }) => {
  const admin = await floor.page()
  await admin.goto('/admin')

  // The suite runs in production with ADMIN_EMAIL set, so there is no dev door.
  await expect(admin.getByText('Admin sign in')).toBeVisible()
  await expect(admin.getByText('Dev mode', { exact: false })).not.toBeVisible()

  await admin.getByLabel('Email').fill(ADMIN.email)
  await admin.getByLabel('Password').fill('not the password')
  await admin.getByRole('button', { name: 'Sign in' }).click()
  await expect(admin.getByRole('alert')).toHaveText('That email and password do not match.')

  await admin.getByLabel('Email').fill(ADMIN.email)
  await admin.getByLabel('Password').fill(ADMIN.password)
  await admin.getByRole('button', { name: 'Sign in' }).click()

  const venues = admin.getByRole('list', { name: 'Venues' }).getByRole('listitem')
  await expect(venues).toHaveCount(2)

  // A venue nobody put in a file: the slug is suggested from the name.
  await admin.getByLabel('Venue name').fill(ADMIN_VENUE.name)
  await expect(admin.getByLabel('Address')).toHaveValue(ADMIN_VENUE.slug)
  await admin.getByRole('button', { name: 'Create venue' }).click()

  await expect(venues).toHaveCount(3)
  await expect(admin.getByRole('heading', { name: ADMIN_VENUE.name })).toBeVisible()

  // Nothing was restarted: a tablet asking for the new address gets the
  // pairing screen, not "no such venue".
  const tablet = await floor.tablet(ADMIN_VENUE.slug)
  await expect(tablet.getByRole('group', { name: 'Pairing code' })).toBeVisible()

  // A code minted from admin lets it in.
  await admin.getByRole('button', { name: 'Issue pairing code' }).click()
  const code = admin.locator('[data-pair-code]')
  await expect(code).toBeVisible()
  const digits = await code.getAttribute('data-pair-code')
  expect(digits).toMatch(/^\d{6}$/)

  for (const digit of digits) {
    await tablet.getByRole('button', { name: digit, exact: true }).click()
  }
  await tablet.getByRole('button', { name: 'Pair this tablet' }).click()
  await expect(tablet.getByText(/^(This tablet has no table|You are at table)$/)).toBeVisible()

  // And the admin list catches up: one paired tablet on the venue that had none.
  await expect(admin.getByText('1 paired tablet')).toBeVisible({ timeout: 15_000 })
})

test('the new venue takes a staff account and a rename, live', async ({ floor }) => {
  const admin = await signInAdmin(await floor.page())

  await admin
    .getByRole('list', { name: 'Venues' })
    .getByRole('button', { name: new RegExp(ADMIN_VENUE.name) })
    .click()
  await expect(admin.getByRole('heading', { name: ADMIN_VENUE.name })).toBeVisible()

  await admin.getByLabel('Staff name').fill('Robin')
  await admin.getByLabel('Staff email').fill('robin@example.com')
  await admin.getByLabel('Password (8+)').fill('correct horse')
  await admin.getByRole('button', { name: 'Add account' }).click()
  await expect(admin.getByText('robin@example.com can sign in now.')).toBeVisible()

  // That account is the venue's staff front door straight away.
  const staff = await floor.page(`/v/${ADMIN_VENUE.slug}/staff`)
  await expect(staff.getByText('Staff sign in')).toBeVisible()
  await staff.getByLabel('Email').fill('robin@example.com')
  await staff.getByLabel('Password').fill('correct horse')
  await staff.getByRole('button', { name: 'Sign in' }).click()
  await expect(staff.getByRole('heading', { name: 'Open tickets' })).toBeVisible()

  // A rename lands on the running server, not on the next deploy.
  await admin.getByLabel('Name', { exact: true }).fill('The Anchor & Crown')
  await admin.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'The Anchor & Crown' })).toBeVisible()
})
