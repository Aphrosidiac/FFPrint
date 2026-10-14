// Every settings action a person can take in the Print panel, Filaments page and Printer page, as plain
// functions with no UI in them. Components call these; the automation layer (MCP) calls the same ones.
// Invalid input throws an Error with a message a person can act on.

import { computed, reactive, ref, watch } from 'vue'
import { MACHINE, type Nozzle } from '@shared/machine'
import {
  ADHESION_TYPES,
  CATALOGUE_BY_KEY,
  INFILL_PATTERNS,
  QUALITIES,
  STRENGTHS,
  SUPPORT_MODES,
  applyStrength,
  defaultPrintSettings,
  describeSettings,
  effectiveDefault,
  effectiveLimits,
  effectiveMax,
  encodeValue,
  newFilament,
  sameSettings,
  sameValue,
  validateFilament,
  type SettingDescription
} from '@shared/settings'
import type { AdhesionType, Filament, MachineSettings, Prefs, PrintSettings, QualityId, Setup, StrengthId, SupportMode } from '@shared/types'
import { api } from '@/lib/api'
import { app, currentFilament } from './app'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const fail = (msg: string): never => {
  throw new Error(msg)
}
function checkNumber(name: string, v: unknown, min: number, max: number, integer = false): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!Number.isFinite(n)) fail(`${name} must be a number.`)
  if (n < min || n > max) fail(`${name} must be between ${min} and ${max}.`)
  return integer ? Math.round(n) : n
}

// ================================================================ print settings

export function setQuality(quality: QualityId): void {
  if (!QUALITIES.some((q) => q.id === quality)) fail(`Unknown quality "${quality}". Use ${QUALITIES.map((q) => q.id).join(', ')}.`)
  app.settings.quality = quality
}

/** Applies the strength preset's walls, layers, infill and pattern (also resets inline edits). */
export function setStrength(strength: StrengthId): void {
  if (!STRENGTHS.some((s) => s.id === strength)) fail(`Unknown strength "${strength}". Use ${STRENGTHS.map((s) => s.id).join(', ')}.`)
  app.settings = applyStrength(app.settings, strength)
}

export interface StrengthNumbers {
  walls?: number
  topLayers?: number
  bottomLayers?: number
  /** Infill density in percent */
  infill?: number
  /** One of INFILL_PATTERNS' values */
  pattern?: string
}

/** Edits the numbers under the strength preset; the panel then shows "Custom". */
export function setStrengthNumbers(p: StrengthNumbers): void {
  const s = app.settings
  if (p.walls !== undefined) s.walls = checkNumber('Walls', p.walls, 1, 10, true)
  if (p.topLayers !== undefined) s.topLayers = checkNumber('Top layers', p.topLayers, 0, 20, true)
  if (p.bottomLayers !== undefined) s.bottomLayers = checkNumber('Bottom layers', p.bottomLayers, 0, 20, true)
  if (p.infill !== undefined) s.infill = checkNumber('Infill', p.infill, 0, 100)
  if (p.pattern !== undefined) {
    if (!INFILL_PATTERNS.some((x) => x.value === p.pattern)) fail(`Unknown infill pattern "${p.pattern}". Use ${INFILL_PATTERNS.map((x) => x.value).join(', ')}.`)
    s.infillPattern = p.pattern
  }
}

/** Back to the selected strength preset's numbers. */
export function resetStrengthNumbers(): void {
  app.settings = applyStrength(app.settings, app.settings.strength)
}

export function setSupports(mode: SupportMode, opts: { angle?: number; buildPlateOnly?: boolean } = {}): void {
  if (!SUPPORT_MODES.some((m) => m.id === mode)) fail(`Unknown support mode "${mode}". Use ${SUPPORT_MODES.map((m) => m.id).join(', ')}.`)
  app.settings.supports = mode
  if (opts.angle !== undefined) app.settings.supportAngle = checkNumber('Overhang angle', opts.angle, 0, 90)
  if (opts.buildPlateOnly !== undefined) app.settings.supportBuildPlateOnly = !!opts.buildPlateOnly
}

