// Main-side implementation of the Api contract. One channel: 'ffprint:invoke' (name, args[]).

import { readFileSync } from 'node:fs'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { Api } from '@shared/contract'
import { safeFileName } from './engine/gcode'
import { engine, ENGINE_VERSION } from './engine/paths'
import { cancelSlice, getSlice, slice } from './engine/slice'
import * as files from './files'
import * as history from './history'
import * as lib from './library'
import * as past from './pastModels'
import * as sd from './sd'
import { automationStatus } from './automation/server'

function sliceOrThrow(id: string): NonNullable<ReturnType<typeof getSlice>> {
  const r = getSlice(id)
  if (!r) throw new Error('That slice is gone. Slice again.')
  return r
}

export function createApi(win: () => BrowserWindow | null): Api {
  return {
    openModelDialog: () => files.openModelDialog(win()),
    readFiles: async (paths) => files.readFiles(paths),
    saveProjectDialog: (project, models, name) => files.saveProjectDialog(win(), project, models, name),
    openProject: async (path) => files.openProject(path),
    recentFiles: async () => lib.getPrefs().recent,
    listPastModels: async () => past.listPastModels(),
    hidePastModel: async (m) => past.hidePastModel(m),
    saveModelThumbnail: async (path, dataUrl) => past.saveModelThumbnail(path, dataUrl),
    readModelBytes: async (path) => past.readModelBytes(path),
    saveProjectTo: async (path, project, models) => files.saveProjectTo(path, project, models),

    slice: async (req) => {
      const filament = lib.getFilaments().find((f) => f.id === req.filamentId) ?? lib.getFilaments()[0]
      return slice(req, filament, lib.getMachine(), lib.getPrefs().fileNamePattern, (p) => win()?.webContents.send('ffprint:event', 'slice-progress', p))
    },
    cancelSlice: async () => cancelSlice(),
    readGcode: async (path) => readFileSync(path, 'utf8'),
    engineStatus: async () => ({ ok: engine.present, version: ENGINE_VERSION, path: engine.dir, error: engine.present ? undefined : 'Engine not found' }),

    listDrives: async () => {
      sd.setVolumeHint(lib.getPrefs().sdVolumeHint)
      return sd.listDrives()
    },
    saveToDrive: async (sliceId, driveRoot, fileName) => {
      const path = sd.saveToDrive(sliceOrThrow(sliceId).gcodePath, driveRoot, fileName)
      const drive = (await sd.listDrives()).find((d) => d.root === driveRoot)
      if (drive?.label) lib.savePrefs({ sdVolumeHint: drive.label })
      return { path }
    },
    saveGcodeAs: async (sliceId, fileName) => {
      const r = sliceOrThrow(sliceId)
      const w = win()
      const opts = { title: 'Save G-code', defaultPath: safeFileName(fileName), filters: [{ name: 'G-code', extensions: ['gcode'] }] }
      const res = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
      if (res.canceled || !res.filePath) return null
      return { path: sd.writeVerified(r.gcodePath, res.filePath, 'file') }
    },
    saveGcodeTo: async (sliceId, path) => {
      const target = /\.gcode$/i.test(path) ? path : `${path}.gcode`
      return { path: sd.writeVerified(sliceOrThrow(sliceId).gcodePath, target, 'file') }
    },
    ejectDrive: (root) => sd.ejectDrive(root),
    automationStatus: async () => automationStatus(),

    getFilaments: async () => lib.getFilaments(),
    saveFilament: async (f) => lib.saveFilament(f),
    deleteFilament: async (id) => lib.deleteFilament(id),
    getSetups: async () => lib.getSetups(),
    saveSetup: async (s) => lib.saveSetup(s),
    deleteSetup: async (id) => lib.deleteSetup(id),
    getMachine: async () => lib.getMachine(),
    saveMachine: async (m) => lib.saveMachine(m),
    getPrefs: async () => lib.getPrefs(),
    savePrefs: async (p) => lib.savePrefs(p),
    getLastSettings: async () => lib.getLastSettings(),
    saveLastSettings: async (s) => lib.saveLastSettings(s),

    getHistory: async () => history.getHistory(),
    addHistory: async (entry, project, models) => history.addHistory(entry, project, models),
    setActualTime: async (id, seconds) => history.setActualTime(id, seconds),
    deleteHistory: async (id) => history.deleteHistory(id),
    openHistoryProject: async (id) => history.openHistoryProject(id),

    setTitleBarColors: async (color, symbolColor) => {
      const w = win()
      if (w && process.platform === 'win32') w.setTitleBarOverlay({ color, symbolColor, height: 40 })
    },
    showItemInFolder: async (path) => shell.showItemInFolder(path)
  }
}

export function setupIpc(api: Api): void {
  ipcMain.handle('ffprint:invoke', async (_e, name: keyof Api, args: unknown[]) => {
    const fn = api[name] as ((...a: unknown[]) => Promise<unknown>) | undefined
    if (!fn) throw new Error(`Unknown command: ${String(name)}`)
    return fn(...(args ?? []))
  })
}
