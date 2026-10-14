// App-wide state: library data, the current print settings, the slice and its result, SD drives,
// and toasts. Components read `app` and call the actions below; nothing else talks to main.

import { reactive, watch } from 'vue'
import { QUALITIES, defaultPrintSettings, qualityFits, settingsSummary } from '@shared/settings'
import type { Drive, Filament, HistoryEntry, LoadedFile, MachineSettings, Prefs, PrintSettings, Setup, SliceResult } from '@shared/types'
import { api, errorText, onEvent } from '@/lib/api'
import { arrange } from '@/lib/arrange'
import { designerIntent } from '@/lib/designer'
import { parseFile, parseModel } from '@/lib/loaders'
import { addMesh, addObject, clearScene, dropToBed, fromMatrix, issues, scene, select, toProject, toScenePayload, type SceneObject } from './scene'

export type Mode = 'prepare' | 'preview'
export type Page = 'workspace' | 'filaments' | 'machine' | 'history'
export type SliceStatus = 'idle' | 'slicing' | 'done' | 'stale' | 'error'

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  text: string
  action?: { label: string; run: () => void }
}

export const app = reactive({
  ready: false,
  page: 'workspace' as Page,
  mode: 'prepare' as Mode,
  filaments: [] as Filament[],
  setups: [] as Setup[],
  machine: null as MachineSettings | null,
  prefs: null as Prefs | null,
  history: [] as HistoryEntry[],
  settings: defaultPrintSettings() as PrintSettings,
  filamentId: '',
  slice: { status: 'idle' as SliceStatus, result: null as SliceResult | null, error: '' },
  drives: [] as Drive[],
  engine: { ok: true, error: '' },
  toasts: [] as Toast[],
  busy: '' as string
})

let toastSeq = 0
export function toast(kind: Toast['kind'], text: string, action?: Toast['action']): void {
  if (app.toasts.some((t) => t.text === text)) return
  const id = ++toastSeq
  app.toasts.push({ id, kind, text, action })
  setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4500)
}
export function dismissToast(id: number): void {
  app.toasts = app.toasts.filter((t) => t.id !== id)
}

export function currentFilament(): Filament | undefined {
  return app.filaments.find((f) => f.id === app.filamentId) ?? app.filaments[0]
}

export async function init(): Promise<void> {
  const [filaments, setups, machine, prefs, last, history, engine] = await Promise.all([
    api.getFilaments(),
    api.getSetups(),
    api.getMachine(),
    api.getPrefs(),
    api.getLastSettings(),
    api.getHistory(),
    api.engineStatus()
  ])
  app.filaments = filaments
  app.setups = setups
  app.machine = machine
  app.prefs = prefs
  app.history = history
  app.engine = { ok: engine.ok, error: engine.error ?? '' }
  if (last) app.settings = { ...defaultPrintSettings(), ...last }
  app.filamentId = filaments.some((f) => f.id === prefs.lastFilamentId) ? prefs.lastFilamentId : filaments[0]?.id ?? ''
  app.ready = true
  refreshDrives()

  onEvent('drives-changed', () => refreshDrives())
  onEvent('open-files', (paths) => openPaths(paths))

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => app.settings,
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => api.saveLastSettings(app.settings), 400)
    },
    { deep: true }
  )
  watch(
    () => app.filamentId,
    (id) => api.savePrefs({ lastFilamentId: id })
  )
  // Any change after a slice makes the result stale (it is kept so the preview still shows it).
  // timeFactor only changes the shown estimate, not the G-code, so it does not make a slice stale.
  watch([() => scene.revision, () => app.settings, () => app.filamentId, () => (app.machine ? { ...app.machine, timeFactor: 1 } : null)], () => {
    if (app.slice.status === 'done') app.slice.status = 'stale'
  }, { deep: true })
}

export async function refreshDrives(): Promise<void> {
  try {
    app.drives = await api.listDrives()
  } catch {
    app.drives = []
  }
}

// ---------------------------------------------------------------- files

export async function addLoadedFiles(files: LoadedFile[]): Promise<void> {
  const added: SceneObject[] = []
  const bedWasEmpty = scene.objects.length === 0
  let intent: { name: string; patch: Partial<PrintSettings>; notes: string[] } | null = null
  for (const f of files) {
    if (f.ext === 'ffprint') {
      await loadProject(() => api.openProject(f.path))
      continue
    }
    try {
      const parsed = parseFile(f)
      for (const model of parsed.models) {
        const mesh = addMesh(model.name, model.geometry)
        added.push(addObject(mesh.id, model.name))
      }
      if (parsed.projectSettings && !intent) {
        const d = designerIntent(parsed.projectSettings, app.settings)
        if (d) intent = { name: f.name, ...d }
      }
    } catch (e) {
      toast('error', `Could not open ${f.name}: ${errorText(e)}`)
    }
  }
  if (!added.length) return
  // Place the new objects around what is already on the bed.
  const fits = arrange(scene.objects)
  select(added.map((o) => o.id))
  app.mode = 'prepare'
  if (!fits) toast('info', 'Not everything fits on the bed. Objects in red are outside the printable area.')
  for (const o of added) if (o.position.z !== 0) dropToBed(o)
  // A project's own print settings (the designer's intent) apply when it starts a fresh bed.
  if (intent && bedWasEmpty) {
    const before = JSON.parse(JSON.stringify(app.settings)) as PrintSettings
    app.settings = { ...app.settings, ...intent.patch }
    toast('info', `Using ${intent.name}'s recommended settings: ${intent.notes.join(', ')}.`, {
      label: 'Undo',
      run: () => {
        app.settings = before
      }
    })
  }
}

