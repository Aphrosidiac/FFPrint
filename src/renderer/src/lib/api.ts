// Typed proxy over the preload bridge: `api.slice(req)` -> main's Api.slice(req).
import { toRaw } from 'vue'
import type { Api, EventName, Events } from '@shared/contract'

interface Bridge {
  platform: string
  invoke: (name: string, args: unknown[]) => Promise<unknown>
  onEvent: (fn: (name: string, payload: unknown) => void) => () => void
  pathForFile: (file: File) => string
  onAutomation: (fn: (command: string, args: unknown) => Promise<unknown>) => void
}

declare global {
  interface Window {
    ffprint: Bridge
  }
}

/** Vue proxies cannot cross IPC (structured clone); unwrap deeply but keep typed arrays intact. */
function plain(v: unknown): unknown {
  const raw = toRaw(v as object) as unknown
  if (raw === null || typeof raw !== 'object') return raw
  if (ArrayBuffer.isView(raw) || raw instanceof ArrayBuffer) return raw
  if (Array.isArray(raw)) return raw.map(plain)
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) out[k] = plain(val)
  return out
}

export const api = new Proxy({} as Api, {
  get: (_t, name: string) => (...args: unknown[]) => window.ffprint.invoke(name, args.map(plain))
})

export function onEvent<E extends EventName>(name: E, fn: (payload: Events[E]) => void): () => void {
  return window.ffprint.onEvent((n, p) => {
    if (n === name) fn(p as Events[E])
  })
}

export const platform = (): string => window.ffprint?.platform ?? 'web'
export const pathForFile = (f: File): string => window.ffprint.pathForFile(f)

/** Error message without Electron's "Error invoking remote method 'x': Error:" prefix. */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
