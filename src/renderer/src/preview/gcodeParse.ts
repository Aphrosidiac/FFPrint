// G-code -> toolpath buffers for the preview. Pure (no DOM, no three.js) so it runs in a Web Worker and
// under vitest. Reads OrcaSlicer's markers: `;LAYER_CHANGE` `;Z:` `;HEIGHT:` `;TYPE:` `;WIDTH:` and the
// `;TIME:` header. Handles G0/G1, G2/G3 arcs (I/J), G90/G91, M82/M83 and G92.
//
// Output per feature type: one Float32Array, 8 floats per segment:
//   x0 y0 z0 layer   x1 y1 z1 height
// Segments come out in file order, so layer numbers never decrease and `layerEnd[L]` (segments with
// layer <= L) is all the renderer needs to draw "everything up to layer L".

export const SEG_STRIDE = 8

export interface FeatureBuffer {
  /** Orca's name, e.g. "Outer wall" */
  type: string
  segments: Float32Array
  count: number
  /** layerEnd[L] = number of segments whose layer <= L */
  layerEnd: Uint32Array
  /** mean extrusion width (mm), from ;WIDTH: */
  width: number
  /** seconds at commanded feed (no acceleration) */
  time: number
  /** path length in mm */
  length: number
  /** filament pushed, mm */
  filament: number
}

export interface LayerInfo {
  z: number
  height: number
  /** seconds at commanded feed, scaled to the header estimate when there is one */
  time: number
}

export interface ParsedGcode {
  features: FeatureBuffer[]
  /** travel moves: 6 floats per segment (x0 y0 z0 x1 y1 z1) + one layer number per segment */
  travel: { positions: Float32Array; layers: Float32Array; count: number; layerEnd: Uint32Array }
  layers: LayerInfo[]
  /** bounds of the printed part (everything except the start/end "Custom" block) */
  bounds: { min: [number, number, number]; max: [number, number, number] } | null
  /** header ;TIME: in seconds, 0 if missing */
  estimateSeconds: number
  /** raw sum of move times before scaling */
  rawSeconds: number
  lines: number
  parseMs: number
}

class Floats {
  a: Float32Array
  n = 0
  constructor(cap = 4096) {
    this.a = new Float32Array(cap)
  }
  grow(extra: number): void {
    if (this.n + extra <= this.a.length) return
    let cap = this.a.length * 2
    while (cap < this.n + extra) cap *= 2
    const b = new Float32Array(cap)
    b.set(this.a.subarray(0, this.n))
    this.a = b
  }
  trimmed(): Float32Array {
    return this.a.slice(0, this.n)
  }
}

interface FeatureAcc {
  type: string
  segs: Floats
  widthSum: number
  widthN: number
  time: number
  length: number
  filament: number
}

/** Fast parameter reader for one G-code word list. Returns NaN for absent letters. */
function readWords(line: string, start: number, out: Record<string, number>): void {
  out.X = out.Y = out.Z = out.E = out.F = out.I = out.J = out.R = NaN
  const len = line.length
  let i = start
  while (i < len) {
    const c = line.charCodeAt(i)
    if (c === 59) break // ';' comment
    // A-Z
    if (c >= 65 && c <= 90) {
      let j = i + 1
      while (j < len) {
        const d = line.charCodeAt(j)
        if ((d >= 48 && d <= 57) || d === 46 || d === 45 || d === 43) j++
        else break
      }
      if (j > i + 1) {
        const key = line[i]
        if (key in out) out[key] = parseFloat(line.slice(i + 1, j))
      }
      i = j
    } else i++
  }
}

export interface ParseOptions {
  /** called every ~5% with 0..1 */
  onProgress?: (fraction: number) => void
  /** max length of one straight piece when flattening arcs, mm */
  arcStep?: number
}

