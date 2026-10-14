// Times each stage of opening a model in the built app: IPC read, parse, mesh setup, placement.
// Run: node scripts/profile-open.mjs <file>
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const file = resolve(process.argv[2])
const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: mkdtempSync(join(tmpdir(), 'ffp-')) } })
const page = await app.firstWindow()
await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
const r = await page.evaluate(async (p) => {
  const t = performance.now()
  const files = await window.ffprint.invoke('readFiles', [[p]])
  const tRead = performance.now()
  const { parseModel } = window.__ff.debug
  const models = parseModel(files[0])
  const tParse = performance.now()
  const { addMesh, addObject, worldBox } = window.__ff.debug
  const objs = models.map((m) => addObject(addMesh(m.name, m.geometry).id, m.name))
  const tMesh = performance.now()
  for (const o of objs) worldBox(o)
  const tBox = performance.now()
  return { bytes: files[0].bytes.length, read: tRead - t, parse: tParse - tRead, mesh: tMesh - tParse, box: tBox - tMesh }
}, file)
console.log(r)
await app.close()
