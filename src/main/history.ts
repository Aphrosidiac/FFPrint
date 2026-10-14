// Every job saved to a card or file: stats, settings, thumbnail and a project copy for Reprint.
// Entering the real print time teaches FF Print how far off the engine's estimate is on this printer.

import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HistoryEntry, MachineSettings, ProjectScene } from '@shared/types'
import { packProject, unpackProject } from './files'
import { getMachine, saveMachine } from './library'
import { dataPaths, readDoc, writeDoc } from './store'

export function getHistory(): HistoryEntry[] {
  return readDoc<HistoryEntry[]>('history', () => [])
}

export function addHistory(
  entry: Omit<HistoryEntry, 'id' | 'createdAt' | 'projectPath'>,
  project: ProjectScene,
  models: { file: string; bytes: Uint8Array }[]
): HistoryEntry[] {
  const id = randomUUID()
  const projectPath = join(dataPaths.history, `${id}.ffprint`)
  writeFileSync(projectPath, packProject(project, models))
  const list = [{ ...entry, id, createdAt: new Date().toISOString(), projectPath }, ...getHistory()].slice(0, 200)
  return writeDoc('history', list)
}

export function deleteHistory(id: string): HistoryEntry[] {
  const list = getHistory()
  const hit = list.find((h) => h.id === id)
  if (hit) rmSync(hit.projectPath, { force: true })
  return writeDoc(
    'history',
    list.filter((h) => h.id !== id)
  )
}

export function openHistoryProject(id: string): ReturnType<typeof unpackProject> {
  const hit = getHistory().find((h) => h.id === id)
  if (!hit) throw new Error('That job is no longer in the history.')
  return unpackProject(new Uint8Array(readFileSync(hit.projectPath)))
}

/**
 * Time factor = median of actual / estimate over the last 10 jobs with a real time.
 * The median keeps one forgotten-to-stop timer from skewing every estimate.
 */
export function learnTimeFactor(history: HistoryEntry[]): number {
  const ratios = history
    .filter((h) => h.actualSeconds && h.stats.estimateSeconds > 0)
    .slice(0, 10)
    .map((h) => (h.actualSeconds as number) / h.stats.estimateSeconds)
    .filter((r) => r > 0.3 && r < 3)
    .sort((a, b) => a - b)
  if (!ratios.length) return 1
  const mid = Math.floor(ratios.length / 2)
  const median = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2
  return Math.round(median * 1000) / 1000
}

export function setActualTime(id: string, seconds: number | null): { history: HistoryEntry[]; machine: MachineSettings } {
  const list = getHistory().map((h) => (h.id === id ? { ...h, actualSeconds: seconds } : h))
  writeDoc('history', list)
  const machine = saveMachine({ ...getMachine(), timeFactor: learnTimeFactor(list) })
  return { history: list, machine }
}
