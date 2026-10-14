// Output and history actions, UI-independent: the slice bar, the History page and the MCP bridge all
// call these. They throw on failure (callers decide how to report); state lives in `output` and `app`.

import { reactive } from 'vue'
import type { HistoryEntry } from '@shared/types'
import { api } from '@/lib/api'
import { app, recordJob, refreshDrives, reprint } from './app'

export { reprint }

export interface SavedState {
  resultId: string
  path: string
  /** drive root when it went to a removable drive, '' otherwise */
  drive: string
  eject: 'idle' | 'ejecting' | 'done' | 'error'
  ejectMessage: string
}

export const output = reactive({
  saving: false,
  saved: null as SavedState | null
})

// The viewport builder provides captureThumbnail(); the glob keeps this file building without it.
const captureModules = import.meta.glob<{ captureThumbnail?: () => string | Promise<string> }>('../viewport/capture.ts')

/** PNG data URL of the bed, or '' when the viewport cannot provide one. */
export async function thumbnail(): Promise<string> {
  try {
    const load = Object.values(captureModules)[0]
    if (!load) return ''
    const mod = await load()
    return (await mod.captureThumbnail?.()) ?? ''
  } catch {
    return ''
  }
}

function currentResult(): NonNullable<typeof app.slice.result> {
  const r = app.slice.result
  if (!r) throw new Error('Nothing is sliced yet. Slice first.')
  if (app.slice.status !== 'done') throw new Error('Settings changed since the last slice. Slice again before saving.')
  return r
}

async function afterSave(path: string, drive: string): Promise<void> {
  const r = app.slice.result
  if (!r) return
  output.saved = { resultId: r.id, path, drive, eject: 'idle', ejectMessage: '' }
  await recordJob(path, await thumbnail())
}

/** The likely printer card to use: the given root, else the first card found (drives refreshed if needed). */
export async function pickCard(driveRoot?: string): Promise<string> {
  if (!app.drives.some((d) => d.likelyPrinterCard)) await refreshDrives()
  if (driveRoot) {
    const bare = (r: string): string => r.toUpperCase().replace(/[:\\/]+$/, '')
    const want = bare(driveRoot)
    const d = app.drives.find((x) => bare(x.root) === want)
    if (!d) throw new Error(`Drive ${driveRoot} is not connected.`)
    return d.root
  }
  const card = app.drives.find((d) => d.likelyPrinterCard)
  if (!card) throw new Error("The printer's SD card is not inserted.")
  return card.root
}

/** Saves the current slice to the printer's SD card, records the job, returns the written path. */
export async function saveToCard(driveRoot?: string, fileName?: string): Promise<string> {
  const r = currentResult()
  if (output.saving) throw new Error('A save is already running.')
  output.saving = true
  try {
    const root = await pickCard(driveRoot)
    const { path } = await api.saveToDrive(r.id, root, fileName || r.fileName)
    await afterSave(path, root)
    return path
  } catch (e) {
    refreshDrives()
    throw e
  } finally {
    output.saving = false
  }
}

/** Save dialog for the current slice. Returns the path, or null when the dialog was cancelled. */
export async function saveAs(fileName?: string): Promise<string | null> {
  const r = currentResult()
  if (output.saving) throw new Error('A save is already running.')
  output.saving = true
  try {
    const res = await api.saveGcodeAs(r.id, fileName || r.fileName)
    if (!res) return null
    const drive = app.drives.find((d) => res.path.toUpperCase().startsWith(d.root.toUpperCase()))
    await afterSave(res.path, drive?.root ?? '')
    return res.path
  } finally {
    output.saving = false
  }
}

/** Ejects a card: the given root, else the card of the last save, else the first likely card. */
export async function ejectCard(driveRoot?: string): Promise<{ ok: boolean; message?: string }> {
  const root = driveRoot || output.saved?.drive || app.drives.find((d) => d.likelyPrinterCard)?.root
  if (!root) return { ok: false, message: 'No SD card to eject.' }
  const s = output.saved && output.saved.drive.toUpperCase() === root.toUpperCase() ? output.saved : null
  if (s) s.eject = 'ejecting'
  let res: { ok: boolean; message?: string }
  try {
    res = await api.ejectDrive(root)
  } catch (e) {
    res = { ok: false, message: (e as Error).message }
  }
  if (!res.ok && !res.message) res.message = 'Windows could not eject the card.'
  if (s) {
    s.eject = res.ok ? 'done' : 'error'
    s.ejectMessage = res.message ?? ''
  }
  refreshDrives()
  return res
}

// ---------------------------------------------------------------- history

function job(id: string): HistoryEntry {
  const h = app.history.find((x) => x.id === id)
  if (!h) throw new Error('That job is no longer in the history.')
  return h
}

/** Real print time in seconds (null clears it). Updates the history and the learned time factor. */
export async function setActualTime(id: string, seconds: number | null): Promise<HistoryEntry> {
  job(id)
  if (seconds !== null && !(seconds > 0)) throw new Error('The print time must be more than zero.')
  const res = await api.setActualTime(id, seconds === null ? null : Math.round(seconds))
  app.history = res.history
  app.machine = res.machine
  return job(id)
}

export async function deleteJob(id: string): Promise<void> {
  const h = job(id)
  app.history = await api.deleteHistory(id)
  // Without this job's real time the learned factor may change.
  if (h.actualSeconds) app.machine = await api.getMachine()
}

export async function showJobFile(id: string): Promise<void> {
  await api.showItemInFolder(job(id).savedTo)
}

/** Same rule as main's learnTimeFactor: the last 10 jobs with a real time, outliers dropped. */
export function timeFactorInfo(): { factor: number; prints: number } {
  const prints = app.history
    .filter((h) => h.actualSeconds && h.stats.estimateSeconds > 0)
    .slice(0, 10)
    .filter((h) => {
      const r = (h.actualSeconds as number) / h.stats.estimateSeconds
      return r > 0.3 && r < 3
    }).length
  return { factor: app.machine?.timeFactor ?? 1, prints }
}

// Test/automation handle (scripts/shot-output.mjs); the MCP bridge imports the functions directly.
;(window as unknown as { __ffOutput: unknown }).__ffOutput = { output, saveToCard, saveAs, ejectCard, pickCard, setActualTime, deleteJob, showJobFile, reprint, timeFactorInfo, thumbnail }
