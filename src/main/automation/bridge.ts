// Main -> renderer command calls for automation. The renderer owns the scene, the current settings,
// the preview and the slice flow, so most automation tools run there (src/renderer/src/automation.ts).

import { randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain } from 'electron'

const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()

export function initAutomationBridge(): void {
  ipcMain.on('ffprint:automation-reply', (_e, msg: { id: string; ok: boolean; result?: unknown; error?: string }) => {
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    clearTimeout(p.timer)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.error ?? 'Command failed'))
  })
}

export function callRenderer(win: BrowserWindow | null, command: string, args: unknown, timeoutMs = 180_000): Promise<unknown> {
  if (!win || win.isDestroyed()) return Promise.reject(new Error('The FF Print window is not open.'))
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`"${command}" did not finish within ${Math.round(timeoutMs / 1000)} s.`))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    win.webContents.send('ffprint:automation', { id, command, args })
  })
}
