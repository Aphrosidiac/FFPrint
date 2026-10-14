// Generates src/shared/orca-defaults.json: the value Orca's own V3 SE presets use for every key in the
// "More settings" catalogue, per nozzle + quality (process keys), per nozzle (machine keys) and per
// material (filament keys). The renderer shows these as the default next to each setting.
//
//   node scripts/gen-defaults.mjs
//
// Resolves inheritance exactly like src/main/engine/profiles.ts (name -> raw preset across every vendor
// folder, Creality wins on duplicates; chain merged root-first), then slices a 20 mm cube with each
// machine + process pair and reads the effective values from the G-code footer. The footer is the
// truth: keys a preset leaves out fall back to Orca's built-in defaults, and a preset value of the
// wrong type is replaced (the V3 SE preset's support_object_xy_distance "60%" becomes 0.35).
// Falls back to the raw preset values when the engine cannot run. Run again after updating the engine.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const engineDir = process.env.FFPRINT_ENGINE_DIR || join(root, 'engine', 'orca')
const profilesDir = join(engineDir, 'resources', 'profiles')
const exe = join(engineDir, process.platform === 'win32' ? 'orca-slicer.exe' : 'orca-slicer')
const cube = join(root, 'tests', 'fixtures', 'cube20.stl')
const work = mkdtempSync(join(tmpdir(), 'ffprint-defaults-'))

// Catalogue keys + targets, read from the source so this stays a plain .mjs.
const settingsSrc = readFileSync(join(root, 'src', 'shared', 'settings.ts'), 'utf8')
const catalogue = [...settingsSrc.matchAll(/\{ key: '([a-z0-9_]+)', target: '(process|filament|machine)'/g)].map((m) => ({ key: m[1], target: m[2] }))
if (!catalogue.length) throw new Error('No catalogue entries found in settings.ts')

const QUALITIES = { draft: '0.24mm Draft', standard: '0.20mm Standard', optimal: '0.16mm Optimal', fine: '0.12mm Fine' }
const NOZZLES = ['0.2', '0.4', '0.6', '0.8']
const MATERIALS = {
  PLA: 'Creality Generic PLA @Ender-3V3-all',
  'PLA-HS': 'Creality Generic PLA High Speed @Ender-3V3-all',
  PETG: 'Creality Generic PETG @Ender-3V3-all',
  TPU: 'Creality Generic TPU @Ender-3V3-all',
  ABS: 'Creality Generic ABS @Ender-3V3-all',
  ASA: 'Creality Generic ASA @Ender-3V3-all'
}

const indexes = new Map()
function index(kind) {
  if (indexes.has(kind)) return indexes.get(kind)
  const map = new Map()
  for (const vendor of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!vendor.isDirectory()) continue
    const dir = join(profilesDir, vendor.name, kind)
    let files
    try {
      files = readdirSync(dir, { recursive: true })
    } catch {
      continue
    }
    for (const f of files) {
      if (!String(f).endsWith('.json')) continue
      try {
        const j = JSON.parse(readFileSync(join(dir, f), 'utf8'))
        if (typeof j.name === 'string' && (!map.has(j.name) || vendor.name === 'Creality')) map.set(j.name, j)
      } catch {
        // ignore malformed vendor files, as the app does
      }
    }
  }
  indexes.set(kind, map)
  return map
}

function resolvePreset(kind, name) {
  const map = index(kind)
  const chain = []
  let current = name
  while (current) {
    const j = map.get(current)
    if (!j) throw new Error(`${kind} profile not found: ${current}`)
    chain.unshift(j)
    current = typeof j.inherits === 'string' && j.inherits ? j.inherits : undefined
  }
  return Object.assign({}, ...chain)
}

const scalar = (v) => (Array.isArray(v) ? String(v[0] ?? '') : v === undefined ? undefined : String(v))
const missing = new Set()
function pick(preset, target) {
  const out = {}
  for (const d of catalogue) {
    if (d.target !== target) continue
    const v = scalar(preset[d.key])
    if (v === undefined) missing.add(`${target}:${d.key}`)
    else out[d.key] = v
  }
  return out
}

function flat(kind, name, machineName) {
  const j = resolvePreset(kind, name)
  delete j.inherits
  j.name = name
  j.from = 'system'
  if (kind !== 'machine') {
    j.compatible_printers = [machineName]
    j.compatible_printers_condition = ''
  }
  return j
}

