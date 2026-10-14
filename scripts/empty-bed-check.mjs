// Empty bed: nothing covers the viewport, dragging orbits the camera, and clearing the bed after a
// slice drops the old result. Run after `pnpm build`.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: mkdtempSync(join(tmpdir(), 'ffe-')) } })
const page = await app.firstWindow()
await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
await page.waitForTimeout(800)

assert.equal(await page.locator('.empty, .empty-card').count(), 0, 'no empty-bed overlay')
const canvas = page.locator('.vp-canvas')
const box = await canvas.boundingBox()
const cam = () => page.evaluate(() => window.__ffPrepare.camera().position.map((v) => Math.round(v)))
const before = await cam()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
await page.mouse.move(cx, cy)
await page.mouse.down()
await page.mouse.move(cx + 200, cy + 60, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(200)
const after = await cam()
assert.notDeepEqual(after, before, 'dragging the empty bed orbits the camera')
console.log('- orbit on empty bed:', before, '->', after)

await page.evaluate((p) => window.__ff.openPaths([p]), resolve('tests/fixtures/cube20.stl'))
await page.waitForFunction(() => window.__ff.scene.objects.length === 1)
await page.evaluate(() => window.__ff.runSlice())
await page.waitForFunction(() => window.__ff.app.slice.status === 'done', null, { timeout: 120000 })
await page.evaluate(() => window.__ff.objects.deleteObjects(window.__ff.scene.objects.map((o) => o.id)))
await page.waitForTimeout(200)
const s = await page.evaluate(() => ({ status: window.__ff.app.slice.status, result: !!window.__ff.app.slice.result, mode: window.__ff.app.mode }))
assert.deepEqual(s, { status: 'idle', result: false, mode: 'prepare' }, 'empty bed drops the old slice')
console.log('- after clearing the bed:', s)
await page.screenshot({ path: process.env.SHOT ?? join(tmpdir(), 'ffprint-empty.png') })
console.log('EMPTY BED CHECK PASS')
await app.close()
