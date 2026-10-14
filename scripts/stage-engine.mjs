// Copies the parts of OrcaSlicer the headless CLI needs into build/engine/orca for packaging:
// the executable + DLLs, and only the Creality printer profiles. GUI assets (fonts, images, web,
// translations, help pages, sample models) are left out — about 180 MB the CLI never reads.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const src = 'engine/orca'
const dst = 'build/engine/orca'
if (!existsSync(join(src, 'orca-slicer.exe')) && !existsSync(join(src, 'orca-slicer'))) {
  console.error('engine/orca is missing — run `pnpm fetch-engine` first')
  process.exit(1)
}
rmSync(dst, { recursive: true, force: true })
mkdirSync(dst, { recursive: true })
for (const f of readdirSync(src)) {
  if (f === 'resources') continue
  cpSync(join(src, f), join(dst, f), { recursive: true })
}
const keep = ['profiles/Creality', 'profiles/Creality.json', 'shaders', 'info']
for (const k of keep) if (existsSync(join(src, 'resources', k))) cpSync(join(src, 'resources', k), join(dst, 'resources', k), { recursive: true })

const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((s, f) => s + size(join(p, f)), 0) : statSync(p).size)
console.log(`staged ${dst}: ${(size(dst) / 2 ** 20).toFixed(0)} MB`)
