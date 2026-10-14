// Runs one slice: scene -> one STL per object + three flat configs -> OrcaSlicer CLI -> G-code + stats.
// One slice at a time; a new request or cancelSlice() kills the running engine.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_MACHINE, MATERIALS, QUALITIES, baseProcessName, resolveOverrides, settingsSummary } from '@shared/settings'
import { CREALITY_TUNING } from '@shared/tuning'
import type { Filament, MachineSettings, SliceRequest, SliceResult } from '@shared/types'
import { dataPaths } from '../store'
import { applyPattern, parseStats, safeFileName } from './gcode'
import { engine } from './paths'
import { buildConfigs } from './profiles'
import { writeSceneStls } from './sceneFiles'
import { expectedLayers, tailProgress, type SliceProgress } from './progress'

/** OrcaSlicer 2.4.2 CLI exit codes (src/libslic3r/Utils.hpp + cli_errors), in words a person can act on. */
const CLI_ERRORS: Record<number, string> = {
  [-1]: 'The slicing engine could not set itself up.',
  [-2]: 'The slicing engine rejected its arguments.',
  [-3]: 'The slicing engine could not find an input file.',
  [-5]: 'A print profile could not be read by the slicing engine.',
  [-6]: 'The model could not be read. It may be damaged or not a solid mesh.',
  [-14]: 'The slicing engine ran out of memory. Try a simpler model.',
  [-17]: 'The print settings do not match the printer profile.',
  [-18]: 'A setting has a value the slicing engine does not accept.',
  [-50]: 'Nothing to print: no object is fully on the bed.',
  [-51]: 'Some settings are invalid for this model.',
  [-52]: 'An object reaches past the edge of the bed.',
  [-63]: 'Objects are too close together to print one at a time. Move them apart or print by layer.',
  [-64]: 'Objects overlap. Move them apart.',
  [-65]: 'Spiral vase only works with one wall, no top layers and no supports.',
  [-100]: 'The slicing engine failed while slicing this model.'
}

let running: ChildProcess | null = null
let cancelled = false
const results = new Map<string, SliceResult>()

export function getSlice(id: string): SliceResult | undefined {
  return results.get(id)
}

/**
 * Start the engine once in the background at launch. The first run after a while can take a minute
 * (Windows scans the 120 MB engine DLL); doing it now keeps that wait out of the first real slice.
 */
export function warmEngine(): void {
  if (!engine.present) return
  try {
    const child = spawn(engine.exe, ['--help'], { windowsHide: true, stdio: 'ignore' })
    child.on('error', () => {})
    setTimeout(() => {
      if (child.exitCode === null) child.kill()
    }, 180_000)
  } catch {
    // warming is best effort
  }
}

export function cancelSlice(): void {
  cancelled = true
  if (running && !running.killed) running.kill()
}

function run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(engine.exe, args, { cwd, windowsHide: true })
    running = child
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => (stdout += d))
    child.stderr?.on('data', (d) => (stderr += d))
    child.on('error', (e) => {
      running = null
      reject(e)
    })
    child.on('close', (code) => {
      running = null
      // Windows reports the CLI's negative exit codes as unsigned 32-bit (-50 -> 4294967246).
      const c = code ?? -1
      resolve({ code: c > 0x7fffffff ? c - 0x100000000 : c, stdout, stderr })
    })
  })
}

