// The only bridge into the renderer: invoke(name, args), onEvent(fn), and pathForFile for drops.
import { contextBridge, ipcRenderer, webUtils } from 'electron'

type Listener = (name: string, payload: unknown) => void
const listeners = new Set<Listener>()
ipcRenderer.on('ffprint:event', (_e, name: string, payload: unknown) => {
  for (const l of listeners) l(name, payload)
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
  pathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('ffprint', bridge)

export type FFPrintBridge = typeof bridge
