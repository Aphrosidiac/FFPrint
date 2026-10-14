// Filament library, saved setups, machine settings and preferences.

import { randomUUID } from 'node:crypto'
import { DEFAULT_END_GCODE, DEFAULT_START_GCODE, MACHINE } from '@shared/machine'
import { MATERIALS } from '@shared/settings'
import type { Filament, MachineSettings, Material, Prefs, PrintSettings, Setup } from '@shared/types'
import { filamentBase, first } from './engine/profiles'
import { engine } from './engine/paths'
import { readDoc, writeDoc } from './store'

const SEED_COLORS: Record<Material, string> = {
  PLA: '#F2F2F0',
  'PLA-HS': '#3A3A3C',
  PETG: '#2F6FDB',
  TPU: '#E0533D',
  ABS: '#E8B931',
  ASA: '#6B7280'
}

/** A new filament of this material, starting from Orca's Creality V3 SE generic profile. */
export function filamentFromMaterial(material: Material, name?: string): Filament {
  const m = MATERIALS.find((x) => x.id === material) ?? MATERIALS[0]
  let base: Record<string, unknown> = {}
  try {
    base = filamentBase(engine.profiles, m.orcaBase)
  } catch {
    // engine missing: fall back to the numbers below
  }
  const nozzle = Math.min(first(base.nozzle_temperature, 220), MACHINE.maxNozzleTemp)
  const bed = Math.min(first(base.hot_plate_temp ?? base.cool_plate_temp, 55), MACHINE.maxBedTemp)
  return {
    id: randomUUID(),
    name: name ?? `Generic ${m.label}`,
    brand: 'Generic',
    material,
    color: SEED_COLORS[material],
    nozzleTemp: nozzle,
    nozzleTempFirstLayer: Math.min(first(base.nozzle_temperature_initial_layer, nozzle), MACHINE.maxNozzleTemp),
    bedTemp: bed,
    bedTempFirstLayer: Math.min(first(base.hot_plate_temp_initial_layer ?? base.cool_plate_temp_initial_layer, bed), MACHINE.maxBedTemp),
    flowRatio: first(base.filament_flow_ratio, 0.98),
    maxVolumetricSpeed: first(base.filament_max_volumetric_speed, 12),
    fanMin: first(base.fan_min_speed, 100),
    fanMax: first(base.fan_max_speed, 100),
    density: first(base.filament_density, 1.24),
    diameter: first(base.filament_diameter, 1.75),
    pricePerKg: 75,
    notes: ''
  }
}

export function getFilaments(): Filament[] {
  const list = readDoc<Filament[] | null>('filaments', () => null)
  if (list && list.length) return list
  return writeDoc(
    'filaments',
    MATERIALS.map((m) => filamentFromMaterial(m.id))
  )
}

export function saveFilament(f: Filament): Filament[] {
  const list = getFilaments()
  const i = list.findIndex((x) => x.id === f.id)
  if (i >= 0) list[i] = f
  else list.push({ ...f, id: f.id || randomUUID() })
  return writeDoc('filaments', list)
}

export function deleteFilament(id: string): Filament[] {
  const list = getFilaments().filter((x) => x.id !== id)
  if (!list.length) throw new Error('Keep at least one filament in the library.')
  return writeDoc('filaments', list)
}

export function getSetups(): Setup[] {
  return readDoc<Setup[]>('setups', () => [])
}

export function saveSetup(s: Setup): Setup[] {
  const list = getSetups()
  const entry = { ...s, id: s.id || randomUUID(), updatedAt: new Date().toISOString() }
  const i = list.findIndex((x) => x.id === entry.id)
  if (i >= 0) list[i] = entry
  else list.push(entry)
  return writeDoc('setups', list)
}

export function deleteSetup(id: string): Setup[] {
  return writeDoc(
    'setups',
    getSetups().filter((x) => x.id !== id)
  )
}

export function defaultMachine(): MachineSettings {
  return {
    nozzle: '0.4',
    startGcode: DEFAULT_START_GCODE,
    endGcode: DEFAULT_END_GCODE,
    firmwareModified: false,
    limits: { ...MACHINE.limits },
    timeFactor: 1
  }
}

export function getMachine(): MachineSettings {
  return { ...defaultMachine(), ...readDoc<Partial<MachineSettings>>('machine', () => ({})) }
}

export function saveMachine(m: MachineSettings): MachineSettings {
  return writeDoc('machine', m)
}

export function defaultPrefs(): Prefs {
  return { theme: 'system', currency: 'RM', lastFilamentId: '', sdVolumeHint: '', fileNamePattern: '{name}', recent: [] }
}

export function getPrefs(): Prefs {
  return { ...defaultPrefs(), ...readDoc<Partial<Prefs>>('prefs', () => ({})) }
}

export function savePrefs(p: Partial<Prefs>): Prefs {
  return writeDoc('prefs', { ...getPrefs(), ...p })
}

export function addRecent(paths: string[]): void {
  const prefs = getPrefs()
  const recent = [...paths, ...prefs.recent.filter((r) => !paths.includes(r))].slice(0, 12)
  savePrefs({ recent })
}

export function getLastSettings(): PrintSettings | null {
  return readDoc<PrintSettings | null>('last-settings', () => null)
}

export function saveLastSettings(s: PrintSettings): void {
  writeDoc('last-settings', s)
}
