// Launch the BUILT app (run `pnpm build` first) with an isolated data dir, run optional steps, and
// screenshot the window. Used for visual checks and e2e.
//
//   node scripts/shot.mjs out.png                       # empty workspace
//   node scripts/shot.mjs out.png --open tests/fixtures/cube20.stl --slice
//   node scripts/shot.mjs out.png --theme dark --size 1440x900 --eval "app.page='filaments'"
//
// --open <file>     open a model through the real file pipeline (api.readFiles + addLoadedFiles)
// --slice           click Slice and wait for the preview
// --eval <js>       run JS in the renderer (window.__ff exposes { app, scene } in dev builds)
// --wait <ms>       extra settle time before the screenshot (default 600)

import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const out = resolve(args[0] ?? 'shot.png')
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const [w, h] = (opt('--size') ?? '1440x900').split('x').map(Number)
const dataDir = mkdtempSync(join(tmpdir(), 'ffprint-shot-'))

const electronApp = await electron.launch({
  args: [resolve('out/main/index.js')],
  env: { ...process.env, FFPRINT_DATA_DIR: dataDir, FFPRINT_TEST: '1' }
})
const page = await electronApp.firstWindow()
await electronApp.evaluate(({ BrowserWindow }, size) => {
  const win = BrowserWindow.getAllWindows()[0]
  win.setContentSize(size.w, size.h)
  win.center()
}, { w, h })
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[renderer error]', m.text())
})
page.on('pageerror', (e) => console.log('[page error]', e.message))
await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })

const theme = opt('--theme')
if (theme) await page.evaluate((t) => window.__ff.setTheme(t), theme)

const open = opt('--open')
if (open) {
  await page.evaluate((p) => window.__ff.openPaths([p]), resolve(open))
  await page.waitForFunction(() => window.__ff.scene.objects.length > 0, null, { timeout: 20000 })
}
if (args.includes('--slice')) {
  await page.evaluate(() => window.__ff.runSlice())
  await page.waitForFunction(() => ['done', 'error'].includes(window.__ff.app.slice.status), null, { timeout: 120000 })
  const status = await page.evaluate(() => ({ s: window.__ff.app.slice.status, e: window.__ff.app.slice.error }))
  console.log('slice:', status.s, status.e)
}
const evalJs = opt('--eval')
if (evalJs) await page.evaluate((js) => new Function('ff', `with (ff) { return (${js}) }`)(window.__ff), evalJs)

await page.waitForTimeout(Number(opt('--wait') ?? 600))
await page.screenshot({ path: out })
console.log('saved', out)
await electronApp.close()
