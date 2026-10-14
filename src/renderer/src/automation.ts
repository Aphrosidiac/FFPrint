// Renderer side of the automation server (src/main/automation/tools.ts). Every renderer tool listed
// there has a handler here; each handler goes through the same store functions the UI uses, so what
// Claude Code does is exactly what a click would do.

import { toRaw } from 'vue'
import { QUALITIES, STRENGTHS, SUPPORT_MODES, ADHESION_TYPES, settingsSummary } from '@shared/settings'
import { MACHINE } from '@shared/machine'
import type { Filament, MachineSettings, Prefs } from '@shared/types'
import { api, errorText } from '@/lib/api'
import * as P from '@/preview/actions'
import * as O from '@/stores/outputActions'
import * as S from '@/stores/settingsActions'
import * as V from '@/viewport/actions'
import * as U from '@/stores/undo'
import { app, cancelSlice, currentFilament, openPaths, recordJob, reprint, runSlice } from '@/stores/app'
import { clearScene, meshes, scene, toProject, type SceneObject } from '@/stores/scene'

type Args = Record<string, any>
type Handler = (args: Args) => Promise<unknown> | unknown


const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(toRaw(v)))

function obj(id: string): SceneObject {
  const o = scene.objects.find((x) => x.id === id)
  if (!o) throw new Error(`No object with id "${id}". Call list_objects.`)
  return o
}


function sliceInfo(): unknown {
  const s = app.slice
  return { status: s.status, error: s.error || undefined, result: s.result ? plain(s.result) : null }
}

async function waitForSlice(): Promise<void> {
  while (app.slice.status === 'slicing') await new Promise((r) => setTimeout(r, 100))
}