/** Slices the cube and returns the footer config (`; key = value`), or null when the engine fails. */
function footer(machineName, processName, filamentName) {
  const dir = join(work, String(Math.random()).slice(2))
  mkdirSync(join(dir, 'out'), { recursive: true })
  const files = { machine: flat('machine', machineName), process: flat('process', processName, machineName), filament: flat('filament', filamentName, machineName) }
  for (const [k, v] of Object.entries(files)) writeFileSync(join(dir, `${k}.json`), JSON.stringify(v))
  const r = spawnSync(exe, ['--arrange', '1', '--slice', '0', '--load-settings', 'machine.json;process.json', '--load-filaments', 'filament.json', '--outputdir', 'out', cube], { cwd: dir, encoding: 'utf8' })
  try {
    const g = readFileSync(join(dir, 'out', 'plate_1.gcode'), 'utf8')
    const cfg = {}
    for (const m of g.matchAll(/^; ([a-z0-9_]+) = (.*)$/gm)) cfg[m[1]] = m[2]
    return cfg
  } catch {
    console.log(`engine failed for ${processName} (exit ${r.status}); using preset values`)
    return null
  }
}

/** Footer value per key, falling back to the preset (first entry of vectors). */
function values(target, preset, cfg) {
  const fromPreset = pick(preset, target)
  if (!cfg) return fromPreset
  const out = {}
  for (const d of catalogue) {
    if (d.target !== target) continue
    const v = cfg[d.key] !== undefined ? cfg[d.key].split(',')[0] : fromPreset[d.key]
    if (v !== undefined) {
      out[d.key] = v
      missing.delete(`${target}:${d.key}`)
    }
  }
  return out
}

const result = { generatedFrom: 'OrcaSlicer 2.4.2, Creality Ender-3 V3 SE system presets (effective values from a slice)', process: {}, machine: {}, filament: {}, materials: {} }
const standardFilament = MATERIALS.PLA
for (const nozzle of NOZZLES) {
  const machineName = `Creality Ender-3 V3 SE ${nozzle} nozzle`
  result.process[nozzle] = {}
  for (const [q, orca] of Object.entries(QUALITIES)) {
    const processName = `${orca} @Creality Ender3V3SE ${nozzle}`
    const cfg = footer(machineName, processName, standardFilament)
    result.process[nozzle][q] = values('process', resolvePreset('process', processName), cfg)
    if (q === 'standard') result.machine[nozzle] = values('machine', resolvePreset('machine', machineName), cfg)
  }
}
// Starting values for a new library entry of each material, read like src/main/library.ts does.
const num = (v, fallback) => {
  const x = parseFloat(Array.isArray(v) ? v[0] : v)
  return Number.isFinite(x) ? x : fallback
}
result.materials = {}
for (const [m, orca] of Object.entries(MATERIALS)) {
  const preset = resolvePreset('filament', orca)
  const cfg = footer('Creality Ender-3 V3 SE 0.4 nozzle', '0.20mm Standard @Creality Ender3V3SE 0.4', orca)
  result.filament[m] = values('filament', preset, cfg)
  const nozzle = Math.min(num(preset.nozzle_temperature, 220), 260)
  const bed = Math.min(num(preset.hot_plate_temp ?? preset.cool_plate_temp, 55), 100)
  result.materials[m] = {
    nozzleTemp: nozzle,
    nozzleTempFirstLayer: Math.min(num(preset.nozzle_temperature_initial_layer, nozzle), 260),
    bedTemp: bed,
    bedTempFirstLayer: Math.min(num(preset.hot_plate_temp_initial_layer ?? preset.cool_plate_temp_initial_layer, bed), 100),
    flowRatio: num(preset.filament_flow_ratio, 0.98),
    maxVolumetricSpeed: num(preset.filament_max_volumetric_speed, 12),
    fanMin: num(preset.fan_min_speed, 100),
    fanMax: num(preset.fan_max_speed, 100),
    density: num(preset.filament_density, 1.24),
    diameter: num(preset.filament_diameter, 1.75)
  }
}

const out = join(root, 'src', 'shared', 'orca-defaults.json')
writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
console.log(`wrote ${out}: ${catalogue.length} catalogue keys`)
if (missing.size) {
  console.log('keys missing from the presets (not real Orca keys, or absent in this vendor chain):')
  for (const k of missing) console.log('  ' + k)
  process.exitCode = 1
}
