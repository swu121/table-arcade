import { test, expect } from './helpers.js'

test.describe('venue routes', () => {
  test('the bare URL lands on the default venue', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/v\/demo$/)
    await expect(page.getByText('This tablet has no table')).toBeVisible()
    await expect(page.getByText('Staff: press and hold the number to assign one.')).toBeVisible()
  })

  test('the bare staff URL lands on the default venue staff screen', async ({ page }) => {
    await page.goto('/staff')
    await expect(page).toHaveURL(/\/v\/demo\/staff$/)
    await expect(page.getByRole('heading', { name: 'Open tickets' })).toBeVisible()
  })

  test('an unknown venue slug shows the no-venue screen', async ({ page }) => {
    await page.goto('/v/nowhere')
    await expect(page.getByText('No such venue')).toBeVisible()
    await expect(page.getByText('/v/nowhere')).toBeVisible()
    await expect(page.getByText('This tablet has no table')).toHaveCount(0)
  })
})
