// The build plate: meshes (geometry, shared by duplicates) and placed objects (transform per copy).
// World is Z-up in printer coordinates: the bed spans (0,0)-(220,220), Z=0 is the bed surface.
// Every mesh's geometry is normalised at load: footprint centred on X/Y = 0, lowest point at Z = 0,
// so an object's position is "where its centre sits on the bed".

import { computed, markRaw, reactive, shallowReactive } from 'vue'
import { Box3, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { MACHINE } from '@shared/machine'
import type { ProjectScene, ScenePayload } from '@shared/types'
import { encodeBinaryStl } from '@/lib/stl'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface MeshEntry {
  id: string
  name: string
  geometry: BufferGeometry
  /** size of the normalised geometry, mm */
  size: Vec3
  triangles: number
}

export interface SceneObject {
  id: string
  name: string
  meshId: string
  position: Vec3
  /** degrees, XYZ order */
  rotation: Vec3
  scale: Vec3
  visible: boolean
}

export type Issue = 'outside' | 'too-tall' | 'below-bed' | 'purge-zone'

const uid = (): string => Math.random().toString(36).slice(2, 10)

export const scene = reactive({
  objects: [] as SceneObject[],
  selection: [] as string[],
  /** bumps whenever geometry or transforms change, for watchers that need "scene changed" */
  revision: 0
})

export const meshes = shallowReactive(new Map<string, MeshEntry>())

export const selected = computed(() => scene.objects.filter((o) => scene.selection.includes(o.id)))
export const hasObjects = computed(() => scene.objects.length > 0)

export function touch(): void {
  scene.revision++
}

/** Normalises the geometry in place and registers it. */
export function addMesh(name: string, geometry: BufferGeometry): MeshEntry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  g.deleteAttribute('uv')
  g.computeBoundingBox()
  const b = g.boundingBox as Box3
  const c = new Vector3()
  b.getCenter(c)
  g.translate(-c.x, -c.y, -b.min.z)
  g.computeBoundingBox()
  g.computeVertexNormals()
  const s = new Vector3()
  ;(g.boundingBox as Box3).getSize(s)
  const entry: MeshEntry = { id: uid(), name, geometry: markRaw(g), size: { x: s.x, y: s.y, z: s.z }, triangles: g.attributes.position.count / 3 }
  meshes.set(entry.id, entry)
  return entry
}

export function objectMatrix(o: SceneObject): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler((o.rotation.x * Math.PI) / 180, (o.rotation.y * Math.PI) / 180, (o.rotation.z * Math.PI) / 180, 'XYZ'))
  return new Matrix4().compose(new Vector3(o.position.x, o.position.y, o.position.z), q, new Vector3(o.scale.x, o.scale.y, o.scale.z))
}

// World boxes are cached per mesh + rotation + scale, relative to the object's position: dragging an
// object only translates its cached box, so a 1M-triangle part costs one vertex pass per rotation or
// scale change instead of one per pointer move.
const boxCache = new Map<string, Box3>()

/** World-space bounding box of an object (exact, from its vertices). */
export function worldBox(o: SceneObject): Box3 {
  const m = meshes.get(o.meshId)
  const box = new Box3()
  if (!m) return box
  const r = o.rotation
  const s = o.scale
  const key = `${o.meshId}|${r.x}|${r.y}|${r.z}|${s.x}|${s.y}|${s.z}`
  let local = boxCache.get(key)
  if (!local || local.isEmpty()) {
    local = new Box3()
    const pos = m.geometry.attributes.position
    const mat = objectMatrix({ ...o, position: { x: 0, y: 0, z: 0 } })
    const v = new Vector3()
    // sample every vertex for small meshes, a stride for huge ones (box stays within ~0.1 mm)
    const stride = pos.count > 600_000 ? 3 : 1
    for (let i = 0; i < pos.count; i += stride) local.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mat))
    if (boxCache.size > 400) boxCache.clear()
    boxCache.set(key, local)
  }
  box.copy(local)
  box.min.x += o.position.x
  box.min.y += o.position.y
  box.min.z += o.position.z
  box.max.x += o.position.x
  box.max.y += o.position.y
  box.max.z += o.position.z
  return box
}

/** Puts the object's lowest point on the bed (after a rotation or scale). */
export function dropToBed(o: SceneObject): void {
  const b = worldBox(o)
  o.position.z -= b.min.z
}

export function issues(o: SceneObject): Issue[] {
  const b = worldBox(o)
  const out: Issue[] = []
  const eps = 0.01
  if (b.min.x < -eps || b.min.y < -eps || b.max.x > MACHINE.bed.x + eps || b.max.y > MACHINE.bed.y + eps) out.push('outside')
  if (b.max.z > MACHINE.maxZ + eps) out.push('too-tall')
  if (b.min.z < -eps) out.push('below-bed')
  if (b.min.x < MACHINE.purgeKeepout.xMax && b.min.y < 150 && b.max.y > 15) out.push('purge-zone')
  return out
}

export const ISSUE_TEXT: Record<Issue, string> = {
  outside: 'Reaches past the edge of the bed',
  'too-tall': `Taller than the ${MACHINE.maxZ} mm build height`,
  'below-bed': 'Sinks below the bed',
  'purge-zone': 'Overlaps the purge line on the left edge'
}

