import type { BufferGeometry } from 'three'

/** Binary STL of a non-indexed geometry (normals left zero; every reader recomputes them). */
export function encodeBinaryStl(geometry: BufferGeometry): Uint8Array {
  const pos = geometry.attributes.position.array as ArrayLike<number>
  const tris = pos.length / 9
  const buf = new ArrayBuffer(84 + tris * 50)
  const view = new DataView(buf)
  const header = 'FF Print'
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, tris, true)
  let o = 84
  for (let t = 0; t < tris; t++) {
    o += 12 // normal
    for (let k = 0; k < 9; k++) {
      view.setFloat32(o, pos[t * 9 + k], true)
      o += 4
    }
    o += 2 // attribute byte count
  }
  return new Uint8Array(buf)
}