export function setAdhesion(type: AdhesionType, brimWidth?: number): void {
  if (!ADHESION_TYPES.some((a) => a.id === type)) fail(`Unknown adhesion type "${type}". Use ${ADHESION_TYPES.map((a) => a.id).join(', ')}.`)
  app.settings.adhesion = type
  if (brimWidth !== undefined) app.settings.brimWidth = checkNumber('Brim width', brimWidth, 1, 20)
}

function defaultOf(key: string): string | undefined {
  const def = CATALOGUE_BY_KEY.get(key)
  const f = currentFilament()
  if (!def || !f || !app.machine) return undefined
  return effectiveDefault(def, app.settings, f, app.machine)
}

/**
 * Sets a "More settings" value by Orca key. Numbers are clamped to the setting's range and the firmware
 * limits; a value equal to the default removes the override. Returns the stored value (undefined when
 * it matched the default).
 */
export function setOverride(key: string, value: string | number | boolean): string | undefined {
  const def = CATALOGUE_BY_KEY.get(key) ?? fail(`"${key}" is not one of FF Print's settings. Call listSettings() for the keys.`)
  let encoded: string
  if (def.kind === 'bool') {
    const b = typeof value === 'string' ? ['1', 'true', 'on', 'yes'].includes(value.toLowerCase()) : !!value
    encoded = encodeValue(def, b)
  } else if (def.kind === 'enum') {
    const v = String(value)
    const opt = def.options?.find((o) => o.value === v || o.label.toLowerCase() === v.toLowerCase())
    if (!opt) fail(`${def.label} must be one of: ${def.options?.map((o) => o.value).join(', ')}.`)
    encoded = opt!.value
  } else {
    let n = typeof value === 'number' ? value : parseFloat(String(value))
    if (!Number.isFinite(n)) fail(`${def.label} must be a number.`)
    const max = app.machine ? effectiveMax(def, effectiveLimits(app.machine)) : def.max
    if (def.min !== undefined) n = Math.max(def.min, n)
    if (max !== undefined) n = Math.min(max, n)
    encoded = encodeValue(def, n)
  }
  if (sameValue(def, encoded, defaultOf(key))) {
    resetOverride(key)
    return undefined
  }
  app.settings.overrides = { ...app.settings.overrides, [key]: encoded }
  return encoded
}

export function resetOverride(key: string): void {
  if (!(key in app.settings.overrides)) return
  const { [key]: _drop, ...rest } = app.settings.overrides
  app.settings.overrides = rest
}

export function resetAllOverrides(): void {
  app.settings.overrides = {}
}

/** Every catalogue setting with its effective value, default, unit, range and help. */
export function listSettings(): SettingDescription[] {
  const f = currentFilament()
  if (!f || !app.machine) return []
  return describeSettings(app.settings, f, app.machine)
}

// ================================================================ saved setups

