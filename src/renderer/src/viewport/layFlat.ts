// "Lay on face": find the flat region a picked triangle belongs to (every triangle on the same plane
// facing the same way), so the viewport can highlight it before the click commits.

import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

export interface FaceRegion {
  key: string
  /** outward normal in the mesh's local space */
  normal: Vector3
  geometry: BufferGeometry
  triangles: number
}

const a = new Vector3()
const b = new Vector3()
const c = new Vector3()
const n = new Vector3()
const ab = new Vector3()

function triNormal(p: ArrayLike<number>, t: number, out: Vector3): Vector3 {
  const i = t * 9
  a.set(p[i], p[i + 1], p[i + 2])
  b.set(p[i + 3], p[i + 4], p[i + 5])
  c.set(p[i + 6], p[i + 7], p[i + 8])
  return out.subVectors(c, b).cross(ab.subVectors(a, b)).normalize()
}

const cache = new WeakMap<BufferGeometry, Map<string, FaceRegion>>()

/** The coplanar region of triangle `faceIndex` in a non-indexed geometry. */
export function faceRegion(geometry: BufferGeometry, faceIndex: number): FaceRegion | null {
  const p = geometry.attributes.position.array as ArrayLike<number>
  const tris = p.length / 9
  if (faceIndex < 0 || faceIndex >= tris) return null
  const normal = triNormal(p, faceIndex, new Vector3())
  if (!Number.isFinite(normal.x) || normal.lengthSq() < 0.5) return null
  const d = normal.dot(a.set(p[faceIndex * 9], p[faceIndex * 9 + 1], p[faceIndex * 9 + 2]))
  // Plane key at 0.01 mm / ~0.5 deg resolution, so neighbouring picks on one face share the result.
  const key = `${normal.x.toFixed(3)},${normal.y.toFixed(3)},${normal.z.toFixed(3)},${d.toFixed(2)}`
  let byKey = cache.get(geometry)
  if (!byKey) cache.set(geometry, (byKey = new Map()))
  const hit = byKey.get(key)
  if (hit) return hit

  const cosTol = Math.cos((1 * Math.PI) / 180)
  const out: number[] = []
  for (let t = 0; t < tris; t++) {
    triNormal(p, t, n)
    if (n.dot(normal) < cosTol) continue
    const i = t * 9
    if (Math.abs(normal.x * p[i] + normal.y * p[i + 1] + normal.z * p[i + 2] - d) > 0.05) continue
    for (let k = 0; k < 9; k++) out.push(p[i + k])
    // keep the overlay small on dense scans; the highlight only needs to read as "this face"
    if (out.length > 9 * 200_000) break
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(out, 3))
  const region: FaceRegion = { key, normal, geometry: g, triangles: out.length / 9 }
  if (byKey.size > 32) {
    for (const r of byKey.values()) r.geometry.dispose()
    byKey.clear()
  }
  byKey.set(key, region)
  return region
}
