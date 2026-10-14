// Visual + timing check for the output side (slice bar, preview, history) in the BUILT app.
// One launch, several screenshots. Never writes to a real drive: the "SD card" is a temp folder
// injected into app.drives.
//
//   node scripts/shot-output.mjs <outDir> [--model tests/fixtures/cube20.stl] [--theme dark] [--only preview] [--quality fine]
//
// Writes <outDir>/<theme>-<name>.png and prints slice/preview timings.

import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const outDir = resolve(args[0] ?? 'shots')
const opt = (name, d) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : d
}
const model = resolve(opt('--model', 'tests/fixtures/cube20.stl'))
const theme = opt('--theme', 'light')
const only = opt('--only', '')
const [w, h] = opt('--size', '1440x900').split('x').map(Number)
mkdirSync(outDir, { recursive: true })
const dataDir = mkdtempSync(join(tmpdir(), 'ffprint-shot-'))
const fakeCard = mkdtempSync(join(tmpdir(), 'ffprint-card-')) + '\\'

const electronApp = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: dataDir, FFPRINT_TEST: '1' } })
const page = await electronApp.firstWindow()
await electronApp.evaluate(({ BrowserWindow }, size) => {
  const win = BrowserWindow.getAllWindows()[0]
  win.setContentSize(size.w, size.h)
  win.center()
}, { w, h })
page.on('console', (m) => m.type() === 'error' && console.log('[renderer error]', m.text()))
page.on('pageerror', (e) => console.log('[page error]', e.message))
await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
await page.evaluate((t) => window.__ff.setTheme(t), theme)

const shot = async (name) => {
  if (only && !name.includes(only)) return
  await page.waitForTimeout(500)
  const file = join(outDir, `${theme}-${name}.png`)
  await page.screenshot({ path: file })
  console.log('saved', file)
}
const ev = (fn, arg) => page.evaluate(fn, arg)
const mockDrives = (card) =>
  ev((root) => {
    window.__ff.app.drives = [
      { root, label: 'PRINTER', sizeBytes: 7.4 * 2 ** 30, freeBytes: 7.1 * 2 ** 30, likelyPrinterCard: true },
      { root: 'F:\\', label: 'CCCOMA_X64FRE_EN-GB_DV9', sizeBytes: 61989638144, freeBytes: 51217915904, likelyPrinterCard: false }
    ]
  }, card)

// Empty preview
await ev(() => (window.__ff.app.mode = 'preview'))
await shot('preview-empty')
await ev(() => (window.__ff.app.mode = 'prepare'))

// Real drive list on this machine (read-only)
const realDrives = await ev(async () => {
  const { api } = window
  return window.__ff.app.drives
})
console.log('drives on this machine:', JSON.stringify(realDrives))

// Open + slice
await ev((p) => window.__ff.openPaths([p]), model)
await page.waitForFunction(() => window.__ff.scene.objects.length > 0, null, { timeout: 30000 })
const quality = opt('--quality', '')
if (quality) await ev((q) => (window.__ff.app.settings = { ...window.__ff.app.settings, quality: q }), quality)
await shot('idle')
const t0 = Date.now()
await ev(() => {
  void window.__ff.runSlice()
})
await page.waitForTimeout(300)
await shot('slicing')
await page.waitForFunction(() => ['done', 'error'].includes(window.__ff.app.slice.status), null, { timeout: 600000 })
const sliceMs = Date.now() - t0
const st = await ev(() => ({ s: window.__ff.app.slice.status, e: window.__ff.app.slice.error, r: window.__ff.app.slice.result }))
console.log('slice:', st.s, st.e, `${sliceMs} ms`, st.r && JSON.stringify(st.r.stats))

// Preview load timing
const p0 = Date.now()
await page.waitForFunction(() => window.__ffPreview?.preview?.status === 'ready', null, { timeout: 120000 })
await page.waitForFunction(() => window.__ffPreviewBuildMs !== undefined, null, { timeout: 60000 })
const timing = await ev(() => ({ ...window.__ffPreview.preview.timings, buildMs: window.__ffPreviewBuildMs, layers: window.__ffPreview.preview.layers.length }))
console.log('preview ready after', Date.now() - p0, 'ms (from slice done):', JSON.stringify(timing))

