// Every Prepare-mode action as a plain, UI-independent function. The viewport, the object panel and
// the automation layer (MCP) all call these; components never change the scene any other way.
// Ids are SceneObject ids. Positions are bed coordinates in mm of the part's footprint centre
// (the centre of its world bounding box), rotations are degrees, scale is a factor (1 = 100 %).
// Every action that changes the scene calls touch(), so a slice result goes stale.

import { Box3, Matrix3, Quaternion, Vector3 } from 'three'
import { MACHINE } from '@shared/machine'
import { arrange } from '@/lib/arrange'
import { toast } from '@/stores/app'
import {
  addObject,
  boxCentre,
  centreOnBed as centreOne,
  dropToBed as dropOne,
  issues,
  keepPlace,
  meshes,
  moveCentreTo,
  objectMatrix,
  objectQuaternion,
  removeObjects,
  scene,
  select,
  setObjectQuaternion,
  touch,
  worldBox,
  type Issue,
  type SceneObject,
  type Vec3
} from '@/stores/scene'
import { faceRegion } from './layFlat'
import { viewBridge, ws, type CameraView, type Tool } from './workspace'

type Axis = 'x' | 'y' | 'z'
const AXES: Axis[] = ['x', 'y', 'z']
const AXIS_VEC: Record<Axis, Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) }

function get(id: string): SceneObject {
  const o = scene.objects.find((x) => x.id === id)
  if (!o) throw new Error(`No object with id ${id}`)
  return o
}
const list = (ids: string[]): SceneObject[] => ids.map(get)
const sel = (): string[] => [...scene.selection]
const tidy = (v: number): number => Math.round(v * 10000) / 10000

function groupBox(objs: SceneObject[]): Box3 {
  const g = new Box3()
  for (const o of objs) g.union(worldBox(o))
  return g
}

// ------------------------------------------------------------------ reading

export interface ObjectInfo {
  id: string
  name: string
  meshId: string
  visible: boolean
  selected: boolean
  /** footprint centre on the bed, mm */
  centre: Vec3
  position: Vec3
  rotation: Vec3
  scale: Vec3
  /** world bounding-box size, mm */
  size: Vec3
  /** size of the scaled part along its own axes, mm (what the Size fields show) */
  localSize: Vec3
  triangles: number
  issues: Issue[]
}

export function objectInfo(id: string): ObjectInfo {
  const o = get(id)
  const b = worldBox(o)
  const c = b.getCenter(new Vector3())
  const m = meshes.get(o.meshId)
  return {
    id: o.id,
    name: o.name,
    meshId: o.meshId,
    visible: o.visible,
    selected: scene.selection.includes(o.id),
    centre: { x: c.x, y: c.y, z: c.z },
    position: { ...o.position },
    rotation: { ...o.rotation },
    scale: { ...o.scale },
    size: { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z },
    localSize: m ? { x: m.size.x * o.scale.x, y: m.size.y * o.scale.y, z: m.size.z * o.scale.z } : { x: 0, y: 0, z: 0 },
    triangles: m?.triangles ?? 0,
    issues: issues(o)
  }
}

export function listObjects(): ObjectInfo[] {
  return scene.objects.map((o) => objectInfo(o.id))
}

// ------------------------------------------------------------------ selection

export function selectObjects(ids: string[], additive = false): void {
  list(ids)
  select(ids, additive)
}

export function deselectObjects(ids: string[]): void {
  select(scene.selection.filter((id) => !ids.includes(id)))
}

export function selectAll(): void {
  select(scene.objects.filter((o) => o.visible).map((o) => o.id))
}

export function clearSelection(): void {
  select([])
  ws.layFlat = false
}

// ------------------------------------------------------------------ move

/**
 * Moves one part. `absolute`: put its footprint centre at (x, y). `relative`: shift by (x, y).
 * Omitted axes stay where they are.
 */
