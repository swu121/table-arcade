import { test, expect, homeTile, seatTablet, tableOnPlan } from './helpers.js'

// The demo venue seats bots at 12, 17 and 20; the annex has none.
const DEMO_BOTS = 3

test('a table in one venue is invisible to the other', async ({ floor }) => {
  const annex = await floor.tablet('annex')
  const demo = await floor.tablet('demo')
  await seatTablet(annex, 10)
  await seatTablet(demo, 11)

  // Neither counts the other as open.
  await expect(annex.getByText('Nobody else is on the floor yet.')).toBeVisible()
  await expect(demo.getByText(`${DEMO_BOTS} tables are open right now.`)).toBeVisible()

  // On the demo plan, table 10 is drawn but offline and untappable; 11 is us.
  await homeTile(demo, 'Challenge').click()
  await expect(demo.getByRole('heading', { name: 'Challenge a table' })).toBeVisible()
  await expect(tableOnPlan(demo, 11)).toHaveAttribute('data-self', 'true')
  await expect(tableOnPlan(demo, 10)).toHaveAttribute('data-status', 'offline')
  await expect(tableOnPlan(demo, 10)).not.toHaveAttribute('data-active', 'true')
  await expect(tableOnPlan(demo, 12)).toHaveAttribute('data-status', 'idle')

  // And the same from the annex looking back.
  await homeTile(annex, 'Challenge').click()
  await expect(annex.getByRole('heading', { name: 'Challenge a table' })).toBeVisible()
  await expect(tableOnPlan(annex, 10)).toHaveAttribute('data-self', 'true')
  await expect(tableOnPlan(annex, 11)).toHaveAttribute('data-status', 'offline')
  await expect(tableOnPlan(annex, 12)).toHaveAttribute('data-status', 'offline')

  // The two venues' staff screens are separate too.
  const annexStaff = await floor.staff('annex')
  await expect(annexStaff.getByText('All caught up')).toBeVisible()
})
