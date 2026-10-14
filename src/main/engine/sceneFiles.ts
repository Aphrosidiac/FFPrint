// The scene as handed to the engine: one binary STL per placed object, its transform baked into the
// coordinates (printer mm). With `--arrange 0` the CLI keeps STL coordinates exactly (verified).
// Replaces the 3MF writer: for a 972k-triangle model the 3MF (vertex welding + ~60 MB of XML + zip)
// took 5.7 s; binary STL is a straight copy.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ScenePayload } from '@shared/types'

/** Binary STL of a triangle soup under a column-major 4x4 matrix (three.js order). Normals are
 *  written as zero; every slicer recomputes them from the winding. */
export function bakedStl(positions: Float32Array, e: number[]): Buffer {
  const tris = positions.length / 9
  const buf = Buffer.alloc(84 + tris * 50)
  buf.write('FF Print', 0, 'ascii')
  buf.writeUInt32LE(tris, 80)
  const f = new Float32Array(12)
  const out = new Uint8Array(f.buffer)
  let o = 84
  for (let t = 0; t < tris; t++) {
    f[0] = f[1] = f[2] = 0
    for (let k = 0; k < 3; k++) {
      const i = t * 9 + k * 3
      const x = positions[i], y = positions[i + 1], z = positions[i + 2]
      f[3 + k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
      f[4 + k * 3] = e[1] * x + e[5] * y + e[9] * z + e[13]
      f[5 + k * 3] = e[2] * x + e[6] * y + e[10] * z + e[14]
    }
    buf.set(out, o)
    o += 50 // 48 bytes of floats + 2-byte attribute count (zero)
  }
  return buf
}

/** Writes the scene's objects into `dir` and returns the file names, in instance order. */
export function writeSceneStls(scene: ScenePayload, dir: string): string[] {
  const meshes = new Map(scene.meshes.map((m) => [m.id, m.positions]))
  return scene.instances.map((inst, i) => {
    const positions = meshes.get(inst.meshId)
    if (!positions) throw new Error(`Object "${inst.name}" refers to a missing mesh`)
    const safe = inst.name.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'object'
    const file = `${String(i + 1).padStart(2, '0')}_${safe}.stl`
    writeFileSync(join(dir, file), bakedStl(positions, inst.matrix))
    return file
  })
}