export function moveObject(id: string, to: { x?: number; y?: number }, mode: 'absolute' | 'relative' = 'absolute'): void {
  const o = get(id)
  if (mode === 'relative') {
    o.position.x = tidy(o.position.x + (to.x ?? 0))
    o.position.y = tidy(o.position.y + (to.y ?? 0))
  } else {
    const c = boxCentre(o)
    moveCentreTo(o, to.x ?? c.x, to.y ?? c.y)
  }
  touch()
}

/** Moves several parts together: `absolute` puts the group's footprint centre at (x, y). */
export function moveObjects(ids: string[], to: { x?: number; y?: number }, mode: 'absolute' | 'relative' = 'absolute'): void {
  const objs = list(ids)
  if (!objs.length) return
  let dx = to.x ?? 0
  let dy = to.y ?? 0
  if (mode === 'absolute') {
    const c = groupBox(objs).getCenter(new Vector3())
    dx = to.x === undefined ? 0 : to.x - c.x
    dy = to.y === undefined ? 0 : to.y - c.y
  }
  for (const o of objs) {
    o.position.x = tidy(o.position.x + dx)
    o.position.y = tidy(o.position.y + dy)
  }
  touch()
}

/** Centre of the parts' combined footprint. */
export function groupCentre(ids: string[]): Vec3 {
  const c = groupBox(list(ids)).getCenter(new Vector3())
  return { x: c.x, y: c.y, z: c.z }
}

export function dropToBed(ids: string[] = sel()): void {
  for (const o of list(ids)) dropOne(o)
  touch()
}

/** Centres one part, or several as a group, on the bed. */
export function centreOnBed(ids: string[] = sel()): void {
  const objs = list(ids)
  if (objs.length === 1) {
    centreOne(objs[0])
    touch()
  } else if (objs.length) moveObjects(ids, { x: MACHINE.bed.x / 2, y: MACHINE.bed.y / 2 })
}

// ------------------------------------------------------------------ rotate

/**
 * Rotates one part (degrees). `absolute` sets the stored XYZ Euler angles (omitted axes keep their
 * value); `relative` turns it about the printer's X, then Y, then Z axes by the given amounts.
 * The part keeps its footprint centre and is dropped onto the bed.
 */
export function rotateObject(id: string, deg: Partial<Vec3>, mode: 'absolute' | 'relative' = 'absolute'): void {
  const o = get(id)
  keepPlace(o, () => {
    if (mode === 'absolute') {
      o.rotation = { x: tidy(deg.x ?? o.rotation.x), y: tidy(deg.y ?? o.rotation.y), z: tidy(deg.z ?? o.rotation.z) }
      return
    }
    let q = objectQuaternion(o)
    for (const a of AXES) {
      const d = deg[a]
      if (!d) continue
      q = new Quaternion().setFromAxisAngle(AXIS_VEC[a], (d * Math.PI) / 180).multiply(q)
    }
    setObjectQuaternion(o, q)
  })
  touch()
}

export function resetRotation(ids: string[] = sel()): void {
  for (const id of ids) rotateObject(id, { x: 0, y: 0, z: 0 })
}

// ------------------------------------------------------------------ scale

export interface ScaleSpec {
  /** uniform scale in percent of the original model */
  percent?: number
  /** per-axis scale in percent (omitted axes unchanged) */
  axes?: Partial<Vec3>
  /** target size in mm along the part's own axes (omitted axes unchanged, or follow when uniform) */
  size?: Partial<Vec3>
  /** with `axes` or `size`: scale the other axes by the same ratio (default false) */
  uniform?: boolean
}