export async function slice(
  req: SliceRequest,
  filament: Filament,
  machine: MachineSettings,
  fileNamePattern = '{name}',
  onProgress: (p: SliceProgress) => void = () => {}
): Promise<SliceResult> {
  if (!engine.present) throw new Error(`The slicing engine is missing at ${engine.dir}. Run "pnpm fetch-engine".`)
  if (!req.scene.instances.length) throw new Error('Add a model to the bed first.')
  cancelSlice()
  cancelled = false

  const started = Date.now()
  const id = randomUUID()
  const dir = join(dataPaths.work, id)
  const out = join(dir, 'out')
  mkdirSync(out, { recursive: true })
  pruneWork(id)

  const material = MATERIALS.find((m) => m.id === filament.material) ?? MATERIALS[0]
  const names = {
    machine: BASE_MACHINE(machine.nozzle),
    process: baseProcessName(req.settings.quality, machine.nozzle),
    filament: material.orcaBase
  }
  const overrides = resolveOverrides(req.settings, filament, machine)
  // Creality's V3 SE tuning sits between Orca's preset and the user's choices.
  // Its line widths are for the 0.4 nozzle; other nozzles keep Orca's widths for that nozzle.
  const tuning = machine.nozzle === '0.4' ? CREALITY_TUNING : Object.fromEntries(Object.entries(CREALITY_TUNING).filter(([k]) => !k.endsWith('line_width')))
  overrides.process = { ...tuning, ...overrides.process }
  const configs = buildConfigs(engine.profiles, names, overrides)
  writeFileSync(join(dir, 'machine.json'), JSON.stringify(configs.machine, null, 1))
  writeFileSync(join(dir, 'process.json'), JSON.stringify(configs.process, null, 1))
  writeFileSync(join(dir, 'filament.json'), JSON.stringify(configs.filament, null, 1))
  onProgress({ percent: 1, stage: 'Preparing the model' })
  const modelFiles = writeSceneStls(req.scene, dir)

  const layerHeight = QUALITIES.find((q) => q.id === req.settings.quality)?.layerHeight ?? 0.2
  const firstLayer = parseFloat(req.settings.overrides.initial_layer_print_height ?? '') || 0.2
  const stopTail = tailProgress(join(dir, 'slice.log'), expectedLayers(req.scene, layerHeight, firstLayer), onProgress)
  let engineRun: Awaited<ReturnType<typeof run>>
  try {
    engineRun = await run(
      // --debug 5 + --logfile: the only live progress the Windows CLI gives (see progress.ts)
      ['--debug', '5', '--logfile', join(dir, 'slice.log'), '--arrange', '0', '--slice', '0', '--load-settings', 'machine.json;process.json', '--load-filaments', 'filament.json', '--outputdir', 'out', ...modelFiles],
      dir
    )
  } finally {
    stopTail()
  }
  const { code, stdout, stderr } = engineRun
  onProgress({ percent: 100, stage: 'Reading the result' })
  if (cancelled) throw new Error('Slicing cancelled.')
  const gcodeFile = readdirSync(out).find((f) => f.endsWith('.gcode'))
  if (code !== 0 || !gcodeFile) {
    const detail = (stderr || stdout).trim().split('\n').slice(-3).join(' ')
    throw new Error(`${CLI_ERRORS[code] ?? `The slicing engine stopped (code ${code}).`}${detail ? ` ${detail}` : ''}`)
  }

  const gcodePath = join(out, gcodeFile)
  const stats = parseStats(readFileSync(gcodePath, 'utf8'))
  const quality = QUALITIES.find((q) => q.id === req.settings.quality)
  const result: SliceResult = {
    id,
    gcodePath,
    fileName: safeFileName(
      applyPattern(fileNamePattern || '{name}', {
        name: req.jobName,
        quality: quality?.label ?? '',
        material: material.label.replace(/\s+/g, ''),
        date: new Date().toISOString().slice(0, 10)
      })
    ),
    stats: {
      estimateSeconds: stats.estimateSeconds,
      seconds: Math.round(stats.estimateSeconds * (machine.timeFactor || 1)),
      filamentMm: stats.filamentMm,
      filamentCm3: stats.filamentCm3,
      filamentG: stats.filamentG,
      cost: Math.round(((stats.filamentG / 1000) * filament.pricePerKg) * 100) / 100,
      layers: stats.layers,
      maxZ: stats.maxZ
    },
    settingsSummary: `${quality?.label ?? ''} · ${settingsSummary(req.settings)}`,
    durationMs: Date.now() - started
  }
  results.set(id, result)
  return result
}

/** Keep the last few slices on disk; older work folders go. */
function pruneWork(keep: string): void {
  try {
    const dirs = readdirSync(dataPaths.work)
      .filter((d) => d !== keep)
      .map((d) => ({ d, t: statSync(join(dataPaths.work, d)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const { d } of dirs.slice(4)) {
      rmSync(join(dataPaths.work, d), { recursive: true, force: true })
      for (const [k, r] of results) if (r.gcodePath.includes(d)) results.delete(k)
    }
  } catch {
    // best effort
  }
}
