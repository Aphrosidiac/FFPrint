// Renderer side of the automation server (src/main/automation/tools.ts). Every renderer tool listed
// there has a handler here; each handler goes through the same store functions the UI uses, so what
// Claude Code does is exactly what a click would do.

import { toRaw } from 'vue'
import { CATALOGUE, QUALITIES, STRENGTHS, SUPPORT_MODES, ADHESION_TYPES, applyStrength, settingsSummary } from '@shared/settings'
import { CREALITY_TUNING } from '@shared/tuning'
import { MACHINE } from '@shared/machine'
import type { Filament, MachineSettings, Prefs, PrintSettings } from '@shared/types'
import { api, errorText } from '@/lib/api'
import { arrange } from '@/lib/arrange'
import { app, cancelSlice, currentFilament, openPaths, recordJob, reprint, runSlice } from '@/stores/app'
import {
  addObject,
  clearScene,
  dropToBed,
  issues,
  meshes,
  removeObjects,
  scene,
  select,
  toProject,
  touch,
  worldBox,
  type SceneObject
} from '@/stores/scene'

type Args = Record<string, any>
type Handler = (args: Args) => Promise<unknown> | unknown

/** Optional hooks other modules register (camera, preview, lay-flat) so automation can reach them. */
export const hooks: {
  setCameraView?: (view: string) => void
  layFlat?: (id: string, faceIndex?: number) => void
  previewInfo?: () => unknown
  setLayerRange?: (min?: number, max?: number) => unknown
  setFeatureVisible?: (feature: string, visible: boolean) => unknown
} = {}

const r2 = (v: number): number => Math.round(v * 100) / 100
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(toRaw(v)))

function obj(id: string): SceneObject {
  const o = scene.objects.find((x) => x.id === id)
  if (!o) throw new Error(`No object with id "${id}". Call list_objects.`)
  return o
}

function describeObject(o: SceneObject): unknown {
  const b = worldBox(o)
  return {
    id: o.id,
    name: o.name,
    position: { x: r2(o.position.x), y: r2(o.position.y), z: r2(o.position.z) },
    rotation: { x: r2(o.rotation.x), y: r2(o.rotation.y), z: r2(o.rotation.z) },
    scalePercent: { x: r2(o.scale.x * 100), y: r2(o.scale.y * 100), z: r2(o.scale.z * 100) },
    sizeMm: { x: r2(b.max.x - b.min.x), y: r2(b.max.y - b.min.y), z: r2(b.max.z - b.min.z) },
    bounds: { min: { x: r2(b.min.x), y: r2(b.min.y), z: r2(b.min.z) }, max: { x: r2(b.max.x), y: r2(b.max.y), z: r2(b.max.z) } },
    visible: o.visible,
    selected: scene.selection.includes(o.id),
    issues: issues(o),
    triangles: meshes.get(o.meshId)?.triangles ?? 0
  }
}

function sliceInfo(): unknown {
  const s = app.slice
  return { status: s.status, error: s.error || undefined, result: s.result ? plain(s.result) : null }
}

async function waitForSlice(): Promise<void> {
  while (app.slice.status === 'slicing') await new Promise((r) => setTimeout(r, 100))
}

function setOverride(key: string, value: unknown): void {
  const overrides = { ...app.settings.overrides }
  if (value === null || value === undefined) delete overrides[key]
  else overrides[key] = typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
  app.settings = { ...app.settings, overrides }
}

async function saveFilament(f: Partial<Filament> & { id?: string }): Promise<Filament> {
  const base = (f.id && app.filaments.find((x) => x.id === f.id)) || app.filaments.find((x) => x.material === f.material) || app.filaments[0]
  const next = { ...plain(base), ...f, id: f.id ?? '' } as Filament
  if (!f.id) next.notes = f.notes ?? ''
  app.filaments = await api.saveFilament(next)
  return f.id ? (app.filaments.find((x) => x.id === f.id) as Filament) : app.filaments[app.filaments.length - 1]
}

