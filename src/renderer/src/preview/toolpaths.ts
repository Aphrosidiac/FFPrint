// three.js side of the preview: the bed, one instanced "tube" mesh per feature type and thin travel
// lines. Every extrusion segment is one instance of an 8-vertex, 4-sided tube (diamond cross-section,
// smooth normals) so neighbouring lines stay readable from any angle. The layer range is a pair of
// uniforms: instances outside it collapse in the vertex shader, and instanceCount stops the draw at the
// top layer, so moving the slider never touches a buffer. Renders on demand only.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  MOUSE
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MACHINE } from '@shared/machine'
import { createBed, type Bed } from '@/viewport/bed'
import { readColors } from '@/viewport/colors'
import { SEG_STRIDE, type ParsedGcode } from './gcodeParse'
import { featureStyle, TRAVEL_COLOR } from './palette'

export type PreviewViewName = 'iso' | 'top' | 'front'

const TUBE_VERT = /* glsl */ `
uniform float uWidth;
uniform vec2 uRange;
attribute vec4 aStart;
attribute vec4 aEnd;
varying vec3 vN;
varying float vLayer;
void main() {
  float layer = aStart.w;
  vLayer = layer;
  if (layer < uRange.x - 0.5 || layer > uRange.y + 0.5) {
    vN = vec3(0.0);
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec3 a = aStart.xyz;
  vec3 b = aEnd.xyz;
  vec2 d = b.xy - a.xy;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  vec3 side = vec3(-dir.y, dir.x, 0.0);
  // position.x = 0 (start) or 1 (end); ends overlap by half a width so corners close.
  float ext = uWidth * 0.5;
  vec3 p = position.x < 0.5 ? a - vec3(dir * ext, 0.0) : b + vec3(dir * ext, 0.0);
  p += side * (position.y * uWidth) + vec3(0.0, 0.0, position.z * aEnd.w);
  vN = normalMatrix * (side * normal.x + vec3(0.0, 0.0, normal.y));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const TUBE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTop;
uniform float uDim;
varying vec3 vN;
varying float vLayer;
void main() {
  vec3 n = normalize(vN);
  vec3 l = normalize(vec3(-0.35, 0.55, 0.75));
  float diff = max(dot(n, l), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 c = uColor * (0.36 + 0.5 * diff + 0.16 * hemi);
  if (uDim > 0.5 && vLayer < uTop - 0.5) c *= 0.7;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

const TRAVEL_VERT = /* glsl */ `
uniform vec2 uRange;
attribute float aLayer;
void main() {
  if (aLayer < uRange.x - 0.5 || aLayer > uRange.y + 0.5) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const TRAVEL_FRAG = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 0.75);
  #include <colorspace_fragment>
}`

/** One tube: 4 cross-section points (top, side, bottom, side) at each end. */
function tubeTemplate(): { position: Float32Array; normal: Float32Array; index: Uint16Array } {
  // (across in widths, up in layer heights from the top) and the matching normal (across, up)
  const ring = [
    [0, 0, 0, 1],
    [0.5, -0.5, 1, 0],
    [0, -1, 0, -1],
    [-0.5, -0.5, -1, 0]
  ]
  const position: number[] = []
  const normal: number[] = []
  for (let t = 0; t < 2; t++)
    for (const [ax, up, nx, ny] of ring) {
      position.push(t, ax, up)
      normal.push(nx, ny, 0)
    }
  const index: number[] = []
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4
    const v0 = k
    const v1 = k1
    const v2 = 4 + k1
    const v3 = 4 + k
    index.push(v0, v2, v1, v0, v3, v2)
  }
  return { position: new Float32Array(position), normal: new Float32Array(normal), index: new Uint16Array(index) }
}

interface FeatureMesh {
  type: string
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  layerEnd: Uint32Array
}

export class PreviewScene {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(30, 1, 0.5, 6000)
  readonly controls: OrbitControls
  private bed: Bed
  private features: FeatureMesh[] = []
  private travel: { mesh: LineSegments<BufferGeometry, ShaderMaterial>; layerEnd: Uint32Array } | null = null
  private template = tubeTemplate()
  private range: [number, number] = [0, 0]
  private layerCount = 0
  private bounds: { min: Vector3; max: Vector3 } | null = null
  private frame = 0
  private ro: ResizeObserver
  private mo: MutationObserver
  /** last frame's draw time (ms), for diagnostics */
  lastFrameMs = 0

  constructor(private host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.outputColorSpace = SRGBColorSpace
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'

    this.camera.up.set(0, 0, 1)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.screenSpacePanning = true
    this.controls.zoomToCursor = true
    // Same mouse as Prepare: right/left-drag spin, middle-drag (or Shift+drag) pans.
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }
    this.controls.addEventListener('change', () => this.requestRender())

    // Same lights as the Prepare workspace (the bed model uses a lit material).
    this.scene.add(new HemisphereLight(0xffffff, 0x8a8f99, 1.6))
    const key = new DirectionalLight(0xffffff, 1.5)
    key.position.set(-120, -200, 320)
    const fill = new DirectionalLight(0xffffff, 0.55)
    fill.position.set(260, 300, 120)
    this.scene.add(key, fill)

    this.bed = createBed(() => this.requestRender())
    this.scene.add(this.bed.group)
    this.applyTheme()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(host)
    this.mo = new MutationObserver(() => this.applyTheme())
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    this.resize()
    this.setView('iso')
  }

  applyTheme(): void {
    const c = readColors()
    this.scene.background = c.background
    this.bed.applyColors(c)
    this.requestRender()
  }

  resize(): void {
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.requestRender()
  }

  requestRender(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      const t = performance.now()
      this.renderer.render(this.scene, this.camera)
      this.lastFrameMs = performance.now() - t
    })
  }

  /** Replace the toolpaths. Buffers are used as-is (no copies). */
  load(p: ParsedGcode, visible: (type: string) => boolean, travelVisible: boolean): void {
    this.clearPaths()
    this.layerCount = p.layers.length
    const { position, normal, index } = this.template
    for (const f of p.features) {
      const g = new InstancedBufferGeometry()
      g.setIndex(new BufferAttribute(index, 1))
      g.setAttribute('position', new BufferAttribute(position, 3))
      g.setAttribute('normal', new BufferAttribute(normal, 3))
      const ib = new InstancedInterleavedBuffer(f.segments, SEG_STRIDE, 1)
      g.setAttribute('aStart', new InterleavedBufferAttribute(ib, 4, 0))
      g.setAttribute('aEnd', new InterleavedBufferAttribute(ib, 4, 4))
      g.instanceCount = f.count
      const m = new ShaderMaterial({
        vertexShader: TUBE_VERT,
        fragmentShader: TUBE_FRAG,
        uniforms: {
          uColor: { value: new Color(featureStyle(f.type).color) },
          uWidth: { value: Math.min(0.8, Math.max(0.2, f.width)) },
          uRange: { value: [0, 1e9] },
          uTop: { value: 0 },
          uDim: { value: 0 }
        }
      })
      const mesh = new Mesh(g, m)
      mesh.frustumCulled = false
      mesh.visible = visible(f.type)
      this.scene.add(mesh)
      this.features.push({ type: f.type, mesh, layerEnd: f.layerEnd })
    }

    const t = p.travel
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(t.positions, 3))
    const perVertex = new Float32Array(t.count * 2)
    for (let i = 0; i < t.count; i++) perVertex[i * 2] = perVertex[i * 2 + 1] = t.layers[i]
    g.setAttribute('aLayer', new Float32BufferAttribute(perVertex, 1))
    const tm = new ShaderMaterial({
      vertexShader: TRAVEL_VERT,
      fragmentShader: TRAVEL_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new Color(TRAVEL_COLOR) }, uRange: { value: [0, 1e9] } }
    })
    const lines = new LineSegments(g, tm)
    lines.frustumCulled = false
    lines.visible = travelVisible
    this.scene.add(lines)
    this.travel = { mesh: lines, layerEnd: t.layerEnd }

    this.bounds = p.bounds ? { min: new Vector3(...p.bounds.min), max: new Vector3(...p.bounds.max) } : null
    this.setRange(0, this.layerCount - 1)
  }

  setRange(min: number, max: number): void {
    const last = Math.max(0, this.layerCount - 1)
    const lo = Math.max(0, Math.min(min, last))
    const hi = Math.max(lo, Math.min(max, last))
    this.range = [lo, hi]
    for (const f of this.features) {
      f.mesh.geometry.instanceCount = f.layerEnd[hi] ?? 0
      const u = f.mesh.material.uniforms
      u.uRange.value = [lo, hi]
      u.uTop.value = hi
      u.uDim.value = hi < last ? 1 : 0
    }
    if (this.travel) {
      this.travel.mesh.geometry.setDrawRange(0, (this.travel.layerEnd[hi] ?? 0) * 2)
      this.travel.mesh.material.uniforms.uRange.value = [lo, hi]
    }
    this.requestRender()
  }

  setFeatureVisible(type: string, on: boolean): void {
    for (const f of this.features) if (f.type === type) f.mesh.visible = on
    this.requestRender()
  }

  setTravelVisible(on: boolean): void {
    if (this.travel) this.travel.mesh.visible = on
    this.requestRender()
  }

  /** Part bounds (or the bed when there is nothing yet). */
  private box(): { centre: Vector3; radius: number } {
    if (this.bounds) {
      const centre = this.bounds.min.clone().add(this.bounds.max).multiplyScalar(0.5)
      // keep some bed in view around small parts
      const radius = Math.max(60, this.bounds.max.clone().sub(this.bounds.min).length() / 2)
      return { centre, radius }
    }
    const centre = new Vector3(MACHINE.bed.x / 2, MACHINE.bed.y / 2, 0)
    return { centre, radius: Math.hypot(MACHINE.bed.x, MACHINE.bed.y) / 2 }
  }

  setView(v: PreviewViewName): void {
    const dir = v === 'top' ? new Vector3(0, -0.0001, 1) : v === 'front' ? new Vector3(0, -1, 0.0001) : new Vector3(-0.55, -1, 0.85)
    this.frameAlong(dir.normalize())
  }

  fit(): void {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    this.frameAlong(dir)
  }

  private frameAlong(dir: Vector3): void {
    const { centre, radius } = this.box()
    const vfov = (this.camera.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect)
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.08
    this.controls.target.copy(centre)
    this.camera.position.copy(centre).addScaledVector(dir, dist)
    this.camera.near = Math.max(0.1, dist / 500)
    this.camera.far = dist * 20 + 2000
    this.camera.updateProjectionMatrix()
    this.controls.update()
    this.requestRender()
  }

  get currentRange(): [number, number] {
    return this.range
  }

  private clearPaths(): void {
    for (const f of this.features) {
      this.scene.remove(f.mesh)
      f.mesh.geometry.dispose()
      f.mesh.material.dispose()
    }
    this.features = []
    if (this.travel) {
      this.scene.remove(this.travel.mesh)
      this.travel.mesh.geometry.dispose()
      this.travel.mesh.material.dispose()
      this.travel = null
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.ro.disconnect()
    this.mo.disconnect()
    this.clearPaths()
    this.bed.dispose()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
