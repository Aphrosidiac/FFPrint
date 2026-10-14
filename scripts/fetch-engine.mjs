// Downloads OrcaSlicer (the headless slicing engine) into engine/orca. Windows x64 portable build.
// The version is pinned: profiles, CLI flags and exit codes were verified against it (docs/PLAN.md §1).
import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const VERSION = '2.4.2'
const URL = `https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v${VERSION}/OrcaSlicer_Windows_V${VERSION}_x64_portable.zip`

if (existsSync('engine/orca/orca-slicer.exe')) {
  console.log('engine/orca already present')
  process.exit(0)
}
if (process.platform !== 'win32') {
  console.error('fetch-engine currently fetches the Windows build only.')
  process.exit(1)
}
mkdirSync('engine', { recursive: true })
const zip = 'engine/orca.zip'
console.log(`downloading OrcaSlicer ${VERSION}...`)
const res = await fetch(URL)
if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
await pipeline(Readable.fromWeb(res.body), createWriteStream(zip))
mkdirSync('engine/orca', { recursive: true })
execFileSync('tar', ['-xf', zip, '-C', 'engine/orca'], { stdio: 'inherit' })
rmSync(zip)
console.log('engine ready at engine/orca')