/** Scales one part. The part keeps its footprint centre and is dropped onto the bed. */
export function scaleObject(id: string, spec: ScaleSpec): void {
  const o = get(id)
  const m = meshes.get(o.meshId)
  if (!m) return
  const s = { ...o.scale }
  if (spec.percent !== undefined) {
    const f = Math.max(0.001, spec.percent / 100)
    s.x = s.y = s.z = f
  }
  const target: Partial<Vec3> = {}
  if (spec.axes) for (const a of AXES) if (spec.axes[a] !== undefined) target[a] = Math.max(0.001, (spec.axes[a] as number) / 100)
  if (spec.size) for (const a of AXES) if (spec.size[a] !== undefined && m.size[a] > 0) target[a] = Math.max(0.001, (spec.size[a] as number) / m.size[a])
  const given = AXES.filter((a) => target[a] !== undefined)
  if (given.length) {
    if (spec.uniform) {
      const ratio = (target[given[0]] as number) / s[given[0]]
      for (const a of AXES) s[a] = s[a] * ratio
    } else for (const a of given) s[a] = target[a] as number
  }
  keepPlace(o, () => (o.scale = { x: tidy(s.x), y: tidy(s.y), z: tidy(s.z) }))
  touch()
}

export function resetScale(ids: string[] = sel()): void {
  for (const id of ids) scaleObject(id, { percent: 100 })
}

// ------------------------------------------------------------------ lay flat

/** Lays a face (given by its world-space outward normal) flat on the bed. */
function layOnNormal(o: SceneObject, worldNormal: Vector3): void {
  const dq = new Quaternion().setFromUnitVectors(worldNormal.clone().normalize(), new Vector3(0, 0, -1))
  keepPlace(o, () => setObjectQuaternion(o, dq.multiply(objectQuaternion(o))))
  touch()
}

function localToWorldNormal(o: SceneObject, n: Vector3): Vector3 {
  return n.clone().applyMatrix3(new Matrix3().getNormalMatrix(objectMatrix(o))).normalize()
}

/** Lays the flat region containing triangle `faceIndex` (of the part's mesh) on the bed. */
export function layFlatOnFace(id: string, faceIndex: number): void {
  const o = get(id)
  const m = meshes.get(o.meshId)
  if (!m) return
  const region = faceRegion(m.geometry, faceIndex)
  if (!region) throw new Error(`Face ${faceIndex} is not a valid triangle of ${o.name}`)
  layOnNormal(o, localToWorldNormal(o, region.normal))
}

/**
 * Puts the part's largest flat face down: triangles are grouped into planes, planes ranked by area,
 * and the biggest plane that the part can actually rest on (nothing sticks out past it) wins.
 * Returns the chosen face's area in mm² (of the unscaled mesh), or 0 when nothing was changed.
 */
export function layFlatAuto(id: string): number {
  const o = get(id)
  const m = meshes.get(o.meshId)
  if (!m) return 0
  const p = m.geometry.attributes.position.array as ArrayLike<number>
  const tris = p.length / 9
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const n = new Vector3()
  const ab = new Vector3()
  const planes = new Map<string, { area: number; n: Vector3; d: number }>()
  for (let t = 0; t < tris; t++) {
    const i = t * 9
    a.set(p[i], p[i + 1], p[i + 2])
    b.set(p[i + 3], p[i + 4], p[i + 5])
    c.set(p[i + 6], p[i + 7], p[i + 8])
    n.subVectors(c, b).cross(ab.subVectors(a, b))
    const area = n.length() / 2
    if (area < 1e-6) continue
    n.normalize()
    const d = n.dot(a)
    const key = `${Math.round(n.x * 200)},${Math.round(n.y * 200)},${Math.round(n.z * 200)},${Math.round(d * 10)}`
    const e = planes.get(key)
    if (e) e.area += area
    else planes.set(key, { area, n: n.clone(), d })
  }
  const ranked = [...planes.values()].sort((x, y) => y.area - x.area).slice(0, 24)
  // A plane supports the part when no vertex lies beyond it (in the direction of its normal).
  const stride = p.length > 9 * 600_000 ? 3 : 1
  for (const cand of ranked) {
    let beyond = false
    for (let i = 0; i < p.length; i += 3 * stride) {
      if (cand.n.x * p[i] + cand.n.y * p[i + 1] + cand.n.z * p[i + 2] - cand.d > 0.05) {
        beyond = true
        break
      }
    }
    if (beyond) continue
    layOnNormal(o, localToWorldNormal(o, cand.n))
    return cand.area
  }
  return 0
}

