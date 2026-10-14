// Fast 3MF reader. three.js's ThreeMFLoader builds a full DOM of the model XML and took ~7.4 s on a
// 13 MB Creality Cloud project; this scans the XML as text and builds typed arrays directly.
// Handles: split models (3D/Objects/*.model referenced by p:path), components with transforms, build
// items with transforms, units, object names from Bambu/Orca/Creality model_settings.config, and the
// designer's print settings in Metadata/project_settings.config.

import { strFromU8, unzipSync } from 'fflate'

export interface ThreeMfObject {
  name: string
  /** triangle soup in world mm (build item + component transforms applied) */
  positions: Float32Array
}

export interface ThreeMfResult {
  objects: ThreeMfObject[]
  /** Orca/Bambu/Creality project settings, if the file carries them */
  projectSettings?: Record<string, unknown>
}

type M = number[] // 12 numbers, 3MF row-vector order m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32
const IDENTITY: M = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

interface Obj {
  id: string
  name: string
  verts?: Float32Array
  tris?: Uint32Array
  components: { path: string; objectid: string; transform: M }[]
}

/** Growable Float32Array, so a million-triangle part never sits in a plain JS number array. */
class Soup {
  private buf = new Float32Array(1 << 16)
  length = 0
  add(x: number, y: number, z: number): void {
    if (this.length + 3 > this.buf.length) {
      const next = new Float32Array(this.buf.length * 2)
      next.set(this.buf)
      this.buf = next
    }
    this.buf[this.length++] = x
    this.buf[this.length++] = y
    this.buf[this.length++] = z
  }
  done(): Float32Array {
    return this.buf.slice(0, this.length)
  }
}

const UNITS: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }

function attr(tag: string, name: string): string | undefined {
  const i = tag.indexOf(` ${name}="`)
  if (i < 0) return undefined
  const s = i + name.length + 3
  return tag.slice(s, tag.indexOf('"', s))
}

function parseTransform(t: string | undefined): M {
  if (!t) return IDENTITY
  const n = t.trim().split(/\s+/).map(Number)
  return n.length === 12 && n.every(Number.isFinite) ? n : IDENTITY
}

/** a then b (apply a first). Row-vector convention: p' = p * a * b */
function mul(a: M, b: M): M {
  const A = [a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]]
  const B = [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8]]
  const r = new Array(12)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]
  for (let j = 0; j < 3; j++) r[9 + j] = a[9] * B[j] + a[10] * B[3 + j] + a[11] * B[6 + j] + b[9 + j]
  return r
}

/** Numbers of a `<vertex x=".." y=".." z=".."/>` run, scanned without regex objects per vertex. */
function scanVertices(xml: string, from: number, to: number): Float32Array {
  const out: number[] = []
  let i = xml.indexOf('<vertex', from)
  while (i >= 0 && i < to) {
    const end = xml.indexOf('>', i)
    const tag = xml.slice(i, end)
    out.push(parseFloat(attr(tag, 'x') ?? '0'), parseFloat(attr(tag, 'y') ?? '0'), parseFloat(attr(tag, 'z') ?? '0'))
    i = xml.indexOf('<vertex', end)
  }
  return new Float32Array(out)
}

function scanTriangles(xml: string, from: number, to: number): Uint32Array {
  const out: number[] = []
  let i = xml.indexOf('<triangle', from)
  while (i >= 0 && i < to) {
    const end = xml.indexOf('>', i)
    const tag = xml.slice(i, end)
    out.push(Number(attr(tag, 'v1')), Number(attr(tag, 'v2')), Number(attr(tag, 'v3')))
    i = xml.indexOf('<triangle', end)
  }
  return new Uint32Array(out)
}

function parseModelFile(xml: string): { unit: number; objects: Map<string, Obj>; build: { objectid: string; transform: M; path?: string }[] } {
  const modelTag = xml.slice(xml.indexOf('<model'), xml.indexOf('>', xml.indexOf('<model')))
  const unit = UNITS[attr(modelTag, 'unit') ?? 'millimeter'] ?? 1
  const objects = new Map<string, Obj>()
  let i = xml.indexOf('<object ')
  while (i >= 0) {
    const tagEnd = xml.indexOf('>', i)
    const tag = xml.slice(i, tagEnd)
    const close = tag.endsWith('/') ? tagEnd : xml.indexOf('</object>', tagEnd)
    const obj: Obj = { id: attr(tag, 'id') ?? '', name: attr(tag, 'name') ?? '', components: [] }
    const meshAt = xml.indexOf('<mesh', tagEnd)
    if (meshAt >= 0 && meshAt < close) {
      const vEnd = xml.indexOf('</vertices>', meshAt)
      obj.verts = scanVertices(xml, meshAt, vEnd)
      obj.tris = scanTriangles(xml, vEnd, close)
    }
    let c = xml.indexOf('<component ', tagEnd)
    while (c >= 0 && c < close) {
      const cEnd = xml.indexOf('>', c)
      const ct = xml.slice(c, cEnd)
      obj.components.push({ path: attr(ct, 'p:path') ?? '', objectid: attr(ct, 'objectid') ?? '', transform: parseTransform(attr(ct, 'transform')) })
      c = xml.indexOf('<component ', cEnd)
    }
    objects.set(obj.id, obj)
    i = xml.indexOf('<object ', close)
  }
  const build: { objectid: string; transform: M; path?: string }[] = []
  const b0 = xml.indexOf('<build')
  if (b0 >= 0) {
    let it = xml.indexOf('<item ', b0)
    while (it >= 0) {
      const e = xml.indexOf('>', it)
      const t = xml.slice(it, e)
      if (attr(t, 'printable') !== '0') build.push({ objectid: attr(t, 'objectid') ?? '', transform: parseTransform(attr(t, 'transform')), path: attr(t, 'p:path') })
      it = xml.indexOf('<item ', e)
    }
  }
  return { unit, objects, build }
}

