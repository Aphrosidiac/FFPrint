// The whole renderer <-> main surface. Main implements `Api` in src/main/ipc.ts; the renderer calls it
// through the typed proxy in src/renderer/src/lib/api.ts. Arguments and results must survive
// structured clone (no Vue proxies, no class instances; typed arrays are fine).

import type {
  Drive,
  Filament,
  HistoryEntry,
  LoadedFile,
  MachineSettings,
  Prefs,
  PrintSettings,
  ProjectScene,
  Setup,
  SliceRequest,
  SliceResult
} from './types'

export interface Api {
  // files
  openModelDialog(): Promise<LoadedFile[]>
  readFiles(paths: string[]): Promise<LoadedFile[]>
  saveProjectDialog(project: ProjectScene, models: { file: string; bytes: Uint8Array }[], suggestedName: string): Promise<string | null>
  openProject(path: string): Promise<{ project: ProjectScene; models: { file: string; bytes: Uint8Array }[] }>
  recentFiles(): Promise<string[]>
  /** No dialog: write the project to an absolute path (automation). */
  saveProjectTo(path: string, project: ProjectScene, models: { file: string; bytes: Uint8Array }[]): Promise<string>

  // engine
  slice(req: SliceRequest): Promise<SliceResult>
  cancelSlice(): Promise<void>
  readGcode(path: string): Promise<string>
  engineStatus(): Promise<{ ok: boolean; version: string; path: string; error?: string }>

  // output
  listDrives(): Promise<Drive[]>
  saveToDrive(sliceId: string, driveRoot: string, fileName: string): Promise<{ path: string }>
  saveGcodeAs(sliceId: string, fileName: string): Promise<{ path: string } | null>
  /** No dialog: copy the G-code to an absolute path (automation). */
  saveGcodeTo(sliceId: string, path: string): Promise<{ path: string }>
  ejectDrive(driveRoot: string): Promise<{ ok: boolean; message?: string }>

  // library + settings
  getFilaments(): Promise<Filament[]>
  saveFilament(f: Filament): Promise<Filament[]>
  deleteFilament(id: string): Promise<Filament[]>
  getSetups(): Promise<Setup[]>
  saveSetup(setup: Setup): Promise<Setup[]>
  deleteSetup(id: string): Promise<Setup[]>
  getMachine(): Promise<MachineSettings>
  saveMachine(m: MachineSettings): Promise<MachineSettings>
  getPrefs(): Promise<Prefs>
  savePrefs(p: Partial<Prefs>): Promise<Prefs>
  getLastSettings(): Promise<PrintSettings | null>
  saveLastSettings(s: PrintSettings): Promise<void>

  // history
  getHistory(): Promise<HistoryEntry[]>
  addHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt' | 'projectPath'>, project: ProjectScene, models: { file: string; bytes: Uint8Array }[]): Promise<HistoryEntry[]>
  setActualTime(id: string, seconds: number | null): Promise<{ history: HistoryEntry[]; machine: MachineSettings }>
  deleteHistory(id: string): Promise<HistoryEntry[]>
  openHistoryProject(id: string): Promise<{ project: ProjectScene; models: { file: string; bytes: Uint8Array }[] }>

  // automation
  automationStatus(): Promise<{ enabled: boolean; running: boolean; port: number; url: string; token: string; command: string }>

  // window
  setTitleBarColors(color: string, symbolColor: string): Promise<void>
  showItemInFolder(path: string): Promise<void>
}

export type ApiName = keyof Api

/** Events main pushes to the renderer. */
export interface Events {
  /** Files the OS asked us to open (double-click, second instance, drag onto the taskbar icon) */
  'open-files': string[]
  /** Removable drives changed (card inserted/removed) */
  'drives-changed': null
}

export type EventName = keyof Events
