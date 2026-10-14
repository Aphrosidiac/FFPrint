// Parses G-code off the main thread and transfers the toolpath buffers back (no copies).
import { parseGcode, transferables, type ParsedGcode } from './gcodeParse'

export type WorkerIn = { id: number; text: string }
export type WorkerOut =
  | { id: number; kind: 'progress'; fraction: number }
  | { id: number; kind: 'done'; result: ParsedGcode }
  | { id: number; kind: 'error'; message: string }

const ctx = self as unknown as { postMessage: (m: WorkerOut, transfer?: Transferable[]) => void; onmessage: ((e: MessageEvent<WorkerIn>) => void) | null }

ctx.onmessage = (e) => {
  const { id, text } = e.data
  try {
    const result = parseGcode(text, { onProgress: (fraction) => ctx.postMessage({ id, kind: 'progress', fraction }) })
    ctx.postMessage({ id, kind: 'done', result }, transferables(result))
  } catch (err) {
    ctx.postMessage({ id, kind: 'error', message: (err as Error).message })
  }
}
