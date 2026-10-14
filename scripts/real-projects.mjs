// Open + slice each of Fakhrul's Creality Print project files in the built app, report objects and results.
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Creality Print keeps downloaded projects under cloud_download_data/<account id>/3mfs.
const cloud = join(process.env.APPDATA ?? '', 'Creality/Creality Print/7.3/cloud_download_data')
const account = existsSync(cloud) ? readdirSync(cloud).find((d) => existsSync(join(cloud, d, '3mfs'))) : undefined
if (!account) throw new Error(`No Creality Print projects found under ${cloud}`)
const dir = join(cloud, account, '3mfs')
const shots = join(tmpdir(), 'ffprint-real-projects')
mkdirSync(shots, { recursive: true })
const only = process.argv[2]
for (const f of readdirSync(dir).filter((x) => x.endsWith('.3mf') && (!only || x.includes(only)))) {
  const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: mkdtempSync(join(tmpdir(), 'ffr-')) } })
  const page = await app.firstWindow()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
  const t0 = Date.now()
  await page.evaluate((p) => window.__ff.openPaths([p]), join(dir, f))
  await page.waitForFunction(() => window.__ff.scene.objects.length > 0 || window.__ff.app.toasts.length > 0, null, { timeout: 60000 }).catch(() => {})
  const open = await page.evaluate(() => ({ n: window.__ff.scene.objects.length, objs: window.__ff.objects?.listObjects?.().map((o) => `${o.name} ${o.size.x.toFixed(0)}x${o.size.y.toFixed(0)}x${o.size.z.toFixed(0)} ${o.issues.join('/')}`), toasts: window.__ff.app.toasts.map((t) => t.text), settings: window.__ff.app.settings }))
  const tOpen = Date.now() - t0
  await page.evaluate(() => window.__ff.runSlice())
  await page.waitForFunction(() => ['done', 'error'].includes(window.__ff.app.slice.status), null, { timeout: 300000 })
  const sl = await page.evaluate(() => ({ s: window.__ff.app.slice.status, e: window.__ff.app.slice.error, st: window.__ff.app.slice.result?.stats, ms: window.__ff.app.slice.result?.durationMs }))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(shots, `${f.replace(/\W+/g, '_')}.png`) })
  console.log(`\n== ${f}\n open ${tOpen} ms, ${open.n} objects: ${open.objs?.join(' | ')}\n toasts: ${open.toasts.join(' | ')}\n settings: ${open.settings.quality} supports=${open.settings.supports} adhesion=${open.settings.adhesion} infill=${open.settings.infill}\n slice: ${sl.s} ${sl.e ?? ''} ${sl.st ? `${Math.round(sl.st.seconds / 60)} min, ${sl.st.filamentG} g, ${sl.st.layers} layers, sliced in ${(sl.ms / 1000).toFixed(1)} s` : ''}\n errors: ${errs.join(' | ')}`)
  await app.close()
}
