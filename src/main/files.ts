// Opening model files and .ffprint projects (a zip of scene.json + the model files).

import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { LoadedFile, ProjectScene } from '@shared/types'
import { addRecent } from './library'

const EXTS = ['stl', 'obj', '3mf', 'ffprint'] as const

export function readFiles(paths: string[]): LoadedFile[] {
  const out: LoadedFile[] = []
  for (const path of paths) {
    const ext = extname(path).slice(1).toLowerCase()
    if (!(EXTS as readonly string[]).includes(ext)) throw new Error(`${basename(path)} is not a model FF Print can open (STL, OBJ, 3MF or .ffprint).`)
    out.push({ path, name: basename(path, extname(path)), ext: ext as LoadedFile['ext'], bytes: new Uint8Array(readFileSync(path)) })
  }
  addRecent(paths)
  return out
}

export async function openModelDialog(win: BrowserWindow | null): Promise<LoadedFile[]> {
  const opts = {
    title: 'Open models',
    properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
    filters: [
      { name: 'Models and projects', extensions: [...EXTS] },
      { name: 'All files', extensions: ['*'] }
    ]
  }
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return r.canceled ? [] : readFiles(r.filePaths)
}

export function packProject(project: ProjectScene, models: { file: string; bytes: Uint8Array }[]): Uint8Array {
  const files: Record<string, Uint8Array> = { 'scene.json': strToU8(JSON.stringify(project, null, 2)) }
  for (const m of models) files[`models/${m.file}`] = m.bytes
  return zipSync(files, { level: 6 })
}

export function unpackProject(bytes: Uint8Array): { project: ProjectScene; models: { file: string; bytes: Uint8Array }[] } {
  const files = unzipSync(bytes)
  const scene = files['scene.json']
  if (!scene) throw new Error('This is not an FF Print project (scene.json is missing).')
  const project = JSON.parse(strFromU8(scene)) as ProjectScene
  if (project.version !== 1) throw new Error('This project was made by a newer FF Print.')
  const models = Object.entries(files)
    .filter(([k]) => k.startsWith('models/') && k.length > 7)
    .map(([k, v]) => ({ file: k.slice(7), bytes: v }))
  return { project, models }
}

export function openProject(path: string): ReturnType<typeof unpackProject> {
  const r = unpackProject(new Uint8Array(readFileSync(path)))
  addRecent([path])
  return r
}

export async function saveProjectDialog(
  win: BrowserWindow | null,
  project: ProjectScene,
  models: { file: string; bytes: Uint8Array }[],
  suggestedName: string
): Promise<string | null> {
  const opts = { title: 'Save project', defaultPath: `${suggestedName || 'project'}.ffprint`, filters: [{ name: 'FF Print project', extensions: ['ffprint'] }] }
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (r.canceled || !r.filePath) return null
  writeFileSync(r.filePath, packProject(project, models))
  addRecent([r.filePath])
  return r.filePath
}