const handlers: Record<string, Handler> = {
  // ---- app
  get_state: () => ({
    page: app.page,
    mode: app.mode,
    objects: V.listObjects(),
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

  // ---- files
  open_models: async ({ paths }) => {
    const before = new Set(scene.objects.map((o) => o.id))
    await openPaths(paths)
    return { added: scene.objects.filter((o) => !before.has(o.id)).map((o) => V.objectInfo(o.id)), total: scene.objects.length }
  },
  save_project: async ({ path }) => {
    if (!scene.objects.length) throw new Error('The bed is empty.')
    const { project, models } = toProject(app.settings, app.filamentId)
    return { path: await api.saveProjectTo(path, project, models) }
  },

  // ---- objects
  list_objects: () => V.listObjects(),
  select_objects: ({ ids, additive }) => {
    for (const id of ids) obj(id)
    V.selectObjects(ids, additive)
    return { selection: [...scene.selection] }
  },
  move_object: ({ id, x, y, relative }) => {
    obj(id)
    V.moveObject(id, { x, y }, relative ? 'relative' : 'absolute')
    return V.objectInfo(id)
  },
  rotate_object: ({ id, rotation, relative }) => {
    obj(id)
    V.rotateObject(id, rotation ?? {}, relative ? 'relative' : 'absolute')
    return V.objectInfo(id)
  },
  scale_object: ({ id, percent, perAxisPercent, sizeMm, uniform }) => {
    obj(id)
    V.scaleObject(id, { percent, axes: perAxisPercent, size: sizeMm, uniform })
    return V.objectInfo(id)
  },
  lay_flat: ({ id, faceIndex }) => {
    obj(id)
    if (faceIndex !== undefined) V.layFlatOnFace(id, faceIndex)
    else V.layFlatAuto(id)
    return V.objectInfo(id)
  },
  drop_to_bed: ({ ids }) => {
    for (const id of ids) obj(id)
    V.dropToBed(ids)
    return ids.map((id: string) => V.objectInfo(id))
  },
  centre_object: ({ id }) => {
    obj(id)
    V.centreOnBed([id])
    return V.objectInfo(id)
  },
  duplicate_objects: ({ ids, count }) => {
    for (const id of ids) obj(id)
    const created = V.duplicateObjects(ids, count ?? 1)
    return { created: created.map((id) => V.objectInfo(id)), total: scene.objects.length }
  },
  remove_objects: ({ ids }) => {
    V.deleteObjects(ids)
    return { remaining: scene.objects.length }
  },
  undo: () => ({ undone: U.undo(), ...U.undoInfo(), objects: V.listObjects() }),
  redo: () => ({ redone: U.redo(), ...U.undoInfo(), objects: V.listObjects() }),
  clear_bed: () => {
    clearScene()
    return { remaining: 0 }
  },
  rename_object: ({ id, name }) => {
    obj(id)
    V.renameObject(id, name)
    return V.objectInfo(id)
  },
  set_object_visible: ({ id, visible }) => {
    obj(id)
    V.setVisible(id, visible)
    return V.objectInfo(id)
  },
  arrange_all: () => ({ fits: V.arrangeAll(), objects: V.listObjects() }),
  set_camera_view: ({ view }) => {
    if (app.mode === 'preview' && ['iso', 'top', 'front', 'fit'].includes(view)) P.setPreviewView(view)
    else V.setCameraView(view)
    return { view, mode: app.mode }
  },

  // ---- settings
  list_settings: () => ({
    main: {
      quality: { value: app.settings.quality, options: QUALITIES.map((q) => ({ id: q.id, label: q.label, layerHeight: q.layerHeight, help: q.hint })) },
      strength: { value: app.settings.strength, options: STRENGTHS, current: { walls: app.settings.walls, infill: app.settings.infill, infillPattern: app.settings.infillPattern, topLayers: app.settings.topLayers, bottomLayers: app.settings.bottomLayers } },
      supports: { value: app.settings.supports, angle: app.settings.supportAngle, buildPlateOnly: app.settings.supportBuildPlateOnly, options: SUPPORT_MODES },
      adhesion: { value: app.settings.adhesion, brimWidth: app.settings.brimWidth, options: ADHESION_TYPES }
    },
    advanced: plain(S.listSettings())
  }),
  set_print_settings: (a) => {
    if (a.quality) S.setQuality(a.quality)
    if (a.strength) S.setStrength(a.strength)
    const nums = { walls: a.walls, topLayers: a.topLayers, bottomLayers: a.bottomLayers, infill: a.infill, pattern: a.infillPattern }
    if (Object.values(nums).some((v) => v !== undefined)) S.setStrengthNumbers(nums)
    if (a.supports || a.supportAngle !== undefined || a.supportBuildPlateOnly !== undefined) S.setSupports(a.supports ?? app.settings.supports, { angle: a.supportAngle, buildPlateOnly: a.supportBuildPlateOnly })
    if (a.adhesion || a.brimWidth !== undefined) S.setAdhesion(a.adhesion ?? app.settings.adhesion, a.brimWidth)
    return { settings: plain(app.settings), summary: settingsSummary(app.settings) }
  },
  set_setting: ({ key, value }) => {
    if (value === null || value === undefined) S.resetOverride(key)
    else S.setOverride(key, value)
    const stored = app.settings.overrides[key]
    return { key, value: stored ?? null, note: stored === undefined ? 'Equal to the default, so nothing is overridden.' : undefined }
  },
  reset_settings: ({ keys }) => {
    if (!keys) S.resetAllOverrides()
    else for (const k of keys) S.resetOverride(k)
    return { overrides: plain(app.settings.overrides) }
  },
  list_setups: () => ({ active: S.activeSetupId.value || 'default', modified: S.setupModified.value, setups: plain(app.setups) }),
  apply_setup: ({ id }) => {
    S.applySetup(id)
    return { applied: S.activeSetup.value?.name ?? 'Default', summary: settingsSummary(app.settings) }
  },
  save_setup: async ({ name, id }) => (id ? S.renameSetup(id, name).then(() => S.updateSetup(id)) : S.saveSetupAs(name)),
  delete_setup: async ({ id }) => {
    await S.deleteSetup(id)
    return plain(app.setups)
  },

  // ---- filaments + printer
  list_filaments: () => app.filaments.map((f) => ({ ...plain(f), selected: f.id === app.filamentId })),
  select_filament: ({ id }) => {
    S.selectFilament(id)
    return plain(currentFilament())
  },
  save_filament: async ({ filament }) => {
    const f = filament as Partial<Filament> & { id?: string }
    return f.id ? S.updateFilament(f.id, f) : S.createFilament(f)
  },
  delete_filament: async ({ id }) => {
    await S.deleteFilament(id)
    return { remaining: app.filaments.length, selected: app.filamentId }
  },
  update_machine: async ({ patch }) => {
    const p = S.updateMachine(patch as Partial<MachineSettings>)
    S.flushMachine()
    return plain(await p)
  },
  set_preferences: async ({ patch }) => {
    const { theme, fileNamePattern, ...rest } = patch as Partial<Prefs>
    if (theme) await S.setTheme(theme)
    if (fileNamePattern !== undefined) {
      const p = S.setFileNamePattern(fileNamePattern)
      S.flushPrefs()
      await p
    }
    if (Object.keys(rest).length) app.prefs = await api.savePrefs(rest)
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
  get_preview_info: async () => {
    await P.openPreview()
    return plain(P.getPreviewInfo())
  },
  set_layer_range: async ({ min, max }) => {
    await P.openPreview()
    const info = P.getPreviewInfo() as unknown as { layerCount?: number; range?: [number, number] }
    const lo = min !== undefined ? min - 1 : (info.range?.[0] ?? 0)
    const hi = max !== undefined ? max - 1 : (info.range?.[1] ?? (info.layerCount ?? 1) - 1)
    const [a, b] = P.setLayerRange(lo, hi)
    return { min: a + 1, max: b + 1 }
  },
  set_feature_visible: async ({ feature, visible }) => {
    await P.openPreview()
    P.setFeatureVisible(feature, visible)
    return plain(P.getPreviewInfo())
  },

  // ---- output
  save_to_sd: async ({ driveRoot, fileName }) => ({ path: await O.saveToCard(driveRoot, fileName) }),
  save_gcode: async ({ path }) => {
    const r = app.slice.result
    if (!r || app.slice.status !== 'done') throw new Error('Slice first (the last slice is missing or out of date).')
    const saved = await api.saveGcodeTo(r.id, path)
    await recordJob(saved.path, await O.thumbnail())
    return saved
  },

  // ---- history
  reprint: async ({ id }) => {
    await reprint(id)
    return { objects: V.listObjects(), settings: settingsSummary(app.settings) }
  },
  set_actual_time: async ({ id, seconds }) => {
    const entry = await O.setActualTime(id, seconds)
    return { id: entry.id, actualSeconds: entry.actualSeconds, ...O.timeFactorInfo() }
  },
  delete_job: async ({ id }) => {
    await O.deleteJob(id)
    return { remaining: app.history.length }
  },
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
