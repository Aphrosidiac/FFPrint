// Model files -> normalised meshes on the bed. STL and OBJ become one object per file; a 3MF becomes
// one object per build item (its own transform baked into the geometry), read by lib/threemf.ts.

import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh } from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { LoadedFile } from '@shared/types'
import { parseThreeMf } from './threemf'

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
  if (file.ext === '3mf') return parseFile(file).models
  throw new Error(`Unsupported file: ${file.name}.${file.ext}`)
}

export interface ParsedFile {
  models: ParsedModel[]
  /** Print settings saved in a Creality/Orca/Bambu project 3MF (the designer's intent) */
  projectSettings?: Record<string, unknown>
}

export function parseFile(file: LoadedFile): ParsedFile {
  if (file.ext !== '3mf') return { models: parseModel(file) }
  const r = parseThreeMf(file.bytes, file.name)
  return {
    models: r.objects.map((o) => {
      const g = new BufferGeometry()
      g.setAttribute('position', new BufferAttribute(o.positions, 3))
      return { name: o.name, geometry: g }
    }),
    projectSettings: r.projectSettings
  }
}