const SETUP_KEY = 'ffprint.setupId'
function readSetupId(): string {
  try {
    return localStorage.getItem(SETUP_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Setup the current settings were loaded from; '' = Default. Remembered across restarts. */
export const activeSetupId = ref(readSetupId())
watch(activeSetupId, (v) => {
  try {
    localStorage.setItem(SETUP_KEY, v)
  } catch {
    // storage unavailable: the choice just is not remembered
  }
})
export const activeSetup = computed<Setup | undefined>(() => app.setups.find((s) => s.id === activeSetupId.value))
/** True when the panel differs from the loaded setup (or from Default). */
export const setupModified = computed(() => !sameSettings(app.settings, activeSetup.value?.settings ?? defaultPrintSettings()))

export interface SettingsSnapshot {
  settings: PrintSettings
  setupId: string
}
export function snapshotSettings(): SettingsSnapshot {
  return { settings: clone(app.settings), setupId: activeSetupId.value }
}
export function restoreSettings(s: SettingsSnapshot): void {
  activeSetupId.value = s.setupId
  app.settings = clone(s.settings)
}

/** Loads a saved setup onto the panel ('' or 'default' = FF Print's defaults). Unsaved changes are replaced. */
export function applySetup(id: string): void {
  if (!id || id === 'default') {
    activeSetupId.value = ''
    app.settings = defaultPrintSettings()
    return
  }
  const setup = app.setups.find((s) => s.id === id || s.name.toLowerCase() === id.toLowerCase()) ?? fail(`No saved setup "${id}".`)
  activeSetupId.value = setup.id
  app.settings = { ...defaultPrintSettings(), ...clone(setup.settings) }
}

export async function saveSetupAs(name: string): Promise<Setup> {
  const n = name.trim()
  if (!n) fail('Give the setup a name.')
  if (app.setups.some((s) => s.name.trim().toLowerCase() === n.toLowerCase())) fail(`A setup called "${n}" already exists.`)
  const id = crypto.randomUUID()
  app.setups = await api.saveSetup({ id, name: n, settings: clone(app.settings), updatedAt: '' })
  activeSetupId.value = id
  return app.setups.find((s) => s.id === id)!
}

/** Saves the current settings into an existing setup (the loaded one by default). */
export async function updateSetup(id: string = activeSetupId.value): Promise<Setup> {
  const setup = app.setups.find((s) => s.id === id) ?? fail(id ? `No saved setup "${id}".` : 'Default cannot be overwritten. Save as a new setup instead.')
  app.setups = await api.saveSetup({ ...setup, settings: clone(app.settings) })
  activeSetupId.value = setup.id
  return app.setups.find((s) => s.id === setup.id)!
}

export async function renameSetup(id: string, name: string): Promise<Setup> {
  const setup = app.setups.find((s) => s.id === id) ?? fail(`No saved setup "${id}".`)
  const n = name.trim()
  if (!n) fail('Give the setup a name.')
  if (app.setups.some((s) => s.id !== id && s.name.trim().toLowerCase() === n.toLowerCase())) fail(`A setup called "${n}" already exists.`)
  app.setups = await api.saveSetup({ ...setup, name: n })
  return app.setups.find((s) => s.id === id)!
}

/** Deletes a saved setup. The panel keeps its current settings. */
export async function deleteSetup(id: string = activeSetupId.value): Promise<void> {
  const setup = app.setups.find((s) => s.id === id) ?? fail(id ? `No saved setup "${id}".` : 'Default cannot be deleted.')
  app.setups = await api.deleteSetup(setup.id)
  if (activeSetupId.value === setup.id) activeSetupId.value = ''
}

// ================================================================ filaments

export function selectFilament(id: string): void {
  if (!app.filaments.some((f) => f.id === id)) fail(`No filament "${id}" in the library.`)
  app.filamentId = id
}

function checkFilament(f: Filament): void {
  const errors = validateFilament(f)
  const msgs = Object.values(errors)
  if (msgs.length) fail(msgs.join(' '))
}

/**
 * Adds a filament. Unspecified fields come from a spool of the same material in the library, else from
 * Orca's Creality generic profile for the material.
 */
export async function createFilament(partial: Partial<Filament> = {}): Promise<Filament> {
  const f: Filament = { ...newFilament(app.filaments, partial), id: crypto.randomUUID() }
  f.name = f.name.trim()
  checkFilament(f)
  app.filaments = await api.saveFilament(f)
  return app.filaments.find((x) => x.id === f.id) ?? f
}

export async function updateFilament(id: string, patch: Partial<Filament>): Promise<Filament> {
  const current = app.filaments.find((f) => f.id === id) ?? fail(`No filament "${id}" in the library.`)
  const next: Filament = { ...clone(current), ...patch, id }
  next.name = next.name.trim()
  checkFilament(next)
  app.filaments = await api.saveFilament(next)
  return app.filaments.find((x) => x.id === id) ?? next
}

export async function duplicateFilament(id: string, name?: string): Promise<Filament> {
  const src = app.filaments.find((f) => f.id === id) ?? fail(`No filament "${id}" in the library.`)
  return createFilament({ ...clone(src), name: name ?? `${src.name} copy` })
}

/** Deletes a filament (the library always keeps one). Selects another if it was in use. */
export async function deleteFilament(id: string): Promise<void> {
  if (!app.filaments.some((f) => f.id === id)) fail(`No filament "${id}" in the library.`)
  app.filaments = await api.deleteFilament(id)
  if (!app.filaments.some((f) => f.id === app.filamentId)) app.filamentId = app.filaments[0]?.id ?? ''
}

// ================================================================ machine + preferences

/** Shown as "Saving…" / "Saved" on the Printer page. */
export const saveStatus = reactive({ state: 'idle' as 'idle' | 'saving' | 'saved' | 'error', error: '' })
let statusTimer: ReturnType<typeof setTimeout> | undefined
async function tracked<T>(fn: () => Promise<T>): Promise<T> {
  saveStatus.state = 'saving'
  try {
    const r = await fn()
    saveStatus.state = 'saved'
    saveStatus.error = ''
    clearTimeout(statusTimer)
    statusTimer = setTimeout(() => (saveStatus.state = 'idle'), 2000)
    return r
  } catch (e) {
    saveStatus.state = 'error'
    saveStatus.error = e instanceof Error ? e.message : String(e)
    throw e
  }
}

/** Collapses rapid calls (typing) into one save; every caller gets that save's result. */
function debounced<T>(ms: number, run: () => Promise<T>): { schedule: () => Promise<T>; flush: () => Promise<T> | undefined } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let waiting: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = []
  const fire = (): Promise<T> => {
    clearTimeout(timer)
    timer = undefined
    const batch = waiting
    waiting = []
    const p = tracked(run)
    p.then((v) => batch.forEach((w) => w.resolve(v)), (e) => batch.forEach((w) => w.reject(e)))
    return p
  }
  return {
    schedule: () =>
      new Promise<T>((resolve, reject) => {
        waiting.push({ resolve, reject })
        clearTimeout(timer)
        timer = setTimeout(fire, ms)
      }),
    flush: () => (timer ? fire() : undefined)
  }
}

const machineSave = debounced(400, async () => {
  if (!app.machine) throw new Error('Printer settings are not loaded yet.')
  return api.saveMachine(clone(app.machine))
})

/**
 * Changes printer settings (nozzle, firmwareModified, limits (partial is fine), startGcode, endGcode,
 * timeFactor). Applies at once; saving is debounced and the promise resolves when it is written.
 */
export function updateMachine(patch: Partial<Omit<MachineSettings, 'limits'>> & { limits?: Partial<MachineSettings['limits']> }): Promise<MachineSettings> {
  const m = app.machine ?? fail('Printer settings are not loaded yet.')
  if (patch.nozzle !== undefined && !MACHINE.nozzles.includes(patch.nozzle as Nozzle)) fail(`Nozzle must be one of ${MACHINE.nozzles.join(', ')} mm.`)
  if (patch.timeFactor !== undefined) checkNumber('Time factor', patch.timeFactor, 0.5, 2)
  if (patch.limits) for (const [k, v] of Object.entries(patch.limits)) {
    if (!(k in MACHINE.limits)) fail(`Unknown firmware limit "${k}".`)
    checkNumber(k, v, 0, 100000)
  }
  const { limits, ...rest } = patch
  Object.assign(m, rest)
  if (limits) m.limits = { ...m.limits, ...limits }
  return machineSave.schedule()
}

/** Writes pending printer changes now (e.g. when leaving the page). */
export function flushMachine(): void {
  machineSave.flush()?.catch(() => undefined)
}

export async function setTheme(theme: Prefs['theme']): Promise<Prefs> {
  if (!['system', 'light', 'dark'].includes(theme)) fail('Theme must be system, light or dark.')
  if (app.prefs) app.prefs.theme = theme
  const prefs = await tracked(() => api.savePrefs({ theme }))
  app.prefs = prefs
  return prefs
}

export const FILE_NAME_TOKENS = ['{name}', '{quality}', '{material}', '{date}'] as const

let pendingPattern = ''
const patternSave = debounced(500, async () => {
  const prefs = await api.savePrefs({ fileNamePattern: pendingPattern })
  if (app.prefs) app.prefs.fileNamePattern = prefs.fileNamePattern
  return prefs
})

/** SD file-name pattern with {name} {quality} {material} {date}. Debounced like typing. */
export function setFileNamePattern(pattern: string): Promise<Prefs> {
  const p = pattern.trim() || '{name}'
  const unknown = [...p.matchAll(/\{(\w+)\}/g)].map((x) => x[0]).filter((t) => !(FILE_NAME_TOKENS as readonly string[]).includes(t))
  if (unknown.length) fail(`Unknown placeholder ${unknown.join(' ')}. Use ${FILE_NAME_TOKENS.join(' ')}.`)
  pendingPattern = p
  return patternSave.schedule()
}

export function flushPrefs(): void {
  patternSave.flush()?.catch(() => undefined)
}
