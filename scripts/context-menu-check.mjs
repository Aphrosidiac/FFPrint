// Right-click on the empty plate opens the plate menu; right-drag still pans; right-click on an
// object opens the object menu; plate menu actions work. Run after `pnpm build`.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: mkdtempSync(join(tmpdir(), 'ffc-')) } })
const page = await app.firstWindow()
await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
await page.waitForTimeout(800)
const box = await page.locator('.vp-canvas').boundingBox()
const shot = (n) => page.screenshot({ path: join(process.env.SHOTDIR ?? tmpdir(), `ctx-${n}.png`) })
const items = () => page.locator('.ctx button').evaluateAll((bs) => bs.map((b) => `${b.querySelector('span')?.textContent}${b.disabled ? ' (off)' : ''}`))

// 1. empty plate: right-click opens the plate menu
const px = box.x + box.width * 0.5, py = box.y + box.height * 0.62
await page.mouse.click(px, py, { button: 'right' })
await page.waitForTimeout(150)
console.log('- empty plate menu:', (await items()).join(' | '))
assert.ok((await items()).some((t) => t.startsWith('Add models')))
await shot('empty')
await page.keyboard.press('Escape')
assert.equal(await page.locator('.ctx').count(), 0, 'Esc closes the menu')

// 2. right-drag spins the view around the plate (target fixed), Shift+right-drag pans; no menu after a drag
const cam = () => page.evaluate(() => window.__ffPrepare.camera())
const drag = async (shift) => {
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(px, py)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(px + 150, py + 40, { steps: 10 })
  await page.mouse.up({ button: 'right' })
  if (shift) await page.keyboard.up('Shift')
  await page.waitForTimeout(150)
}
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.5)
let c0 = await cam()
await drag(false)
let c1 = await cam()
assert.ok(same(c0.target, c1.target) && !same(c0.position, c1.position), 'right-drag orbits around a fixed target')
assert.equal(await page.locator('.ctx').count(), 0, 'no menu after a drag')
c0 = c1
await drag(true)
c1 = await cam()
assert.ok(!same(c0.target, c1.target), 'Shift+right-drag pans')
console.log('- right-drag spins, Shift+right-drag pans, no menu after drags')

// 3. with an object: plate menu has Arrange/Select all enabled; object menu on the object
await page.evaluate((p) => window.__ff.openPaths([p]), resolve('tests/fixtures/cube20.stl'))
await page.waitForFunction(() => window.__ff.scene.objects.length === 1)
await page.evaluate(() => window.__ff.objects.setCameraView('iso'))
await page.waitForTimeout(400)
const pr = await page.evaluate(() => window.__ffPrepare.project(110, 110, 10))
const ox = Array.isArray(pr) ? pr[0] : pr.x
const oy = Array.isArray(pr) ? pr[1] : pr.y
const r = await page.locator('.vp-canvas').boundingBox()
await page.mouse.click(ox, oy, { button: 'right' })
await page.waitForTimeout(150)
console.log('- object menu:', (await items()).join(' | '))
assert.ok((await items()).some((t) => t.startsWith('Duplicate')))
await shot('object')
await page.keyboard.press('Escape')
await page.mouse.click(r.x + 40, r.y + r.height - 40, { button: 'right' })
await page.waitForTimeout(150)
const plate = await items()
console.log('- plate menu with an object:', plate.join(' | '))
assert.ok(plate.includes('Arrange all') && plate.includes('Select all'))
await page.locator('.ctx button', { hasText: 'Select all' }).click()
assert.equal(await page.evaluate(() => window.__ff.scene.selection.length), 1)
await page.mouse.click(r.x + 40, r.y + r.height - 40, { button: 'right' })
await page.locator('.ctx button', { hasText: 'Delete all' }).click()
await page.waitForTimeout(100)
assert.equal(await page.evaluate(() => window.__ff.scene.objects.length), 0)
await page.mouse.click(r.x + 40, r.y + r.height - 40, { button: 'right' })
await page.locator('.ctx button', { hasText: 'Undo' }).click()
await page.waitForTimeout(100)
assert.equal(await page.evaluate(() => window.__ff.scene.objects.length), 1, 'Undo from the menu brings it back')
console.log('CONTEXT MENU CHECK PASS')
await app.close()