export function parseGcode(text: string, opts: ParseOptions = {}): ParsedGcode {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const arcStep = opts.arcStep ?? 0.8

  const features = new Map<string, FeatureAcc>()
  const order: string[] = []
  const feature = (type: string): FeatureAcc => {
    let f = features.get(type)
    if (!f) {
      f = { type, segs: new Floats(1 << 14), widthSum: 0, widthN: 0, time: 0, length: 0, filament: 0 }
      features.set(type, f)
      order.push(type)
    }
    return f
  }

  const travelPos = new Floats(1 << 14)
  const travelLayer = new Floats(1 << 12)

  const layers: LayerInfo[] = []
  let layer = 0
  let layerSeen = false
  let curZ = 0
  let curH = 0.2
  let type = 'Custom'
  let cur = feature(type)
  let width = 0.42

  let x = 0
  let y = 0
  let z = 0
  let e = 0
  let feed = 1800 // mm/min
  let absXYZ = true
  let absE = true
  let estimate = 0
  let rawTotal = 0
  let layerTime = 0

  let bminX = Infinity
  let bminY = Infinity
  let bminZ = Infinity
  let bmaxX = -Infinity
  let bmaxY = -Infinity
  let bmaxZ = -Infinity

  const w: Record<string, number> = { X: NaN, Y: NaN, Z: NaN, E: NaN, F: NaN, I: NaN, J: NaN, R: NaN }

  const flushLayer = (): void => {
    if (!layerSeen) return
    layers[layer] = { z: curZ, height: curH, time: layerTime }
  }

  const extrude = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, de: number, dt: number, dist: number): void => {
    const s = cur.segs
    s.grow(SEG_STRIDE)
    const a = s.a
    let n = s.n
    a[n++] = x0
    a[n++] = y0
    a[n++] = z0
    a[n++] = layer
    a[n++] = x1
    a[n++] = y1
    a[n++] = z1
    a[n++] = curH
    s.n = n
    cur.widthSum += width
    cur.widthN++
    cur.time += dt
    cur.length += dist
    cur.filament += de
    if (type !== 'Custom') {
      if (x0 < bminX) bminX = x0
      if (x1 < bminX) bminX = x1
      if (y0 < bminY) bminY = y0
      if (y1 < bminY) bminY = y1
      if (z1 - curH < bminZ) bminZ = Math.max(0, z1 - curH)
      if (x0 > bmaxX) bmaxX = x0
      if (x1 > bmaxX) bmaxX = x1
      if (y0 > bmaxY) bmaxY = y0
      if (y1 > bmaxY) bmaxY = y1
      if (z1 > bmaxZ) bmaxZ = z1
    }
  }

  const travel = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
    travelPos.grow(6)
    const a = travelPos.a
    let n = travelPos.n
    a[n++] = x0
    a[n++] = y0
    a[n++] = z0
    a[n++] = x1
    a[n++] = y1
    a[n++] = z1
    travelPos.n = n
    travelLayer.grow(1)
    travelLayer.a[travelLayer.n++] = layer
  }

  const len = text.length
  let pos = 0
  let lineNo = 0
  const step = Math.max(1, Math.floor(len / 20))
  let nextProgress = step

  while (pos < len) {
    let end = text.indexOf('\n', pos)
    if (end < 0) end = len
    lineNo++
    // skip leading spaces
    let s = pos
    while (s < end && text.charCodeAt(s) === 32) s++
    const c = text.charCodeAt(s)

    if (c === 59) {
      // ';' comment / marker
      const line = text.slice(s, end).trimEnd()
      if (line.startsWith(';TYPE:')) {
        type = line.slice(6).trim() || 'Custom'
        cur = feature(type)
      } else if (line.startsWith(';WIDTH:')) {
        const v = parseFloat(line.slice(7))
        if (v > 0 && v < 5) width = v
      } else if (line === ';LAYER_CHANGE') {
        if (layerSeen) {
          flushLayer()
          layer++
        }
        layerSeen = true
        layerTime = 0
      } else if (line.startsWith(';Z:')) {
        const v = parseFloat(line.slice(3))
        if (Number.isFinite(v)) curZ = v
      } else if (line.startsWith(';HEIGHT:')) {
        const v = parseFloat(line.slice(8))
        if (Number.isFinite(v) && v > 0) curH = v
      } else if (line.startsWith(';TIME:') && !estimate) {
        estimate = parseFloat(line.slice(6)) || 0
      }
    } else if (c === 71 /* G */) {
      // G-number
      let j = s + 1
      let g = 0
      let digits = 0
      while (j < end) {
        const d = text.charCodeAt(j)
        if (d >= 48 && d <= 57) {
          g = g * 10 + (d - 48)
          j++
          digits++
        } else break
      }
      if (digits && j < end && text.charCodeAt(j) === 46) {
        // G29.1 etc: not a motion command we draw
        g = -1
      }
      if (g === 0 || g === 1 || g === 2 || g === 3) {
        const line = text.slice(j, end)
        readWords(line, 0, w)
        if (!Number.isNaN(w.F) && w.F > 0) feed = w.F
        const nx = Number.isNaN(w.X) ? x : absXYZ ? w.X : x + w.X
        const ny = Number.isNaN(w.Y) ? y : absXYZ ? w.Y : y + w.Y
        const nz = Number.isNaN(w.Z) ? z : absXYZ ? w.Z : z + w.Z
        let de = 0
        if (!Number.isNaN(w.E)) {
          de = absE ? w.E - e : w.E
          e = absE ? w.E : e + w.E
        }
        const mmPerSec = feed / 60
        if (g <= 1 || (Number.isNaN(w.I) && Number.isNaN(w.J))) {
          const dx = nx - x
          const dy = ny - y
          const dz = nz - z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          const dt = (dist > 0 ? dist : Math.abs(de)) / mmPerSec
          rawTotal += dt
          layerTime += dt
          if (dist > 0) {
            if (de > 0 && (dx !== 0 || dy !== 0)) extrude(x, y, z, nx, ny, nz, de, dt, dist)
            else travel(x, y, z, nx, ny, nz)
          }
        } else {
          // Arc around (x+I, y+J). G2 = clockwise.
          const cx = x + (Number.isNaN(w.I) ? 0 : w.I)
          const cy = y + (Number.isNaN(w.J) ? 0 : w.J)
          const r = Math.hypot(x - cx, y - cy)
          const a0 = Math.atan2(y - cy, x - cx)
          const a1 = Math.atan2(ny - cy, nx - cx)
          let sweep = a1 - a0
          if (g === 2) {
            if (sweep >= 0) sweep -= Math.PI * 2
          } else if (sweep <= 0) sweep += Math.PI * 2
          // full circle when start == end
          if (Math.abs(nx - x) < 1e-6 && Math.abs(ny - y) < 1e-6) sweep = g === 2 ? -Math.PI * 2 : Math.PI * 2
          const arcLen = Math.abs(sweep) * r
          const pieces = Math.max(1, Math.min(256, Math.ceil(arcLen / arcStep)))
          const dist = Math.sqrt(arcLen * arcLen + (nz - z) * (nz - z))
          const dt = (dist > 0 ? dist : Math.abs(de)) / mmPerSec
          rawTotal += dt
          layerTime += dt
          let px = x
          let py = y
          let pz = z
          for (let k = 1; k <= pieces; k++) {
            const f = k / pieces
            const ang = a0 + sweep * f
            const qx = k === pieces ? nx : cx + Math.cos(ang) * r
            const qy = k === pieces ? ny : cy + Math.sin(ang) * r
            const qz = z + (nz - z) * f
            if (de > 0) extrude(px, py, pz, qx, qy, qz, de / pieces, dt / pieces, dist / pieces)
            else travel(px, py, pz, qx, qy, qz)
            px = qx
            py = qy
            pz = qz
          }
        }
        x = nx
        y = ny
        z = nz
      } else if (g === 90) absXYZ = true
      else if (g === 91) absXYZ = false
      else if (g === 92) {
        readWords(text.slice(j, end), 0, w)
        if (!Number.isNaN(w.E)) e = w.E
        if (!Number.isNaN(w.X)) x = w.X
        if (!Number.isNaN(w.Y)) y = w.Y
        if (!Number.isNaN(w.Z)) z = w.Z
      } else if (g === 28) {
        x = 0
        y = 0
        z = 0
      }
    } else if (c === 77 /* M */) {
      const code = parseInt(text.slice(s + 1, Math.min(end, s + 6)), 10)
      if (code === 82) absE = true
      else if (code === 83) absE = false
    }

    pos = end + 1
    if (pos >= nextProgress) {
      opts.onProgress?.(Math.min(1, pos / len))
      nextProgress += step
    }
  }
  flushLayer()
  if (!layers.length) layers.push({ z: curZ, height: curH, time: layerTime })
  for (let i = 0; i < layers.length; i++) if (!layers[i]) layers[i] = { z: layers[i - 1]?.z ?? 0, height: curH, time: 0 }

  // Scale move times to the engine's estimate (it knows acceleration; we only know feedrates).
  const scale = estimate > 0 && rawTotal > 0 ? estimate / rawTotal : 1
  for (const l of layers) l.time *= scale

  const layerCount = layers.length
  const endIndex = (layerOf: (i: number) => number, count: number): Uint32Array => {
    const out = new Uint32Array(layerCount)
    let i = 0
    for (let L = 0; L < layerCount; L++) {
      while (i < count && layerOf(i) <= L) i++
      out[L] = i
    }
    return out
  }

  const outFeatures: FeatureBuffer[] = []
  for (const name of order) {
    const f = features.get(name) as FeatureAcc
    const count = f.segs.n / SEG_STRIDE
    if (!count) continue
    const segments = f.segs.trimmed()
    outFeatures.push({
      type: name,
      segments,
      count,
      layerEnd: endIndex((i) => segments[i * SEG_STRIDE + 3], count),
      width: f.widthN ? f.widthSum / f.widthN : 0.42,
      time: f.time * scale,
      length: f.length,
      filament: f.filament
    })
  }

  const tCount = travelLayer.n
  const tLayers = travelLayer.trimmed()
  const travelOut = {
    positions: travelPos.trimmed(),
    layers: tLayers,
    count: tCount,
    layerEnd: endIndex((i) => tLayers[i], tCount)
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return {
    features: outFeatures,
    travel: travelOut,
    layers,
    bounds: Number.isFinite(bminX) ? { min: [bminX, bminY, bminZ], max: [bmaxX, bmaxY, bmaxZ] } : null,
    estimateSeconds: estimate,
    rawSeconds: rawTotal,
    lines: lineNo,
    parseMs: t1 - t0
  }
}

/** Every ArrayBuffer in a parse result, for postMessage transfer. */
export function transferables(p: ParsedGcode): ArrayBuffer[] {
  const out: ArrayBuffer[] = []
  for (const f of p.features) out.push(f.segments.buffer as ArrayBuffer, f.layerEnd.buffer as ArrayBuffer)
  out.push(p.travel.positions.buffer as ArrayBuffer, p.travel.layers.buffer as ArrayBuffer, p.travel.layerEnd.buffer as ArrayBuffer)
  return out
}
