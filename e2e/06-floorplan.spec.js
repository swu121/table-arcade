import fs from 'node:fs'
import path from 'node:path'
import { test, expect, tableOnPlan } from './helpers.js'
import { DATA_DIR } from './env.js'

const PLAN_FILE = path.join(DATA_DIR, 'venues', 'demo', 'floorplan.json')
const TABLE = 1

async function openEditor(page) {
  await page.getByRole('button', { name: 'Floor plan' }).click()
  await expect(page.getByRole('heading', { name: 'Floor plan' })).toBeVisible()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
}

// Where the editor is drawing the table, in plan units.
async function shapeCentre(page, number) {
  const shape = tableOnPlan(page, number).locator('.fp-shape')
  return {
    x: Number(await shape.getAttribute('cx')),
    y: Number(await shape.getAttribute('cy'))
  }
}

test('staff drag a table, save, and the layout survives a reload', async ({ floor }) => {
  const staff = await floor.staff('demo')
  await openEditor(staff)

  const before = await shapeCentre(staff, TABLE)
  const table = tableOnPlan(staff, TABLE)
  const box = await table.boundingBox()
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  await staff.mouse.move(start.x, start.y)
  await staff.mouse.down()
  await staff.mouse.move(start.x + 60, start.y + 20, { steps: 6 })
  await staff.mouse.move(start.x + 140, start.y + 60, { steps: 6 })
  await staff.mouse.up()

  await expect(staff.getByText('Unsaved changes')).toBeVisible()

  const after = await shapeCentre(staff, TABLE)
  expect(after.x).toBeGreaterThan(before.x)
  expect(after.y).toBeGreaterThan(before.y)

  await staff.getByRole('button', { name: 'Save layout' }).click()
  await expect(staff.getByText('Saved', { exact: true })).toBeVisible()

  // The save went to DATA_DIR, in the venue's own file.
  const saved = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'))
  const entry = saved.tables.find((t) => t.number === TABLE)
  expect(entry.x + entry.w / 2).toBe(after.x)
  expect(entry.y + entry.h / 2).toBe(after.y)

  // A fresh staff screen draws the table where it was left.
  await staff.reload()
  await expect(staff.getByRole('heading', { name: 'Open tickets' })).toBeVisible()
  await openEditor(staff)
  expect(await shapeCentre(staff, TABLE)).toEqual(after)
})