/** Object names Bambu/Orca/Creality keep in Metadata/model_settings.config, by object id. */
function settingsNames(xml: string | undefined): Map<string, string> {
  const names = new Map<string, string>()
  if (!xml) return names
  let i = xml.indexOf('<object ')
  while (i >= 0) {
    const e = xml.indexOf('>', i)
    const id = attr(xml.slice(i, e), 'id')
    const meta = xml.indexOf('<metadata key="name" value="', e)
    const next = xml.indexOf('<object ', e)
    if (id && meta >= 0 && (next < 0 || meta < next)) {
      const s = meta + '<metadata key="name" value="'.length
      names.set(id, decode(xml.slice(s, xml.indexOf('"', s))))
    }
    i = next
  }
  return names
}

const decode = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

export function parseThreeMf(bytes: Uint8Array, fallbackName: string): ThreeMfResult {
  const files = unzipSync(bytes, { filter: (f) => /\.model$/i.test(f.name) || /^Metadata\/(project_settings|model_settings)\.config$/i.test(f.name) || /\.rels$/i.test(f.name) })
  const modelPaths = Object.keys(files).filter((k) => /\.model$/i.test(k))
  const rootPath = modelPaths.find((p) => /^3D\/3dmodel\.model$/i.test(p)) ?? modelPaths[0]
  if (!rootPath) throw new Error('No 3D model inside this 3MF.')
  const parsed = new Map<string, ReturnType<typeof parseModelFile>>()
  const load = (path: string): ReturnType<typeof parseModelFile> => {
    const key = path.replace(/^\//, '')
    let p = parsed.get(key)
    if (!p) {
      const raw = files[key] ?? files[Object.keys(files).find((k) => k.toLowerCase() === key.toLowerCase()) ?? '']
      if (!raw) throw new Error(`3MF part missing: ${key}`)
      p = parseModelFile(strFromU8(raw))
      parsed.set(key, p)
    }
    return p
  }
  const root = load(rootPath)
  const names = settingsNames(files['Metadata/model_settings.config'] ? strFromU8(files['Metadata/model_settings.config']) : undefined)

  const objects: ThreeMfObject[] = []
  const emit = (path: string, id: string, m: M, out: Soup, depth = 0): void => {
    if (depth > 16) return
    const file = load(path)
    const o = file.objects.get(id)
    if (!o) return
    const s = file.unit
    if (o.verts && o.tris) {
      const v = o.verts
      const t = o.tris
      for (let k = 0; k < t.length; k++) {
        const vi = t[k] * 3
        const x = v[vi] * s, y = v[vi + 1] * s, z = v[vi + 2] * s
        out.add(x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11])
      }
    }
    for (const c of o.components) emit(c.path || path, c.objectid, mul(c.transform, m), out, depth + 1)
  }
  root.build.forEach((item, n) => {
    const out = new Soup()
    emit(item.path || rootPath, item.objectid, item.transform, out)
    if (!out.length) return
    const o = root.objects.get(item.objectid)
    // One part: the project's own name reads best. Several: their names, minus file extensions and
    // the content-hash names some exporters use.
    const raw = (names.get(item.objectid) || o?.name || '').replace(/\.(stl|obj|3mf|step|stp)$/i, '').trim()
    const name = root.build.length === 1 || !raw || /^[0-9a-f]{16,}$/i.test(raw) ? (root.build.length > 1 ? `${fallbackName} ${n + 1}` : fallbackName) : raw
    objects.push({ name, positions: out.done() })
  })
  if (!objects.length) throw new Error('This 3MF has no printable objects.')

  let projectSettings: Record<string, unknown> | undefined
  const ps = files['Metadata/project_settings.config']
  if (ps) {
    try {
      projectSettings = JSON.parse(strFromU8(ps)) as Record<string, unknown>
    } catch {
      // not the JSON flavour (PrusaSlicer writes ini) — ignore
    }
  }
  return { objects, projectSettings }
}