// Frame time, GPU included: readPixels blocks until the frame is drawn (gl.finish() does not in Chrome).
const frames = await ev(async () => {
  const pa = window.__ffPreviewActions
  const v = window.__ffPreview.view
  const gl = v.renderer.getContext()
  const px = new Uint8Array(4)
  const draw = () => {
    v.renderer.render(v.scene, v.camera)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
  }
  const last = pa.getPreviewInfo().layerCount - 1
  draw()
  let t = performance.now()
  for (let i = 0; i < 10; i++) draw()
  const fullMs = (performance.now() - t) / 10
  // slider sweep: set range + draw, 20 steps
  t = performance.now()
  for (let i = 0; i < 20; i++) {
    pa.setLayerRange(0, Math.round((last * (i + 1)) / 20))
    v.setRange(0, Math.round((last * (i + 1)) / 20))
    draw()
  }
  const sweepMs = (performance.now() - t) / 20
  pa.setLayerRange(0, last)
  return { fullFrameMs: +fullMs.toFixed(1), sliderStepMs: +sweepMs.toFixed(1), gpu: (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '' })() }
})
console.log('render:', JSON.stringify(frames))

await mockDrives(fakeCard)
await shot('preview-done')

// Layer range + a hidden feature + top view
await ev(() => {
  const pa = window.__ffPreviewActions
  const info = pa.getPreviewInfo()
  pa.setLayerRange(0, Math.round(info.layerCount * 0.45))
  pa.setFeatureVisible('Sparse infill', true)
  pa.setFeatureVisible('Inner wall', false)
})
await shot('preview-range')
await ev(() => {
  window.__ffPreviewActions.setFeatureVisible('Inner wall', true)
  window.__ffPreviewActions.setPreviewView('top')
})
await shot('preview-top')
await ev(() => {
  const pa = window.__ffPreviewActions
  pa.setPreviewView('iso')
  pa.setLayerRange(0, pa.getPreviewInfo().layerCount - 1)
  pa.setFeatureVisible('Travel', true)
})
await shot('preview-travel')
await ev(() => window.__ffPreviewActions.setFeatureVisible('Travel', false))

// Save to the fake card (real main-side write + verify), then eject (refused: not a drive letter)
const saved = await ev(async (card) => {
  try {
    return { path: await window.__ffOutput.saveToCard(card) }
  } catch (e) {
    return { error: String(e) }
  }
}, fakeCard)
console.log('saveToCard:', JSON.stringify(saved))
await shot('saved')
const ej = await ev(() => window.__ffOutput.ejectCard())
console.log('ejectCard (fake card):', JSON.stringify(ej))
await shot('saved-eject-error')

// No card inserted
await ev(() => (window.__ff.app.drives = []))
await shot('no-card')

// Stale
await ev(() => (window.__ff.app.settings = { ...window.__ff.app.settings, walls: window.__ff.app.settings.walls + 1 }))
await page.waitForFunction(() => window.__ff.app.slice.status === 'stale')
await shot('stale')

// Error
await ev(() => {
  window.__ff.app.slice = { status: 'error', result: window.__ff.app.slice.result, error: 'An object reaches past the edge of the bed. Move it fully onto the bed and slice again.' }
})
await shot('error')

// History: actual time for the saved job, then the page
const hist = await ev(async () => {
  const h = window.__ff.app.history[0]
  if (!h) return null
  await window.__ffOutput.setActualTime(h.id, Math.round(h.stats.estimateSeconds * 1.08))
  return { factor: window.__ff.app.machine.timeFactor, info: window.__ffOutput.timeFactorInfo(), n: window.__ff.app.history.length, thumb: h.thumbnail.length }
})
console.log('history:', JSON.stringify(hist))
await ev(() => (window.__ff.app.page = 'history'))
await shot('history')
await page.click('button[aria-label="Enter the actual print time"], button[aria-label="Change the actual print time"]')
await shot('history-edit')
await ev(() => (window.__ff.app.history = []))
await shot('history-empty')

await electronApp.close()
