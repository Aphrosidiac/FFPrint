// Past models on the empty bed: lists Creality Print projects + files opened in FF Print, shows
// thumbnails, clicking a tile puts it back on the bed. Run after `pnpm build`.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const shots = process.env.SHOTDIR ?? tmpdir()
const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: mkdtempSync(join(tmpdir(), 'ffpm-')) } })
const page = await app.firstWindow()
await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
await page.waitForSelector('.past .tile, .past .empty', { timeout: 20000 })
const tiles = () => page.locator('.past .tile:not(.skeleton)')
const t0 = Date.now()
console.log(`- ${await tiles().count()} past models listed in ${Date.now() - t0} ms`)

// open a plain STL, clear the bed: it should now be first, with a rendered thumbnail
await page.evaluate((p) => window.__ff.openPaths([p]), resolve('tests/fixtures/bracket.stl'))
await page.waitForFunction(() => window.__ff.scene.objects.length === 1)
await page.waitForTimeout(800) // thumbnail is saved 300 ms after layout
await page.evaluate(() => window.__ff.objects.deleteObjects(window.__ff.scene.objects.map((o) => o.id)))
await page.waitForSelector('.past .tile')
await page.waitForTimeout(1500)
const first = await tiles().first().evaluate((t) => ({ name: t.querySelector('.name')?.textContent, meta: t.querySelector('.meta')?.textContent, img: !!t.querySelector('img') }))
console.log('- first tile after opening bracket.stl:', first)
assert.equal(first.name, 'bracket')
assert.ok(first.img, 'opened STL has a thumbnail')

// wait for background thumbnails, then screenshot
await page.waitForTimeout(4000)
const withImg = await page.locator('.past .tile img').count()
console.log(`- ${withImg} of ${await tiles().count()} tiles have a picture`)
await page.screenshot({ path: join(shots, 'past-models.png') })

// clicking a Creality project tile puts it on the bed
const whistle = tiles().filter({ hasText: 'Tiny Whistle' })
if (await whistle.count()) {
  await whistle.first().click()
  await page.waitForFunction(() => window.__ff.scene.objects.length > 0, null, { timeout: 30000 })
  console.log('- clicked Tiny Whistle ->', await page.evaluate(() => window.__ff.scene.objects.map((o) => o.name)))
}
console.log('PAST MODELS CHECK PASS')
await app.close()
