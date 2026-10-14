// Real slicing progress. On Windows the OrcaSlicer CLI has no progress channel (its --pipe option is
// Linux-only), but at trace level (--debug 5) it logs every status update to --logfile:
//   default_status_callback: percent=15, warning_step=-1, message=Generating walls, ...
//   ... message=Generating G-code: layer 168, ...
// We tail that file while the engine runs. Trace level matters: at debug level the file is written in
// 4 KB blocks and the early stages only show up seconds late. Stage percents run 5..80; G-code
// writing (80..100) is spread by layer number against the expected layer count.

import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'

export interface SliceProgress {
  /** 0..100 */
  percent: number
  stage: string
}

const STAGES: [RegExp, string][] = [
  [/^Slicing mesh/i, 'Slicing the model'],
  [/^Generating walls/i, 'Walls'],
  [/^Generating infill regions/i, 'Infill areas'],
  [/^Generating infill toolpath/i, 'Infill'],
  [/^Detect overhangs/i, 'Overhangs'],
  [/^Checking support necessity/i, 'Checking supports'],
  [/^Generating support/i, 'Supports'],
  [/^Generating skirt/i, 'Skirt and brim'],
  [/^Optimizing toolpath/i, 'Optimising paths'],
  [/^Generating G-code$/i, 'Writing G-code']
]

const LINE = /percent=(\d+), warning_step=(-?\d+), message=(.*?), message_type=/g

export function tailProgress(logFile: string, expectedLayers: number, onProgress: (p: SliceProgress) => void): () => void {
  let offset = 0
  let carry = ''
  let best = 0
  let stage = 'Preparing the model'
  const emit = (percent: number, s: string): void => {
    // never go backwards: stages repeat once per object
    if (percent < best && s === stage) return
    best = Math.max(best, Math.min(99, percent))
    stage = s
    onProgress({ percent: Math.round(best), stage })
  }
  emit(1, stage)
  const poll = (): void => {
    if (!existsSync(logFile)) return
    let fd: number | undefined
    try {
      const size = statSync(logFile).size
      if (size <= offset) return
      fd = openSync(logFile, 'r')
      const buf = Buffer.alloc(Math.min(size - offset, 4 * 1024 * 1024))
      const n = readSync(fd, buf, 0, buf.length, offset)
      offset += n
      const text = carry + buf.toString('utf8', 0, n)
      const cut = text.lastIndexOf('\n')
      carry = cut >= 0 ? text.slice(cut + 1) : text
      const complete = cut >= 0 ? text.slice(0, cut) : ''
      let last: { percent: number; message: string } | null = null
      for (const m of complete.matchAll(LINE)) if (m[2] === '-1') last = { percent: Number(m[1]), message: m[3] }
      if (!last) return
      const layer = last.message.match(/^Generating G-code: layer (\d+)/i)
      if (layer) {
        const n = Number(layer[1])
        const total = Math.max(expectedLayers, n, 1)
        emit(80 + 19 * (n / total), `Writing G-code · layer ${n} of ${Math.max(total, n)}`)
        return
      }
      const label = STAGES.find(([re]) => re.test(last!.message))?.[1] ?? last.message
      emit(last.percent, label)
    } catch {
      // the engine may be mid-write; try again next tick
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }
  const timer = setInterval(poll, 150)
  return () => {
    clearInterval(timer)
    poll()
  }
}

/** Expected layer count: tallest instance in the scene against first-layer and layer heights. */
export function expectedLayers(scene: { meshes: { id: string; positions: Float32Array }[]; instances: { meshId: string; matrix: number[] }[] }, layerHeight: number, firstLayer: number): number {
  let maxZ = 0
  const byId = new Map(scene.meshes.map((m) => [m.id, m.positions]))
  for (const inst of scene.instances) {
    const p = byId.get(inst.meshId)
    if (!p) continue
    const e = inst.matrix
    // z' = row 2 of the column-major matrix; sampling every vertex keeps this exact and it runs once
    for (let i = 0; i < p.length; i += 3) {
      const z = e[2] * p[i] + e[6] * p[i + 1] + e[10] * p[i + 2] + e[14]
      if (z > maxZ) maxZ = z
    }
  }
  if (maxZ <= firstLayer) return 1
  return 1 + Math.ceil((maxZ - firstLayer) / layerHeight)
}
