// Records the slice progress the app shows while slicing a model; screenshots mid-way.
// Run after `pnpm build`: node scripts/progress-check.mjs <model> [shot.png]
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const [model, shot] = process.argv.slice(2)
const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: mkdtempSync(join(tmpdir(), 'ffprog-')) } })
const page = await app.firstWindow()
await page.waitForFunction(() => window.__ff?.app?.ready)
await page.evaluate((p) => window.__ff.openPaths([p]), resolve(model))
await page.waitForFunction(() => window.__ff.scene.objects.length > 0)
await page.evaluate(() => { window.__prog = []; const t0 = performance.now(); const iv = setInterval(() => { const p = window.__ff.app.sliceProgress; const last = window.__prog.at(-1); if (window.__ff.app.slice.status === 'slicing' && (!last || last.p !== p.percent || last.s !== p.stage)) window.__prog.push({ t: ((performance.now() - t0) / 1000).toFixed(1), p: p.percent, s: p.stage }); if (window.__ff.app.slice.status !== 'slicing' && window.__prog.length) clearInterval(iv) }, 100); void window.__ff.runSlice() })
if (shot) {
  await page.waitForFunction(() => window.__ff.app.sliceProgress.percent >= 40 || window.__ff.app.slice.status !== 'slicing', null, { timeout: 300000 })
  await page.screenshot({ path: shot })
}
await page.waitForFunction(() => window.__ff.app.slice.status !== 'slicing', null, { timeout: 300000 })
const prog = await page.evaluate(() => window.__prog)
for (const r of prog) console.log(`${r.t}s ${String(r.p).padStart(3)}%  ${r.s}`)
const ps = prog.map((r) => r.p)
assert.ok(ps.every((p, i) => i === 0 || p >= ps[i - 1]), 'progress never goes backwards')
assert.ok(new Set(prog.map((r) => r.s)).size >= 4, 'shows several stages')
console.log('status:', await page.evaluate(() => window.__ff.app.slice.status), '| PROGRESS CHECK PASS')
await app.close()