const handlers: Record<string, Handler> = {
  // ---- app
  get_state: () => ({
    page: app.page,
    mode: app.mode,
    objects: scene.objects.map(describeObject),
    selection: [...scene.selection],
    settings: { ...plain(app.settings), summary: settingsSummary(app.settings) },
    filament: currentFilament() ? plain(currentFilament()) : null,
    machine: app.machine ? { nozzle: app.machine.nozzle, timeFactor: app.machine.timeFactor, firmwareModified: app.machine.firmwareModified } : null,
    slice: sliceInfo(),
    drives: plain(app.drives),
    bed: { x: MACHINE.bed.x, y: MACHINE.bed.y, maxZ: MACHINE.maxZ }
  }),
  navigate: ({ page, mode }) => {
    if (page) app.page = page
    if (mode) app.mode = mode
    return { page: app.page, mode: app.mode }
  },
  ui_eval: async ({ code }) => {
    const fn = new Function('ff', `return (async () => { ${code} })()`)
    return plain(await fn({ app, scene, meshes, actions: handlers }))
  },

  // ---- files
  open_models: async ({ paths }) => {
    const before = new Set(scene.objects.map((o) => o.id))
    await openPaths(paths)
    return { added: scene.objects.filter((o) => !before.has(o.id)).map(describeObject), total: scene.objects.length }
  },
  save_project: async ({ path }) => {
    if (!scene.objects.length) throw new Error('The bed is empty.')
    const { project, models } = toProject(app.settings, app.filamentId)
    return { path: await api.saveProjectTo(path, project, models) }
  },

  // ---- objects
  list_objects: () => scene.objects.map(describeObject),
  select_objects: ({ ids, additive }) => {
    for (const id of ids) obj(id)
    select(ids, additive)
    return { selection: [...scene.selection] }
  },
  move_object: ({ id, x, y, relative }) => {
    const o = obj(id)
    if (x !== undefined) o.position.x = relative ? o.position.x + x : x
    if (y !== undefined) o.position.y = relative ? o.position.y + y : y
    touch()
    return describeObject(o)
  },
  rotate_object: ({ id, rotation, relative }) => {
    const o = obj(id)
    for (const k of ['x', 'y', 'z'] as const) if (rotation?.[k] !== undefined) o.rotation[k] = relative ? o.rotation[k] + rotation[k] : rotation[k]
    dropToBed(o)
    touch()
    return describeObject(o)
  },
  scale_object: ({ id, percent, perAxisPercent, sizeMm, uniform }) => {
    const o = obj(id)
    if (percent !== undefined) o.scale = { x: percent / 100, y: percent / 100, z: percent / 100 }
    if (perAxisPercent) for (const k of ['x', 'y', 'z'] as const) if (perAxisPercent[k] !== undefined) o.scale[k] = perAxisPercent[k] / 100
    if (sizeMm) {
      const b = worldBox(o)
      const cur = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z }
      const keys = (['x', 'y', 'z'] as const).filter((k) => sizeMm[k] !== undefined)
      if (uniform !== false && keys.length === 1) {
        const f = sizeMm[keys[0]] / cur[keys[0]]
        o.scale = { x: o.scale.x * f, y: o.scale.y * f, z: o.scale.z * f }
      } else for (const k of keys) o.scale[k] = o.scale[k] * (sizeMm[k] / cur[k])
    }
    dropToBed(o)
    touch()
    return describeObject(o)
  },
  lay_flat: ({ id, faceIndex }) => {
    const o = obj(id)
    if (!hooks.layFlat) throw new Error('Lay flat is not available yet.')
    hooks.layFlat(id, faceIndex)
    return describeObject(o)
  },
  drop_to_bed: ({ ids }) => {
    for (const id of ids) dropToBed(obj(id))
    touch()
    return ids.map((id: string) => describeObject(obj(id)))
  },
  centre_object: ({ id }) => {
    const o = obj(id)
    const b = worldBox(o)
    o.position.x += MACHINE.bed.x / 2 - (b.min.x + b.max.x) / 2
    o.position.y += MACHINE.bed.y / 2 - (b.min.y + b.max.y) / 2
    touch()
    return describeObject(o)
  },
  duplicate_objects: ({ ids, count }) => {
    const created: SceneObject[] = []
    for (const id of ids) {
      const src = obj(id)
      for (let i = 0; i < (count ?? 1); i++) {
        const c = addObject(src.meshId, src.name)
        c.rotation = { ...src.rotation }
        c.scale = { ...src.scale }
        c.position.z = src.position.z
        created.push(c)
      }
    }
    const fits = arrange(scene.objects)
    touch()
    return { created: created.map(describeObject), fits }
  },
  remove_objects: ({ ids }) => {
    removeObjects(ids)
    return { remaining: scene.objects.length }
  },
  clear_bed: () => {
    clearScene()
    return { remaining: 0 }
  },
  rename_object: ({ id, name }) => {
    obj(id).name = name
    touch()
    return describeObject(obj(id))
  },
  set_object_visible: ({ id, visible }) => {
    obj(id).visible = visible
    touch()
    return describeObject(obj(id))
  },
  arrange_all: () => {
    const fits = arrange(scene.objects)
    touch()
    return { fits, objects: scene.objects.map(describeObject) }
  },
  set_camera_view: ({ view }) => {
    if (!hooks.setCameraView) throw new Error('The 3D view is not ready.')
    hooks.setCameraView(view)
    return { view }
  },

  // ---- settings
  list_settings: () => ({
    main: {
      quality: { value: app.settings.quality, options: QUALITIES.map((q) => ({ id: q.id, label: q.label, layerHeight: q.layerHeight, help: q.hint })) },
      strength: { value: app.settings.strength, options: STRENGTHS, current: { walls: app.settings.walls, infill: app.settings.infill, infillPattern: app.settings.infillPattern, topLayers: app.settings.topLayers, bottomLayers: app.settings.bottomLayers } },
      supports: { value: app.settings.supports, angle: app.settings.supportAngle, buildPlateOnly: app.settings.supportBuildPlateOnly, options: SUPPORT_MODES },
      adhesion: { value: app.settings.adhesion, brimWidth: app.settings.brimWidth, options: ADHESION_TYPES }
    },
    advanced: CATALOGUE.map((d) => ({
      key: d.key,
      group: d.group,
      label: d.label,
      help: d.help,
      kind: d.kind,
      unit: d.unit,
      min: d.min,
      max: d.max,
      options: d.options,
      value: app.settings.overrides[d.key] ?? null,
      baseline: CREALITY_TUNING[d.key] ?? null
    })),
    note: 'value null = FF Print default (Orca V3 SE preset + Creality tuning in `baseline`).'
  }),
  set_print_settings: (a) => {
    let s: PrintSettings = { ...app.settings }
    if (a.strength) s = applyStrength(s, a.strength)
    for (const k of ['quality', 'walls', 'infill', 'infillPattern', 'topLayers', 'bottomLayers', 'supports', 'supportAngle', 'supportBuildPlateOnly', 'adhesion', 'brimWidth'] as const) {
      if (a[k] !== undefined) (s as unknown as Args)[k] = a[k]
    }
    app.settings = s
    return { settings: plain(app.settings), summary: settingsSummary(app.settings) }
  },
  set_setting: ({ key, value }) => {
    setOverride(key, value)
    return { key, value: app.settings.overrides[key] ?? null, known: CATALOGUE.some((d) => d.key === key) }
  },
  reset_settings: ({ keys }) => {
    if (!keys) app.settings = { ...app.settings, overrides: {} }
    else for (const k of keys) setOverride(k, null)
    return { overrides: plain(app.settings.overrides) }
  },
  list_setups: () => plain(app.setups),
  apply_setup: ({ id }) => {
    const s = app.setups.find((x) => x.id === id)
    if (!s) throw new Error(`No setup "${id}".`)
    app.settings = plain(s.settings)
    return { applied: s.name, summary: settingsSummary(app.settings) }
  },
  save_setup: async ({ name, id }) => {
    app.setups = await api.saveSetup({ id: id ?? '', name, settings: plain(app.settings), updatedAt: '' })
    return plain(app.setups)
  },
  delete_setup: async ({ id }) => {
    app.setups = await api.deleteSetup(id)
    return plain(app.setups)
  },

  // ---- filaments + printer
  list_filaments: () => app.filaments.map((f) => ({ ...plain(f), selected: f.id === app.filamentId })),
  select_filament: ({ id }) => {
    if (!app.filaments.some((f) => f.id === id)) throw new Error(`No filament "${id}".`)
    app.filamentId = id
    return plain(currentFilament())
  },
  save_filament: async ({ filament }) => saveFilament(filament as Partial<Filament>),
  delete_filament: async ({ id }) => {
    app.filaments = await api.deleteFilament(id)
    if (app.filamentId === id) app.filamentId = app.filaments[0]?.id ?? ''
    return { remaining: app.filaments.length }
  },
  update_machine: async ({ patch }) => {
    const next = { ...plain(app.machine as MachineSettings), ...patch } as MachineSettings
    app.machine = await api.saveMachine(next)
    return plain(app.machine)
  },
  set_preferences: async ({ patch }) => {
    app.prefs = await api.savePrefs(patch as Partial<Prefs>)
    return plain(app.prefs)
  },

  // ---- slicing + preview
  slice: async () => {
    await runSlice()
    await waitForSlice()
    if (app.slice.status !== 'done') throw new Error(app.slice.error || `Slice ended as ${app.slice.status}`)
    return sliceInfo()
  },
  cancel_slice: async () => {
    await cancelSlice()
    return sliceInfo()
  },
  get_slice_result: () => sliceInfo(),
  read_gcode: async ({ fromLine, count, match }) => {
    const r = app.slice.result
    if (!r) throw new Error('Nothing sliced yet.')
    const lines = (await api.readGcode(r.gcodePath)).split('\n')
    if (match) {
      const re = new RegExp(match)
      const hits: { line: number; text: string }[] = []
      for (let i = 0; i < lines.length && hits.length < 500; i++) if (re.test(lines[i])) hits.push({ line: i + 1, text: lines[i] })
      return { totalLines: lines.length, hits }
    }
    const from = Math.max(1, fromLine ?? 1)
    const n = Math.min(2000, count ?? 200)
    return { totalLines: lines.length, fromLine: from, lines: lines.slice(from - 1, from - 1 + n) }
  },
  get_preview_info: () => {
    if (!hooks.previewInfo) throw new Error('Open the preview first (navigate mode=preview after slicing).')
    return hooks.previewInfo()
  },
  set_layer_range: ({ min, max }) => {
    if (!hooks.setLayerRange) throw new Error('Open the preview first (navigate mode=preview after slicing).')
    return hooks.setLayerRange(min, max)
  },
  set_feature_visible: ({ feature, visible }) => {
    if (!hooks.setFeatureVisible) throw new Error('Open the preview first (navigate mode=preview after slicing).')
    return hooks.setFeatureVisible(feature, visible)
  },

  // ---- output
  save_to_sd: async ({ driveRoot, fileName }) => {
    const r = app.slice.result
    if (!r || app.slice.status !== 'done') throw new Error('Slice first (the last slice is missing or out of date).')
    const drives = await api.listDrives()
    const drive = driveRoot ? drives.find((d) => d.root.toLowerCase() === String(driveRoot).toLowerCase()) : drives.find((d) => d.likelyPrinterCard)
    if (!drive) throw new Error(driveRoot ? `Drive ${driveRoot} is not connected.` : 'No printer SD card found. Insert the card or pass driveRoot (see list_drives).')
    const saved = await api.saveToDrive(r.id, drive.root, fileName ?? r.fileName)
    await recordJob(saved.path, '')
    return { path: saved.path, drive: drive.root }
  },
  save_gcode: async ({ path }) => {
    const r = app.slice.result
    if (!r || app.slice.status !== 'done') throw new Error('Slice first (the last slice is missing or out of date).')
    const saved = await api.saveGcodeTo(r.id, path)
    await recordJob(saved.path, '')
    return saved
  },

  // ---- history
  reprint: async ({ id }) => {
    await reprint(id)
    return { objects: scene.objects.map(describeObject), settings: settingsSummary(app.settings) }
  },
  set_actual_time: async ({ id, seconds }) => {
    const r = await api.setActualTime(id, seconds)
    app.history = r.history
    app.machine = r.machine
    return { timeFactor: r.machine.timeFactor }
  },
  delete_job: async ({ id }) => {
    app.history = await api.deleteHistory(id)
    return { remaining: app.history.length }
  }
}

export const AUTOMATION_COMMANDS = Object.keys(handlers)

export function initAutomation(): void {
  window.ffprint.onAutomation(async (command, args) => {
    const h = handlers[command]
    if (!h) throw new Error(`Unknown command "${command}".`)
    try {
      return await h((args ?? {}) as Args)
    } catch (e) {
      throw new Error(errorText(e))
    }
  })
}
