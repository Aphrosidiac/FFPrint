// Preview state that outlives the PreviewView component (it unmounts in Prepare mode): the parsed
// toolpaths of the current slice, the layer range and which feature types are shown. The parsed
// buffers are kept outside Vue reactivity (they can be hundreds of MB of typed arrays).

import { markRaw, reactive } from 'vue'
import type { SliceResult } from '@shared/types'
import { api, errorText } from '@/lib/api'
import type { LayerInfo, ParsedGcode } from './gcodeParse'
import type { WorkerIn, WorkerOut } from './gcodeWorker'
import { featureStyle } from './palette'

export interface LegendRow {
  type: string
  label: string
  color: string
  time: number
  length: number
  share: number
}

export const preview = reactive({
  status: 'empty' as 'empty' | 'loading' | 'ready' | 'error',
  /** 0..1 while loading */
  progress: 0,
  phase: '' as '' | 'reading' | 'parsing',
  error: '',
  resultId: '',
  /** bumps when new buffers are ready */
  revision: 0,
  layers: markRaw([]) as LayerInfo[],
  range: [0, 0] as [number, number],
  hidden: {} as Record<string, boolean>,
  travel: false,
  legend: [] as LegendRow[],
  /** camera preset; PreviewView applies it (also when it mounts later) */
  view: 'iso' as 'iso' | 'top' | 'front',
  /** bumps for every view/fit request so repeating the same preset re-frames */
  viewSeq: 0,
  fitSeq: 0,
  timings: { readMs: 0, parseMs: 0, workerMs: 0, bytes: 0, segments: 0 }
})

let parsed: ParsedGcode | null = null
export const currentParse = (): ParsedGcode | null => parsed

let worker: Worker | null = null
let seq = 0

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('./gcodeWorker.ts', import.meta.url), { type: 'module' })
  return worker
}

function parseInWorker(text: string, onProgress: (f: number) => void): Promise<ParsedGcode> {
  const id = ++seq
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerOut>): void => {
      const m = e.data
      if (m.id !== id) return
      if (m.kind === 'progress') return onProgress(m.fraction)
      w.removeEventListener('message', onMessage)
      if (m.kind === 'done') resolve(m.result)
      else reject(new Error(m.message))
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, text } satisfies WorkerIn)
  })
}

export const lastLayer = (): number => Math.max(0, preview.layers.length - 1)

/** Load (or reuse) the toolpaths of a slice result. */
export async function loadPreview(result: SliceResult): Promise<void> {
  if (preview.resultId === result.id && (preview.status === 'ready' || preview.status === 'loading')) return
  preview.resultId = result.id
  preview.status = 'loading'
  preview.phase = 'reading'
  preview.progress = 0
  preview.error = ''
  try {
    const t0 = performance.now()
    const text = await api.readGcode(result.gcodePath)
    const t1 = performance.now()
    if (preview.resultId !== result.id) return
    preview.phase = 'parsing'
    const p = await parseInWorker(text, (f) => {
      if (preview.resultId === result.id) preview.progress = f
    })
    const t2 = performance.now()
    if (preview.resultId !== result.id) return
    parsed = p
    const totalTime = p.features.reduce((s, f) => s + f.time, 0) || 1
    preview.legend = p.features
      .map((f) => {
        const st = featureStyle(f.type)
        return { type: f.type, label: st.label, color: st.color, time: f.time, length: f.length, share: f.time / totalTime, order: st.order }
      })
      .sort((a, b) => a.order - b.order)
      .map(({ order: _o, ...row }) => row)
    preview.layers = markRaw(p.layers)
    preview.range = [0, Math.max(0, p.layers.length - 1)]
    preview.timings = {
      readMs: Math.round(t1 - t0),
      parseMs: Math.round(p.parseMs),
      workerMs: Math.round(t2 - t1),
      bytes: text.length,
      segments: p.features.reduce((s, f) => s + f.count, 0)
    }
    preview.status = 'ready'
    preview.revision++
  } catch (e) {
    if (preview.resultId !== result.id) return
    preview.status = 'error'
    preview.error = errorText(e)
  }
}

export function isFeatureVisible(type: string): boolean {
  return !preview.hidden[type]
}