export function addObject(meshId: string, name: string, at?: { x: number; y: number }): SceneObject {
  const o: SceneObject = reactive({
    id: uid(),
    name,
    meshId,
    position: { x: at?.x ?? MACHINE.bed.x / 2, y: at?.y ?? MACHINE.bed.y / 2, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true
  })
  scene.objects.push(o)
  touch()
  return o
}

export function removeObjects(ids: string[]): void {
  scene.objects = scene.objects.filter((o) => !ids.includes(o.id))
  scene.selection = scene.selection.filter((id) => !ids.includes(id))
  for (const [id] of meshes) if (!scene.objects.some((o) => o.meshId === id)) meshes.delete(id)
  touch()
}

export function clearScene(): void {
  scene.objects = []
  scene.selection = []
  meshes.clear()
  touch()
}

export function select(ids: string[], additive = false): void {
  scene.selection = additive ? [...new Set([...scene.selection, ...ids])] : ids
}

/** Mesh soup + instance matrices for the engine. Hidden objects are not printed. */
export function toScenePayload(): ScenePayload {
  const visible = scene.objects.filter((o) => o.visible)
  const used = new Set(visible.map((o) => o.meshId))
  return {
    meshes: [...used].map((id) => {
      const m = meshes.get(id) as MeshEntry
      return { id, name: m.name, positions: new Float32Array(m.geometry.attributes.position.array as Float32Array) }
    }),
    instances: visible.map((o) => ({ meshId: o.meshId, name: o.name, matrix: objectMatrix(o).elements.slice() }))
  }
}

/** Project data: each mesh as a binary STL of its normalised geometry + each object's matrix. */
export function toProject(settings: ProjectScene['settings'], filamentId: string): { project: ProjectScene; models: { file: string; bytes: Uint8Array }[] } {
  const files = new Map<string, string>()
  const models: { file: string; bytes: Uint8Array }[] = []
  for (const o of scene.objects) {
    if (files.has(o.meshId)) continue
    const m = meshes.get(o.meshId) as MeshEntry
    const file = `${models.length + 1}_${m.name.replace(/[^\w.-]+/g, '_').slice(0, 40)}.stl`
    files.set(o.meshId, file)
    models.push({ file, bytes: encodeBinaryStl(m.geometry) })
  }
  return {
    project: {
      version: 1,
      objects: scene.objects.map((o) => ({ name: o.name, file: files.get(o.meshId) as string, matrix: objectMatrix(o).elements.slice() })),
      settings,
      filamentId
    },
    models
  }
}

/** Decomposes a stored matrix back into position / rotation (deg) / scale. */
export function fromMatrix(elements: number[]): Pick<SceneObject, 'position' | 'rotation' | 'scale'> {
  const p = new Vector3()
  const q = new Quaternion()
  const s = new Vector3()
  new Matrix4().fromArray(elements).decompose(p, q, s)
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  const deg = (r: number): number => Math.round(((r * 180) / Math.PI) * 1000) / 1000
  return { position: { x: p.x, y: p.y, z: p.z }, rotation: { x: deg(e.x), y: deg(e.y), z: deg(e.z) }, scale: { x: s.x, y: s.y, z: s.z } }
}

export function newId(): string {
  return uid()
}

// ---------------------------------------------------------------- transform helpers

const DEG = Math.PI / 180

export function objectQuaternion(o: SceneObject): Quaternion {
  return new Quaternion().setFromEuler(new Euler(o.rotation.x * DEG, o.rotation.y * DEG, o.rotation.z * DEG, 'XYZ'))
}

const tidy = (v: number): number => {
  const r = Math.round(v * 1000) / 1000
  return Object.is(r, -0) ? 0 : r
}

/** Stores a rotation given as a quaternion (as XYZ Euler degrees, rounded to 0.001). */
export function setObjectQuaternion(o: SceneObject, q: Quaternion): void {
  const e = new Euler().setFromQuaternion(q.clone().normalize(), 'XYZ')
  // Every XYZ rotation has a twin (x + 180, 180 - y, z + 180); keep the one with smaller angles,
  // so laying a part on its side reads as "Y 26.6" rather than "X -180, Y 26.6, Z -180".
  const wrap = (r: number): number => Math.atan2(Math.sin(r), Math.cos(r))
  const alt = { x: wrap(e.x + Math.PI), y: wrap(Math.PI - e.y), z: wrap(e.z + Math.PI) }
  const cost = (v: { x: number; y: number; z: number }): number => Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z)
  const best = cost(alt) + 1e-9 < cost(e) ? alt : { x: e.x, y: e.y, z: e.z }
  o.rotation.x = tidy(best.x / DEG)
  o.rotation.y = tidy(best.y / DEG)
  o.rotation.z = tidy(best.z / DEG)
}

/** Centre of the object's world bounding box. */
export function boxCentre(o: SceneObject): Vector3 {
  return worldBox(o).getCenter(new Vector3())
}

/** Moves the object so its footprint centre sits at (x, y). */
export function moveCentreTo(o: SceneObject, x: number, y: number): void {
  const c = boxCentre(o)
  o.position.x = tidy(o.position.x + x - c.x)
  o.position.y = tidy(o.position.y + y - c.y)
}

export function centreOnBed(o: SceneObject): void {
  moveCentreTo(o, MACHINE.bed.x / 2, MACHINE.bed.y / 2)
}

/**
 * Runs a rotation/scale change while keeping the footprint centre where it was, then drops the
 * object onto the bed. Every rotate/scale edit goes through this so parts never wander or float.
 */
export function keepPlace(o: SceneObject, change: () => void): void {
  const before = boxCentre(o)
  change()
  moveCentreTo(o, before.x, before.y)
  dropToBed(o)
}
