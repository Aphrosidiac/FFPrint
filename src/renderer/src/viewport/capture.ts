// Job thumbnail for history: the parts on the bed from a fixed 3/4 front view, framed on the parts,
// on a transparent background. No bed, grid, gizmo or selection marks. Rendered with its own small
// offscreen renderer so it works whether or not the Prepare viewport is on screen.

import { Box3, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { meshes, objectMatrix, scene as store, worldBox } from '@/stores/scene'
import { readColors } from './colors'

const W = 320
const H = 240
const SS = 2 // supersampling factor

/** PNG data URL (320 x 240) of the visible parts, or '' when there is nothing to draw. */
export function captureThumbnail(): string {
  const objects = store.objects.filter((o) => o.visible && meshes.has(o.meshId))
  if (!objects.length) return ''

  let renderer: WebGLRenderer | null = null
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.outputColorSpace = SRGBColorSpace
    renderer.setPixelRatio(1)
    renderer.setSize(W * SS, H * SS, false)
    renderer.setClearColor(0x000000, 0)

    const s = new Scene()
    s.add(new HemisphereLight(0xffffff, 0x8a8f99, 1.6))
    const key = new DirectionalLight(0xffffff, 1.5)
    key.position.set(-120, -200, 320)
    const fill = new DirectionalLight(0xffffff, 0.55)
    fill.position.set(260, 300, 120)
    s.add(key, fill)

    const material = new MeshStandardMaterial({ color: readColors().object, roughness: 0.62, metalness: 0.02 })
    const box = new Box3()
    for (const o of objects) {
      const m = new Mesh(meshes.get(o.meshId)!.geometry, material)
      m.matrixAutoUpdate = false
      m.matrix.copy(objectMatrix(o))
      s.add(m)
      box.union(worldBox(o))
    }

    const camera = new PerspectiveCamera(30, W / H, 1, 10000)
    camera.up.set(0, 0, 1)
    const dir = new Vector3(-0.62, -1, 0.62).normalize()
    const target = box.getCenter(new Vector3())
    const fwd = dir.clone().negate()
    const right = new Vector3().crossVectors(fwd, camera.up).normalize()
    const up = new Vector3().crossVectors(right, fwd).normalize()
    const tanV = Math.tan((camera.fov * Math.PI) / 360)
    const tanH = tanV * camera.aspect
    let d = 0
    const p = new Vector3()
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target)
      const back = p.dot(dir)
      d = Math.max(d, back + Math.abs(p.dot(right)) / tanH, back + Math.abs(p.dot(up)) / tanV)
    }
    camera.position.copy(target).addScaledVector(dir, Math.max(d * 1.12, 20))
    camera.lookAt(target)
    camera.near = Math.max(0.5, d / 100)
    camera.far = d * 10 + 1000
    camera.updateProjectionMatrix()

    renderer.render(s, camera)
    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    const ctx = out.getContext('2d') as CanvasRenderingContext2D
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(renderer.domElement, 0, 0, W, H)
    material.dispose()
    return out.toDataURL('image/png')
  } catch {
    return ''
  } finally {
    if (renderer) {
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }
}
