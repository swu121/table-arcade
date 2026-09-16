import { test, expect } from './helpers.js'
import { VENUES } from './env.js'

const [first, second] = VENUES

test.describe('installing a tablet', () => {
  test('each venue serves its own manifest, named and started at itself', async ({ page }) => {
    const read = async (path) => {
      const res = await page.request.get(path)
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toContain('manifest')
      return res.json()
    }

    const one = await read(`/v/${first.slug}/manifest.webmanifest`)
    const two = await read(`/v/${second.slug}/manifest.webmanifest`)

    expect(one.name).toBe(first.name)
    expect(one.start_url).toBe(`/v/${first.slug}`)
    expect(two.name).toBe(second.name)
    expect(two.start_url).toBe(`/v/${second.slug}`)
    // Two venues on one deployment install as two apps, not one.
    expect(one.id).not.toBe(two.id)

    const staff = await read(`/v/${first.slug}/staff/manifest.webmanifest`)
    expect(staff.start_url).toBe(`/v/${first.slug}/staff`)

    expect((await page.request.get('/v/nowhere/manifest.webmanifest')).status()).toBe(404)
  })

  test('the page points at its own venue manifest and registers a worker', async ({ page }) => {
    await page.goto(`/v/${second.slug}`)

    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBe(`/v/${second.slug}/manifest.webmanifest`)

    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 })
    const scriptURL = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)
    // Registered with the build in the URL, so a deploy installs a new worker.
    expect(scriptURL).toMatch(/\/sw\.js\?v=.+/)
  })

  test('a reload with the network gone still boots the room', async ({ page, context }) => {
    await page.goto(`/v/${first.slug}`)
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15_000 })
    await expect(page.getByText('This tablet has no table')).toBeVisible()

    // The wifi drops, and someone reloads. Without a worker this is the
    // browser's error page for the rest of the shift. With one, the app comes
    // up and says it is connecting, which is what it says on any blip.
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText('Connecting')).toBeVisible()

    // And it is the room again the moment the wifi is back.
    await context.setOffline(false)
    await expect(page.getByText('This tablet has no table')).toBeVisible({ timeout: 15_000 })
  })
})
