// Launches the PACKAGED app (release/<ver>/win-unpacked) with a temp data dir, opens a model and
// slices it with the bundled engine. Run after `pnpm build:unpack` or `pnpm build:win`.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ver = readdirSync('release').sort().pop()
const exe = resolve(`release/${ver}/win-unpacked/FFPrint.exe`)
const app = await electron.launch({ executablePath: exe, env: { ...process.env, FFPRINT_DATA_DIR: mkdtempSync(join(tmpdir(), 'ffpkg-')) } })
const page = await app.firstWindow()
await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 30000 })
const engine = await page.evaluate(() => window.ffprint.invoke('engineStatus', []))
await page.evaluate((p) => window.__ff.openPaths([p]), resolve('tests/fixtures/cube20.stl'))
await page.waitForFunction(() => window.__ff.scene.objects.length === 1)
await page.evaluate(() => window.__ff.runSlice())
await page.waitForFunction(() => ['done', 'error'].includes(window.__ff.app.slice.status), null, { timeout: 120000 })
const s = await page.evaluate(() => ({ status: window.__ff.app.slice.status, error: window.__ff.app.slice.error, stats: window.__ff.app.slice.result?.stats }))
console.log({ exe, engine, ...s })
await app.close()
if (s.status !== 'done') process.exit(1)
console.log('PACKAGED SMOKE PASS')
