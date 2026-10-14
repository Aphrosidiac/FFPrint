import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import type { Events, EventName } from '@shared/contract'
import { initAutomationBridge } from './automation/bridge'
import { startAutomation } from './automation/server'
import { initEngineDir } from './engine/paths'
import { createApi, setupIpc } from './ipc'
import { getPrefs } from './library'
import { watchDrives } from './sd'
import { initStore } from './store'

// Dev keeps its data apart from the installed app; FFPRINT_DATA_DIR gives tests their own instance.
if (process.env.FFPRINT_DATA_DIR) app.setPath('userData', process.env.FFPRINT_DATA_DIR)
else if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'FF Print Dev'))
app.setAppUserModelId('studio.ffdev.ffprint')

let win: BrowserWindow | null = null
let pendingFiles: string[] = []

const modelArgs = (argv: string[]): string[] => argv.slice(1).filter((a) => /\.(stl|obj|3mf|ffprint)$/i.test(a) && existsSync(a))

function send<E extends EventName>(name: E, payload: Events[E]): void {
  win?.webContents.send('ffprint:event', name, payload)
}

function createWindow(): void {
  const dark = nativeTheme.shouldUseDarkColors
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'FF Print',
    backgroundColor: dark ? '#1c1d1f' : '#f4f4f5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? { color: dark ? '#1c1d1f' : '#ffffff', symbolColor: dark ? '#e4e4e7' : '#3f3f46', height: 40 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.on('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-finish-load', () => {
    if (pendingFiles.length) {
      send('open-files', pendingFiles)
      pendingFiles = []
    }
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => (win = null))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const files = modelArgs(argv)
    if (files.length) send('open-files', files)
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.on('open-file', (e, file) => {
    e.preventDefault()
    if (win) send('open-files', [file])
    else pendingFiles.push(file)
  })

  app.whenReady().then(() => {
    initStore(app.getPath('userData'))
    // out/main/index.js -> repo root; robust whether launched via electron-vite or the built script
    initEngineDir(join(__dirname, '..', '..'), process.resourcesPath, app.isPackaged)
    nativeTheme.themeSource = getPrefs().theme
    setupIpc(createApi(() => win))
    initAutomationBridge()
    pendingFiles.push(...modelArgs(process.argv))
    createWindow()
    watchDrives(() => send('drives-changed', null))
    startAutomation(() => win)
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
