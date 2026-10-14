// Builds the three flat config files the OrcaSlicer CLI accepts, from Orca's own V3 SE system presets
// plus FF Print's overrides. Two CLI rules (docs/PLAN.md §1):
//  - inherits must be resolved, because the CLI does not resolve them for loaded files;
//  - each file is marked "from": "system", otherwise the process's compatible_printers is matched
//    against the machine's (now empty) `inherits` and slicing fails with -17.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ResolvedOverrides } from '@shared/settings'

type Kind = 'machine' | 'process' | 'filament'
type Json = Record<string, unknown>

const indexes = new Map<string, Map<string, Json>>()

/** name -> raw preset, across every vendor folder; Creality wins on duplicate names. */
function index(profilesDir: string, kind: Kind): Map<string, Json> {
  const cacheKey = `${profilesDir}|${kind}`
  const cached = indexes.get(cacheKey)
  if (cached) return cached
  const map = new Map<string, Json>()
  for (const vendor of readdirSync(profilesDir, { withFileTypes: true })) {
    if (!vendor.isDirectory()) continue
    const dir = join(profilesDir, vendor.name, kind)
    let files: string[]
    try {
      files = readdirSync(dir, { recursive: true }) as string[]
    } catch {
      continue
    }
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      try {
        const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Json
        const name = typeof j.name === 'string' ? j.name : null
        if (name && (!map.has(name) || vendor.name === 'Creality')) map.set(name, j)
      } catch {
        // a malformed vendor file must not break slicing for this printer
      }
    }
  }
  indexes.set(cacheKey, map)
  return map
}

export function resolvePreset(profilesDir: string, kind: Kind, name: string): Json {
  const map = index(profilesDir, kind)
  const chain: Json[] = []
  let current: string | undefined = name
  const seen = new Set<string>()
  while (current) {
    if (seen.has(current)) throw new Error(`Profile inheritance loop at "${current}"`)
    seen.add(current)
    const j = map.get(current)
    if (!j) throw new Error(`OrcaSlicer ${kind} profile not found: "${current}"`)
    chain.unshift(j)
    current = typeof j.inherits === 'string' && j.inherits ? j.inherits : undefined
  }
  const out: Json = Object.assign({}, ...chain)
  delete out.inherits
  out.name = name
  out.from = 'system'
  return out
}

/** Writes an override into a preset, keeping Orca's encoding (vector options are string arrays). */
function setValue(preset: Json, key: string, value: string): void {
  const current = preset[key]
  if (key === 'thumbnails') {
    preset[key] = value ? value.split(',') : []
    return
  }
  if (Array.isArray(current)) {
    // machine_max_* carry [normal, silent]; every other vector is one entry per extruder/filament.
    preset[key] = current.length > 1 && key.startsWith('machine_max_') ? current.map(() => value) : [value]
  } else if (current === undefined && key.startsWith('machine_max_')) {
    preset[key] = [value, value]
  } else {
    preset[key] = value
  }
}

export function buildConfigs(
  profilesDir: string,
  names: { machine: string; process: string; filament: string },
  overrides: ResolvedOverrides
): { machine: Json; process: Json; filament: Json } {
  const machine = resolvePreset(profilesDir, 'machine', names.machine)
  const process = resolvePreset(profilesDir, 'process', names.process)
  const filament = resolvePreset(profilesDir, 'filament', names.filament)
  for (const [k, v] of Object.entries(overrides.machine)) setValue(machine, k, v)
  for (const [k, v] of Object.entries(overrides.process)) setValue(process, k, v)
  for (const [k, v] of Object.entries(overrides.filament)) setValue(filament, k, v)
  // Process and filament must declare the machine by its exact name (see header comment).
  process.compatible_printers = [names.machine]
  process.compatible_printers_condition = ''
  filament.compatible_printers = [names.machine]
  filament.compatible_printers_condition = ''
  return { machine, process, filament }
}

/** Reads the values a new filament of this material should start from. */
export function filamentBase(profilesDir: string, orcaBase: string): Json {
  return resolvePreset(profilesDir, 'filament', orcaBase)
}

export function first(v: unknown, fallback: number): number {
  const raw = Array.isArray(v) ? v[0] : v
  const num = parseFloat(String(raw ?? ''))
  return Number.isFinite(num) ? num : fallback
}
