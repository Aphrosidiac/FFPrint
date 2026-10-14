// End-to-end check of the built app through the real IPC: open a model, slice, save to a stand-in
// "SD card" folder, record history, enter an actual time, reprint from history.
// Run: pnpm build && node scripts/e2e.mjs

import { _electron as electron } from 'playwright-core'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = mkdtempSync(join(tmpdir(), 'ffprint-e2e-'))
const card = mkdtempSync(join(tmpdir(), 'ffprint-card-'))
const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: dataDir, FFPRINT_TEST: '1' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const invoke = (name, ...args) => page.evaluate(([n, a]) => window.ffprint.invoke(n, a), [name, args])
const step = (name) => console.log(`- ${name}`)

try {
  await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
  step('app ready, engine present')
  assert.equal((await invoke('engineStatus')).ok, true)

  step('filament library seeded from Orca bases')
  const filaments = await invoke('getFilaments')
  assert.ok(filaments.length >= 6)
  const pla = filaments.find((f) => f.material === 'PLA')
  assert.ok(pla.nozzleTemp > 180 && pla.nozzleTemp <= 260)

  step('open a model through the file pipeline')
  await page.evaluate((p) => window.__ff.openPaths([p]), resolve('tests/fixtures/cube20.stl'))
  await page.waitForFunction(() => window.__ff.scene.objects.length === 1)

  step('slice')
  await page.evaluate(() => window.__ff.runSlice())
  await page.waitForFunction(() => ['done', 'error'].includes(window.__ff.app.slice.status), null, { timeout: 120000 })
  const slice = await page.evaluate(() => JSON.parse(JSON.stringify(window.__ff.app.slice)))
  assert.equal(slice.status, 'done', slice.error)
  const gcode = readFileSync(slice.result.gcodePath, 'utf8')
  assert.match(gcode.slice(0, 200), /^;FLAVOR:Marlin\n;TIME:\d/)
  assert.match(gcode, /M82 ; absolute extrusion for the purge line/)
  assert.ok(slice.result.stats.filamentG > 1)
  assert.equal(await page.evaluate(() => window.__ff.app.mode), 'preview')

  step('save to the card folder (twice -> de-duplicated name)')
  const a = await invoke('saveToDrive', slice.result.id, card, 'cube 20 (test).gcode')
  const b = await invoke('saveToDrive', slice.result.id, card, 'cube 20 (test).gcode')
  assert.equal(readdirSync(card).sort().join(','), 'cube_20_test.gcode,cube_20_test_2.gcode')
  assert.equal(readFileSync(a.path, 'utf8'), gcode)
  assert.ok(existsSync(b.path))

  step('history + actual time teaches the time factor')
  await page.evaluate((p) => window.__ff.recordJob(p, ''), a.path)
  const history = await invoke('getHistory')
  assert.equal(history.length, 1, 'history entry recorded')
  const est = history[0].stats.estimateSeconds
  const r = await invoke('setActualTime', history[0].id, Math.round(est * 1.2))
  assert.equal(r.machine.timeFactor, 1.2)

  step('reprint from history restores the scene')
  const proj = await invoke('openHistoryProject', history[0].id)
  assert.equal(proj.project.objects.length, 1)
  assert.equal(proj.models.length, 1)
  await page.evaluate((id) => window.__ff.reprint(id), history[0].id)
  await page.waitForFunction(() => window.__ff.scene.objects.length === 1 && window.__ff.app.mode === 'prepare')

  step('settings persisted across reload')
  await page.evaluate(() => {
    window.__ff.app.settings.infill = 42
  })
  await page.waitForTimeout(700)
  await page.reload()
  await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
  assert.equal(await page.evaluate(() => window.__ff.app.settings.infill), 42)

  assert.deepEqual(errors, [], `renderer errors: ${errors.join(' | ')}`)
  console.log('E2E PASS')
} catch (e) {
  console.error('E2E FAIL:', e.message)
  process.exitCode = 1
} finally {
  await app.close()
}
