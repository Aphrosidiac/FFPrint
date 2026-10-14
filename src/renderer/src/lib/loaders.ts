// Model files -> normalised meshes on the bed. STL and OBJ become one object per file; a 3MF becomes
// one object per build item (its own transform baked into the geometry).

import { BufferGeometry, Group, Matrix4, Mesh } from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { LoadedFile } from '@shared/types'

export interface ParsedModel {
  name: string
  geometry: BufferGeometry
}

function positionsOnly(g: BufferGeometry, m?: Matrix4): BufferGeometry {
  const out = new BufferGeometry()
  const src = g.index ? g.toNonIndexed() : g
  out.setAttribute('position', src.getAttribute('position').clone())
  if (m) out.applyMatrix4(m)
  return out
}

function meshesOf(root: Group): { mesh: Mesh; matrix: Matrix4 }[] {
  root.updateMatrixWorld(true)
  const out: { mesh: Mesh; matrix: Matrix4 }[] = []
  root.traverse((c) => {
    if ((c as Mesh).isMesh) out.push({ mesh: c as Mesh, matrix: c.matrixWorld.clone() })
  })
  return out
}

const ab = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

export function parseModel(file: LoadedFile): ParsedModel[] {
  if (file.ext === 'stl') {
    return [{ name: file.name, geometry: positionsOnly(new STLLoader().parse(ab(file.bytes))) }]
  }
  if (file.ext === 'obj') {
    const group = new OBJLoader().parse(new TextDecoder().decode(file.bytes))
    const parts = meshesOf(group).map(({ mesh, matrix }) => positionsOnly(mesh.geometry, matrix))
    if (!parts.length) throw new Error(`${file.name}.obj has no geometry.`)
    // OBJ files are usually Y-up; printers are Z-up.
    const merged = mergeGeometries(parts) as BufferGeometry
    merged.rotateX(Math.PI / 2)
    return [{ name: file.name, geometry: merged }]
  }
  if (file.ext === '3mf') {
    const group = new ThreeMFLoader().parse(ab(file.bytes)) as unknown as Group
    // ThreeMFLoader wraps the build in a Y-up group (rotation -90° about X); undo it so we stay Z-up.
    group.rotation.set(0, 0, 0)
    group.updateMatrixWorld(true)
    const items = group.children.length ? group.children : [group]
    const out: ParsedModel[] = []
    items.forEach((item, i) => {
      const parts = meshesOf(item as Group).map(({ mesh, matrix }) => positionsOnly(mesh.geometry, matrix))
      if (!parts.length) return
      const geometry = parts.length === 1 ? parts[0] : (mergeGeometries(parts) as BufferGeometry)
      const name = item.name && item.name !== '' ? item.name : items.length > 1 ? `${file.name} ${i + 1}` : file.name
      out.push({ name, geometry })
    })
    if (!out.length) throw new Error(`${file.name}.3mf has no printable objects.`)
    return out
  }
  throw new Error(`Unsupported file: ${file.name}.${file.ext}`)
}
