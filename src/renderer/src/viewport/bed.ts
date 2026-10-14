// The Ender-3 V3 SE build plate at real scale: Creality's own bed model (spring-steel sheet with its
// front grip tab) under the 220 x 220 printable area, the printed sheet markings, a faint 10 / 50 mm
// grid, the printable-area edge, a faint 250 mm build volume, the purge-line lane and an origin mark.
//
// The bed model's origin is the bed centre (as in Orca / Creality Print's bed_model), so it is placed
// at (110, 110, 0); its top surface is Z = 0.

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  PlaneGeometry,
  TextureLoader
} from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { MACHINE } from '@shared/machine'
import bedStlUrl from '@/assets/bed/v3se_bed.stl?url'
import bedTextureUrl from '@/assets/bed/v3se_bed_texture.png?url'
import type { ViewColors } from './colors'

const BX = MACHINE.bed.x
const BY = MACHINE.bed.y
const BZ = MACHINE.maxZ

/** Footprint of the physical plate in printer coordinates (bed model bounds + (110, 110)). */
export const PLATE_BOUNDS = { minX: -7.5, maxX: 227.5, minY: -22.5, maxY: 227.55, minZ: -5.25 }

function lines(points: number[]): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(points, 3))
  return g
}

/** Binary file over XHR: works for http (dev) and file:// (built app), where fetch() does not. */
function loadBytes(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.responseType = 'arraybuffer'
    xhr.onload = () => (xhr.response ? resolve(xhr.response as ArrayBuffer) : reject(new Error('empty response')))
    xhr.onerror = () => reject(new Error(`could not load ${url}`))
    xhr.send()
  })
}

export interface Bed {
  group: Group
  applyColors(c: ViewColors): void
  dispose(): void
}

export function createBed(onLoaded: () => void): Bed {
  const group = new Group()
  group.name = 'bed'

  // Physical plate (frame tone) from Creality's model; shown once loaded.
  const frameMat = new MeshStandardMaterial({ roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })
  const plate = new Mesh(new BufferGeometry(), frameMat)
  plate.position.set(BX / 2, BY / 2, 0)
  plate.renderOrder = -3
  plate.visible = false
  loadBytes(bedStlUrl)
    .then((buf) => {
      const g = new STLLoader().parse(buf)
      g.deleteAttribute('normal')
      g.computeVertexNormals()
      plate.geometry.dispose()
      plate.geometry = g
      plate.visible = true
      onLoaded()
    })
    .catch(() => {
      /* the printable surface below still shows the bed */
    })

  // Printable surface: the PEI sheet tone over exactly 220 x 220.
  const surfaceMat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const surface = new Mesh(new PlaneGeometry(BX, BY), surfaceMat)
  surface.position.set(BX / 2, BY / 2, 0)
  surface.renderOrder = -2

  // Sheet markings (logo tab, corner marks, edge lines). The texture is dark grey on transparent;
  // it is drawn inverted and tinted, so the marks print light on the dark sheet like the real one.
  const marksMat = new MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  marksMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 tx = texture2D( map, vMapUv );
        diffuseColor.rgb *= ( 1.0 - tx.rgb );
        diffuseColor.a *= tx.a;
      #endif`
    )
  }
  const marks = new Mesh(new PlaneGeometry(BX, BY), marksMat)
  marks.position.set(BX / 2, BY / 2, 0.02)
  marks.renderOrder = -1
  marks.visible = false
  new TextureLoader().load(bedTextureUrl, (tex) => {
    tex.colorSpace = NoColorSpace
    tex.anisotropy = 8
    tex.minFilter = LinearMipmapLinearFilter
    tex.magFilter = LinearFilter
    marksMat.map = tex
    marksMat.needsUpdate = true
    marks.visible = true
    onLoaded()
  })

  const minor: number[] = []
  const major: number[] = []
  const z = 0.03
  for (let x = 10; x < BX; x += 10) (x % 50 === 0 ? major : minor).push(x, 0, z, x, BY, z)
  for (let y = 10; y < BY; y += 10) (y % 50 === 0 ? major : minor).push(0, y, z, BX, y, z)
  const gridMat = (): LineBasicMaterial => new LineBasicMaterial({ transparent: true, depthWrite: false })
  const minorLines = new LineSegments(lines(minor), gridMat())
  const majorLines = new LineSegments(lines(major), gridMat())
  minorLines.renderOrder = 0
  majorLines.renderOrder = 0

  const edge = new LineSegments(lines([0, 0, z, BX, 0, z, BX, 0, z, BX, BY, z, BX, BY, z, 0, BY, z, 0, BY, z, 0, 0, z]), gridMat())

  // Build volume: vertical corner posts and the top rectangle, very light.
  const v: number[] = []
  const corners = [
    [0, 0],
    [BX, 0],
    [BX, BY],
    [0, BY]
  ]
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i]
    const [bx, by] = corners[(i + 1) % 4]
    v.push(ax, ay, 0, ax, ay, BZ, ax, ay, BZ, bx, by, BZ)
  }
  const volume = new LineSegments(lines(v), gridMat())

  // The purge line runs on the plate just off the left edge (X -2.1 / -2.4, Y 20-145).
  const purge = new LineSegments(lines([-2.25, 20, z, -2.25, 145, z]), gridMat())

  // Origin: a small L at the front-left corner of the printable area.
  const origin = new LineSegments(lines([0, 0, z * 2, 12, 0, z * 2, 0, 0, z * 2, 0, 12, z * 2]), new LineBasicMaterial())

  group.add(plate, surface, marks, minorLines, majorLines, edge, volume, purge, origin)

  return {
    group,
    applyColors(c) {
      frameMat.color.copy(c.plateFrame)
      surfaceMat.color.copy(c.plateSurface)
      marksMat.color.copy(c.plateMarks)
      const set = (l: LineSegments, color: ViewColors['accent'], opacity: number): void => {
        const m = l.material as LineBasicMaterial
        m.color.copy(color)
        m.opacity = opacity
      }
      set(minorLines, c.plateGrid, 0.5)
      set(majorLines, c.plateGrid, 0.95)
      set(edge, c.plateEdge, 1)
      set(volume, c.edge, c.dark ? 0.4 : 0.35)
      set(purge, c.plateMarks, 0.5)
      ;(origin.material as LineBasicMaterial).color.copy(c.accent)
    },
    dispose() {
      marksMat.map?.dispose()
      group.traverse((o) => {
        const m = o as Mesh
        m.geometry?.dispose()
        ;(m.material as MeshStandardMaterial | undefined)?.dispose?.()
      })
    }
  }
}
