// Files passed on the command line land on the bed: at launch (a model and an .ffprint project with
// its own settings), and from a second launch while the app is open (single instance). The launch
// files wait in main until the renderer listens, so a slow start can't drop them.
// Run: pnpm build && node scripts/launch-open-check.mjs

import { _electron as electron } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const electronBin = createRequire(import.meta.url)('electron')
const main = resolve('out/main/index.js')
const step = (name) => console.log(`- ${name}`)
const objectNames = (page) => page.evaluate(() => window.__ff.scene.objects.map((o) => o.name))

async function launch(dataDir, files) {
  const app = await electron.launch({ args: [main, ...files], env: { ...process.env, FFPRINT_DATA_DIR: dataDir, FFPRINT_TEST: '1' } })
  const page = await app.firstWindow()
  await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
  return { app, page }
}

// 1. Make a project with non-default settings to launch with.
const projectDir = mkdtempSync(join(tmpdir(), 'ffprint-launch-proj-'))
const project = join(projectDir, 'wedge-fine.ffprint')
{
  const { app, page } = await launch(mkdtempSync(join(tmpdir(), 'ffprint-launch-a-')), [])
  try {
    const saved = await page.evaluate(async ([stl, out]) => {
      const bytes = await window.ffprint.invoke('readModelBytes', [stl])
      const settings = { ...JSON.parse(JSON.stringify(window.__ff.app.settings)), quality: 'fine', bottomLayers: 20 }
      const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 110, 110, 0, 1]
      const scene = { version: 1, objects: [{ name: 'wedge', file: '1_wedge.stl', matrix: m }], settings, filamentId: window.__ff.app.filamentId }
      return window.ffprint.invoke('saveProjectTo', [out, scene, [{ file: '1_wedge.stl', bytes }]])
    }, [resolve('tests/fixtures/wedge.stl'), project])
    step(`project saved: ${saved}`)
  } finally {
    await app.close()
  }
}

// 2. Launch with the project: its objects and settings win over the last session's settings.
const dataDir = mkdtempSync(join(tmpdir(), 'ffprint-launch-b-'))
const { app, page } = await launch(dataDir, [project])
try {
  await page.waitForFunction(() => window.__ff.scene.objects.length === 1, null, { timeout: 15000 })
  assert.deepEqual(await objectNames(page), ['wedge'])
  const s = await page.evaluate(() => ({ q: window.__ff.app.settings.quality, b: window.__ff.app.settings.bottomLayers }))
  assert.deepEqual(s, { q: 'fine', b: 20 })
  step('launch with a project: wedge on the bed, fine / 20 bottom layers')

  await page.waitForTimeout(1500)
  assert.deepEqual(await objectNames(page), ['wedge'])
  assert.equal(await page.evaluate(() => window.__ff.app.slice.status), 'idle')
  step('still the project 1.5 s later, nothing sliced on its own')

  // 3. A second launch with a model hands it to the running app and exits.
  const second = spawn(electronBin, [main, resolve('tests/fixtures/cube20.stl')], { env: { ...process.env, FFPRINT_DATA_DIR: dataDir, FFPRINT_TEST: '1' }, stdio: 'ignore' })
  const code = await new Promise((r) => second.on('exit', r))
  await page.waitForFunction(() => window.__ff.scene.objects.length === 2, null, { timeout: 15000 })
  assert.deepEqual((await objectNames(page)).sort(), ['cube20', 'wedge'])
  step(`second launch (exit ${code}) added cube20 to the open app`)

  // 4. After a reload the renderer listens again and still gets files.
  await page.reload()
  await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
  const third = spawn(electronBin, [main, resolve('tests/fixtures/bracket.stl')], { env: { ...process.env, FFPRINT_DATA_DIR: dataDir, FFPRINT_TEST: '1' }, stdio: 'ignore' })
  await new Promise((r) => third.on('exit', r))
  await page.waitForFunction(() => window.__ff.scene.objects.some((o) => o.name === 'bracket'), null, { timeout: 15000 })
  step('after a reload, a second launch still reaches the window')
  console.log('launch-open-check: all good')
} finally {
  await app.close()
}