/** Turns the interactive "Lay on face" pick mode on or off (the next click on a face applies it). */
export function setLayFlatMode(on: boolean): void {
  ws.layFlat = on
}

// ------------------------------------------------------------------ add / remove / copy

function footprintFree(box: Box3, others: SceneObject[]): boolean {
  if (box.min.x < MACHINE.purgeKeepout.xMax + 1 || box.min.y < 1 || box.max.x > MACHINE.bed.x - 1 || box.max.y > MACHINE.bed.y - 1) return false
  for (const o of others) {
    if (!o.visible) continue
    const b = worldBox(o)
    if (box.min.x < b.max.x + 2 && box.max.x > b.min.x - 2 && box.min.y < b.max.y + 2 && box.max.y > b.min.y - 2) return false
  }
  return true
}

/**
 * Makes `count` copies of the parts (sharing their meshes). Each copy goes into free space next to
 * the group if there is room, otherwise the whole plate is re-arranged. Selects and returns the copies.
 */
export function duplicateObjects(ids: string[] = sel(), count = 1): string[] {
  const src = list(ids)
  if (!src.length || count < 1) return []
  const made: SceneObject[] = []
  let rearrange = false
  for (let k = 0; k < Math.min(count, 200); k++) {
    const batch: SceneObject[] = []
    for (const o of src) {
      const copy = addObject(o.meshId, o.name)
      copy.rotation = { ...o.rotation }
      copy.scale = { ...o.scale }
      copy.position = { ...o.position }
      batch.push(copy)
    }
    made.push(...batch)
    if (rearrange) continue
    const group = groupBox(src)
    const size = group.getSize(new Vector3())
    const others = scene.objects.filter((o) => !batch.includes(o))
    let placed = false
    // try right, behind, left, in front, then the diagonals, one and two steps out
    for (const step of [1, 2]) {
      for (const [sx, sy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const dx = sx * step * (size.x + 6)
        const dy = sy * step * (size.y + 6)
        if (!footprintFree(group.clone().translate(new Vector3(dx, dy, 0)), others)) continue
        for (const c of batch) {
          c.position.x += dx
          c.position.y += dy
        }
        placed = true
        break
      }
      if (placed) break
    }
    if (!placed) rearrange = true
  }
  if (rearrange) arrangeAll()
  select(made.map((o) => o.id))
  touch()
  return made.map((o) => o.id)
}

export function deleteObjects(ids: string[] = sel()): void {
  if (!ids.length) return
  removeObjects(ids)
  if (!scene.selection.length) ws.layFlat = false
}

export function renameObject(id: string, name: string): void {
  const o = get(id)
  const n = name.trim()
  if (!n || n === o.name) return
  o.name = n
  touch()
}

/** Hidden parts stay in the project but are not drawn or printed. */
export function setVisible(id: string, visible: boolean): void {
  const o = get(id)
  if (o.visible === visible) return
  o.visible = visible
  if (!visible) deselectObjects([id])
  touch()
}

/** Packs every part on the bed. Returns false (and tells the user) when they do not all fit. */
export function arrangeAll(): boolean {
  if (!scene.objects.length) return true
  const fits = arrange(scene.objects)
  for (const o of scene.objects) dropOne(o)
  touch()
  if (!fits) toast('info', 'Not everything fits on the bed. Objects in red are outside the printable area.')
  return fits
}

// ------------------------------------------------------------------ view / tools

/** Camera presets; 'fit' frames the whole plate, 'fit-selection' the selection (or the plate). */
export function setCameraView(v: CameraView): void {
  if (v === 'fit') viewBridge.fitAll()
  else if (v === 'fit-selection') viewBridge.fit()
  else viewBridge.setView(v)
}

export function setTool(t: Tool): void {
  ws.tool = t
  ws.layFlat = false
}
