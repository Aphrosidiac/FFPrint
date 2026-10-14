// The only bridge into the renderer: invoke(name, args), onEvent(fn), and pathForFile for drops.
import { contextBridge, ipcRenderer, webUtils } from 'electron'

type Listener = (name: string, payload: unknown) => void
const listeners = new Set<Listener>()
ipcRenderer.on('ffprint:event', (_e, name: string, payload: unknown) => {
  for (const l of listeners) l(name, payload)
})

type AutomationHandler = (command: string, args: unknown) => Promise<unknown>
let automationHandler: AutomationHandler | null = null
ipcRenderer.on('ffprint:automation', async (_e, msg: { id: string; command: string; args: unknown }) => {
  try {
    if (!automationHandler) throw new Error('The window is still starting; try again in a moment.')
    const result = await automationHandler(msg.command, msg.args)
    ipcRenderer.send('ffprint:automation-reply', { id: msg.id, ok: true, result })
  } catch (e) {
    ipcRenderer.send('ffprint:automation-reply', { id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) })
  }
})

const bridge = {
  platform: process.platform,
  invoke: (name: string, args: unknown[]) => ipcRenderer.invoke('ffprint:invoke', name, args),
  onEvent: (fn: Listener) => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  /** absolute path of a file dropped from Explorer / Finder */
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  /** The renderer's automation dispatcher (src/renderer/src/automation.ts) registers itself here. */
  onAutomation: (fn: AutomationHandler) => {
    automationHandler = fn
  }
}

contextBridge.exposeInMainWorld('ffprint', bridge)

export type FFPrintBridge = typeof bridge