export async function openDialog(): Promise<void> {
  try {
    await addLoadedFiles(await api.openModelDialog())
  } catch (e) {
    toast('error', errorText(e))
  }
}

export async function openPaths(paths: string[]): Promise<void> {
  try {
    await addLoadedFiles(await api.readFiles(paths))
  } catch (e) {
    toast('error', errorText(e))
  }
}

async function loadProject(load: () => Promise<{ project: import('@shared/types').ProjectScene; models: { file: string; bytes: Uint8Array }[] }>): Promise<void> {
  const { project, models } = await load()
  clearScene()
  const meshByFile = new Map<string, string>()
  for (const m of models) {
    const [parsed] = parseModel({ path: m.file, name: m.file.replace(/^\d+_/, '').replace(/\.stl$/i, ''), ext: 'stl', bytes: m.bytes })
    meshByFile.set(m.file, addMesh(parsed.name, parsed.geometry).id)
  }
  for (const o of project.objects) {
    const meshId = meshByFile.get(o.file)
    if (!meshId) continue
    const obj = addObject(meshId, o.name)
    Object.assign(obj, fromMatrix(o.matrix))
  }
  app.settings = { ...defaultPrintSettings(), ...project.settings }
  if (app.filaments.some((f) => f.id === project.filamentId)) app.filamentId = project.filamentId
  app.slice = { status: 'idle', result: null, error: '' }
  app.mode = 'prepare'
  app.page = 'workspace'
}

export async function reprint(historyId: string): Promise<void> {
  try {
    await loadProject(() => api.openHistoryProject(historyId))
    toast('info', 'Job reopened with its original settings.')
  } catch (e) {
    toast('error', errorText(e))
  }
}

export async function saveProject(): Promise<void> {
  if (!scene.objects.length) return
  const { project, models } = toProject(app.settings, app.filamentId)
  try {
    const path = await api.saveProjectDialog(project, models, scene.objects[0].name)
    if (path) toast('success', 'Project saved.', { label: 'Show', run: () => api.showItemInFolder(path) })
  } catch (e) {
    toast('error', errorText(e))
  }
}

// ---------------------------------------------------------------- slicing

export function blockingIssues(): string[] {
  const out: string[] = []
  const visible = scene.objects.filter((o) => o.visible)
  if (!visible.length) out.push('Add a model to the bed.')
  if (app.machine && !qualityFits(app.settings.quality, app.machine.nozzle)) out.push(`${QUALITIES.find((q) => q.id === app.settings.quality)?.label} layers are too thick for the ${app.machine.nozzle} mm nozzle. Pick a finer quality.`)
  for (const o of visible) {
    const list = issues(o).filter((i) => i !== 'purge-zone')
    if (list.length) out.push(`${o.name}: ${list.includes('outside') ? 'outside the bed' : list.includes('too-tall') ? 'too tall' : 'below the bed'}`)
  }
  return out
}

export async function runSlice(): Promise<void> {
  const problems = blockingIssues()
  if (problems.length) {
    app.slice = { status: 'error', result: app.slice.result, error: problems.join(' · ') }
    return
  }
  app.slice.status = 'slicing'
  app.slice.error = ''
  try {
    const result = await api.slice({ scene: toScenePayload(), settings: app.settings, filamentId: app.filamentId, jobName: jobName() })
    app.slice = { status: 'done', result, error: '' }
    app.mode = 'preview'
  } catch (e) {
    const msg = errorText(e)
    if (/cancelled/i.test(msg)) app.slice = { status: app.slice.result ? 'stale' : 'idle', result: app.slice.result, error: '' }
    else app.slice = { status: 'error', result: app.slice.result, error: msg }
  }
}

export async function cancelSlice(): Promise<void> {
  await api.cancelSlice()
}

export function jobName(): string {
  const visible = scene.objects.filter((o) => o.visible)
  const base = visible[0]?.name ?? 'print'
  const names = new Set(visible.map((o) => o.name))
  return names.size > 1 ? `${base}_and_${names.size - 1}_more` : base
}

/** Records a saved job in history (with a project copy for Reprint). */
export async function recordJob(savedTo: string, thumbnail: string): Promise<void> {
  const r = app.slice.result
  const f = currentFilament()
  if (!r || !f) return
  const { project, models } = toProject(app.settings, app.filamentId)
  app.history = await api.addHistory(
    { jobName: jobName(), fileName: r.fileName, savedTo, stats: r.stats, settings: JSON.parse(JSON.stringify(app.settings)), filamentId: f.id, filamentName: f.name, thumbnail, actualSeconds: null },
    project,
    models
  )
}

export function summary(): string {
  return settingsSummary(app.settings)
}
