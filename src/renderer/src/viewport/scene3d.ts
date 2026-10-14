// The Prepare viewport: a three.js scene of the V3 SE build volume kept in sync with the scene store.
// Z-up printer coordinates (bed 0..220 on X/Y, Z = 0 is the bed surface). Renders on demand only:
// a frame is drawn when the store, the camera, the gizmo or the theme changes, never in an idle loop.

import {
  Box3,
  BufferGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  MOUSE
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import {
  boxCentre,
  dropToBed,
  issues,
  meshes,
  objectMatrix,
  objectQuaternion,
  scene as store,
  select,
  setObjectQuaternion,
  touch,
  worldBox,
  type SceneObject,
  type Vec3
} from '@/stores/scene'
import { createBed, PLATE_BOUNDS, type Bed } from './bed'
import { readColors, type ViewColors } from './colors'
import { faceRegion, type FaceRegion } from './layFlat'
import { layFlatOnFace } from './actions'
import { ws, type View } from './workspace'

const DIRS: Record<View, Vector3> = {
  iso: new Vector3(-0.5, -1.15, 0.95).normalize(),
  top: new Vector3(0, -0.0001, 1).normalize(),
  front: new Vector3(0, -1, 0.0001).normalize(),
  left: new Vector3(-1, 0, 0.0001).normalize(),
  right: new Vector3(1, 0, 0.0001).normalize()
}

const CLICK_SLOP = 4
const SNAP = 5
const BLOCKING = new Set(['outside', 'too-tall', 'below-bed'])

interface Hit {
  object: SceneObject
  mesh: Mesh
  point: Vector3
  faceIndex: number
}

interface MoveGesture {
  kind: 'object'
  id: string
  wasSelected: boolean
  additive: boolean
  pointerId: number
  dragging: boolean
  planeZ: number
  start: Vector3
  starts: { o: SceneObject; x: number; y: number }[]
  primaryCentre: Vector3
}

interface GizmoStart {
  o: SceneObject
  p0: Vector3
  q0: Quaternion
  s0: Vec3
  centre: Vector3
}

export interface ContextMenuRequest {
  x: number
  y: number
  /** object under the cursor, or null for the plate / empty space */
  id: string | null
}

export class Workspace3D {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(32, 1, 1, 10000)
  readonly orbit: OrbitControls
  readonly gizmo: TransformControls
  onContextMenu: (r: ContextMenuRequest) => void = () => {}

  private container: HTMLElement
  private bed: Bed
  private objects = new Object3D()
  private objMeshes = new Map<string, Mesh>()
  private knownGeometries = new Set<BufferGeometry>()
  private brackets: LineSegments
  private proxy = new Object3D()
  private overlay: Mesh | null = null
  private overlayRegion: FaceRegion | null = null
  private overlayObject: string | null = null
  private colors: ViewColors
  private mats: { normal: MeshStandardMaterial; selected: MeshStandardMaterial; danger: MeshStandardMaterial; overlay: MeshBasicMaterial }
  private raycaster = new Raycaster()
  private pointer = new Vector2()
  private frame = 0
  private width = 0
  private height = 0
  private fitted = false
  private gesture: MoveGesture | { kind: 'empty'; additive: boolean } | { kind: 'gizmo' } | { kind: 'layflat'; hit: Hit } | null = null
  private down = { x: 0, y: 0, button: -1, moved: false }
  private gizmoStart: { pivot: Vector3; q: Quaternion; items: GizmoStart[] } | null = null
  private hoverQueued = false
  private lastMove: PointerEvent | null = null
  private resizeObs: ResizeObserver
  private themeObs: MutationObserver
  private disposed = false

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    const canvas = this.renderer.domElement
    canvas.className = 'vp-canvas'
    canvas.tabIndex = -1
    container.prepend(canvas)

    this.colors = readColors()
    this.mats = {
      normal: new MeshStandardMaterial({ roughness: 0.62, metalness: 0.02 }),
      selected: new MeshStandardMaterial({ roughness: 0.62, metalness: 0.02 }),
      danger: new MeshStandardMaterial({ roughness: 0.62, metalness: 0.02 }),
      overlay: new MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    }

    this.camera.up.set(0, 0, 1)
    this.scene.add(new HemisphereLight(0xffffff, 0x8a8f99, 1.6))
    const key = new DirectionalLight(0xffffff, 1.5)
    key.position.set(-120, -200, 320)
    const fill = new DirectionalLight(0xffffff, 0.55)
    fill.position.set(260, 300, 120)
    this.scene.add(key, fill)

    this.bed = createBed(() => this.requestRender())
    this.scene.add(this.bed.group)
    this.scene.add(this.objects)

    this.brackets = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ transparent: true, opacity: 0.95 }))
    this.brackets.renderOrder = 2
    this.scene.add(this.brackets)

    this.orbit = new OrbitControls(this.camera, canvas)
    this.orbit.enableDamping = false
    this.orbit.screenSpacePanning = true
    this.orbit.zoomToCursor = true
    this.orbit.minDistance = 8
    this.orbit.maxDistance = 3000
    // Right-drag spins the view around the plate (Fakhrul's choice), as does left-drag on empty space;
    // middle-drag pans. OrbitControls turns a rotate drag into a pan while Shift/Ctrl is held.
    this.orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }
    this.orbit.addEventListener('change', () => this.requestRender())

    this.scene.add(this.proxy)
    this.gizmo = new TransformControls(this.camera, canvas)
    this.gizmo.setSize(0.9)
    this.gizmo.addEventListener('change', () => this.requestRender())
    this.gizmo.addEventListener('dragging-changed', (e) => {
      const dragging = (e as unknown as { value: boolean }).value
      this.orbit.enabled = !dragging
      if (dragging) this.gizmoBegin()
      else this.gizmoEnd()
    })
    this.gizmo.addEventListener('objectChange', () => this.gizmoApply())
    this.scene.add(this.gizmo.getHelper())

    this.applyColors()

    container.addEventListener('pointerdown', this.onPointerDown, true)
    container.addEventListener('pointermove', this.onPointerMove, true)
    container.addEventListener('pointerup', this.onPointerUp, true)
    container.addEventListener('pointercancel', this.onPointerUp, true)
    canvas.addEventListener('contextmenu', this.onContextMenuEvent)
    canvas.addEventListener('pointerleave', this.onPointerLeave)

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(container)
    this.themeObs = new MutationObserver(() => {
      this.applyColors()
      this.requestRender()
    })
    this.themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] })

    this.resize()
    this.sync()
  }

  // ------------------------------------------------------------------ rendering

  requestRender = (): void => {
    if (this.frame || this.disposed) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (!this.width || !this.height) return
      this.renderer.render(this.scene, this.camera)
    })
  }

  private resize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    if (w === this.width && h === this.height) return
    this.width = w
    this.height = h
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (!this.fitted) {
      this.fitted = true
      this.setView('iso')
    }
    this.requestRender()
  }

  private applyColors(): void {
    const c = (this.colors = readColors())
    this.renderer.setClearColor(c.background, 1)
    this.bed.applyColors(c)
    this.mats.normal.color.copy(c.object)
    this.mats.selected.color.copy(c.objectSelected)
    this.mats.danger.color.copy(c.objectDanger)
    this.mats.overlay.color.copy(c.accent)
    ;(this.brackets.material as LineBasicMaterial).color.copy(c.accent)
    // Gizmo axes in the theme's own red / green / blue instead of pure RGB.
    const remap: Record<number, ReturnType<typeof readColors>['danger']> = { 0xff0000: c.danger, 0x00ff00: c.success, 0x0000ff: c.accent }
    this.gizmo.getHelper().traverse((o) => {
      const m = (o as Mesh).material as (Material & { color?: import('three').Color; _color?: import('three').Color }) | undefined
      if (!m || !m.color) return
      if (m.userData.origHex === undefined) m.userData.origHex = m.color.getHex()
      const to = remap[m.userData.origHex as number]
      if (!to) return
      m.color.copy(to)
      if (m._color) m._color.copy(to)
    })
  }

  // ------------------------------------------------------------------ camera

  /** Distance along `dir` at which every corner of `box` is inside the frustum. */
  private fitDistance(box: Box3, dir: Vector3, target: Vector3): number {
    const fwd = dir.clone().negate()
    const right = new Vector3().crossVectors(fwd, this.camera.up).normalize()
    const up = new Vector3().crossVectors(right, fwd).normalize()
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360)
    const tanH = tanV * this.camera.aspect
    let d = 0
    const p = new Vector3()
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target)
      const back = p.dot(dir)
      d = Math.max(d, back + Math.abs(p.dot(right)) / tanH, back + Math.abs(p.dot(up)) / tanV)
    }
    return d
  }

  private frameBox(box: Box3, dir: Vector3, margin = 1.08): void {
    const target = box.getCenter(new Vector3())
    const d = Math.max(this.fitDistance(box, dir, target) * margin, 30)
    this.camera.position.copy(target).addScaledVector(dir, d)
    this.orbit.target.copy(target)
    this.camera.lookAt(target)
    this.orbit.update()
    this.requestRender()
  }

  private contentBox(): Box3 {
    const box = new Box3(new Vector3(PLATE_BOUNDS.minX, PLATE_BOUNDS.minY, 0), new Vector3(PLATE_BOUNDS.maxX, PLATE_BOUNDS.maxY, 0))
    for (const o of store.objects) if (o.visible) box.union(worldBox(o))
    return box
  }

  setView(v: View): void {
    this.frameBox(this.contentBox(), DIRS[v], v === 'iso' ? 1.02 : 1.06)
  }

  /** Frames the whole plate and every visible part, keeping the current viewing direction. */
  fitAll(): void {
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize()
    this.frameBox(this.contentBox(), dir, 1.04)
  }

  /** Fits the selection (or the whole bed) keeping the current viewing direction. */
  fit(): void {
    const sel = store.objects.filter((o) => o.visible && store.selection.includes(o.id))
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize()
    if (!sel.length) return this.frameBox(this.contentBox(), dir, 1.04)
    const box = new Box3()
    for (const o of sel) box.union(worldBox(o))
    this.frameBox(box, dir, 1.6)
  }

  /** Client (page) coordinates of a world point, for tests and automation. */
  project(x: number, y: number, z: number): { x: number; y: number } {
    const p = new Vector3(x, y, z).project(this.camera)
    const r = this.renderer.domElement.getBoundingClientRect()
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
  }

  // ------------------------------------------------------------------ store sync

  sync(): void {
    if (this.disposed) return
    const live = new Set<string>()
    const selection = new Set(store.selection)
    for (const o of store.objects) {
      const entry = meshes.get(o.meshId)
      if (!entry) continue
      live.add(o.id)
      let mesh = this.objMeshes.get(o.id)
      if (!mesh || mesh.geometry !== entry.geometry) {
        if (mesh) this.objects.remove(mesh)
        mesh = new Mesh(entry.geometry, this.mats.normal)
        mesh.matrixAutoUpdate = false
        mesh.userData.id = o.id
        this.objMeshes.set(o.id, mesh)
        this.objects.add(mesh)
        this.knownGeometries.add(entry.geometry)
      }
      mesh.visible = o.visible
      mesh.matrix.copy(objectMatrix(o))
      mesh.matrixWorldNeedsUpdate = true
      const bad = o.visible && issues(o).some((i) => BLOCKING.has(i))
      // in lay-flat mode parts stay neutral so the highlighted face stands out
      mesh.material = bad ? this.mats.danger : selection.has(o.id) && !ws.layFlat ? this.mats.selected : this.mats.normal
    }
    for (const [id, mesh] of this.objMeshes) {
      if (live.has(id)) continue
      this.objects.remove(mesh)
      this.objMeshes.delete(id)
      if (this.overlayObject === id) this.clearOverlay()
    }
    // Free GPU buffers of meshes the store no longer has.
    const inStore = new Set([...meshes.values()].map((m) => m.geometry))
    for (const g of this.knownGeometries) {
      if (inStore.has(g)) continue
      g.dispose()
      this.knownGeometries.delete(g)
    }
    this.updateBrackets()
    this.updateGizmo()
    if (!ws.layFlat) this.clearOverlay()
    this.requestRender()
  }

  /** Accent corner brackets around each selected object's world box. */
  private updateBrackets(): void {
    const pts: number[] = []
    for (const o of store.objects) {
      if (!o.visible || !store.selection.includes(o.id) || ws.layFlat) continue
      const b = worldBox(o)
      if (b.isEmpty()) continue
      const pad = 0.6
      const mn = b.min.clone().subScalar(pad)
      const mx = b.max.clone().addScalar(pad)
      mn.z = Math.max(mn.z, b.min.z)
      const len = (a: number): number => Math.min(10, (a + 2 * pad) * 0.22)
      const lx = len(b.max.x - b.min.x)
      const ly = len(b.max.y - b.min.y)
      const lz = len(b.max.z - b.min.z)
      for (let i = 0; i < 8; i++) {
        const x = i & 1 ? mx.x : mn.x
        const y = i & 2 ? mx.y : mn.y
        const z = i & 4 ? mx.z : mn.z
        const sx = i & 1 ? -1 : 1
        const sy = i & 2 ? -1 : 1
        const sz = i & 4 ? -1 : 1
        pts.push(x, y, z, x + sx * lx, y, z, x, y, z, x, y + sy * ly, z, x, y, z, x, y, z + sz * lz)
      }
    }
    const g = this.brackets.geometry
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    g.computeBoundingSphere()
    this.brackets.visible = pts.length > 0
  }

  // ------------------------------------------------------------------ gizmo (rotate / scale)

  private selectedVisible(): SceneObject[] {
    return store.objects.filter((o) => o.visible && store.selection.includes(o.id))
  }

  updateGizmo(): void {
    if (this.gizmoStart) return // mid-drag: leave the proxy where the drag put it
    const sel = this.selectedVisible()
    const show = !ws.layFlat && ws.tool !== 'move' && sel.length > 0
    if (!show) {
      if (this.gizmo.object) this.gizmo.detach()
      this.requestRender()
      return
    }
    const centre = new Box3()
    for (const o of sel) centre.union(worldBox(o))
    this.proxy.position.copy(centre.getCenter(new Vector3()))
    this.proxy.scale.set(1, 1, 1)
    if (ws.tool === 'scale' && sel.length === 1) this.proxy.quaternion.copy(objectQuaternion(sel[0]))
    else this.proxy.quaternion.identity()
    this.proxy.updateMatrixWorld(true)
    this.gizmo.setMode(ws.tool === 'rotate' ? 'rotate' : 'scale')
    this.gizmo.setSpace(ws.tool === 'scale' ? 'local' : 'world')
    if (this.gizmo.object !== this.proxy) this.gizmo.attach(this.proxy)
    this.requestRender()
  }

  private gizmoBegin(): void {
    const items = this.selectedVisible().map((o) => ({
      o,
      p0: new Vector3(o.position.x, o.position.y, o.position.z),
      q0: objectQuaternion(o),
      s0: { ...o.scale },
      centre: boxCentre(o)
    }))
    this.gizmoStart = { pivot: this.proxy.position.clone(), q: this.proxy.quaternion.clone(), items }
  }

  private gizmoApply(): void {
    const st = this.gizmoStart
    if (!st) return
    if (this.gizmo.mode === 'rotate') {
      const dq = this.proxy.quaternion.clone().multiply(st.q.clone().invert())
      for (const it of st.items) {
        const p = it.p0.clone().sub(st.pivot).applyQuaternion(dq).add(st.pivot)
        it.o.position.x = p.x
        it.o.position.y = p.y
        it.o.position.z = p.z
        setObjectQuaternion(it.o, dq.clone().multiply(it.q0))
        dropToBed(it.o)
      }
    } else {
      const r = this.proxy.scale
      const k = (v: number): number => Math.max(0.01, v)
      for (const it of st.items) {
        const s1 = { x: Math.max(0.001, it.s0.x * k(r.x)), y: Math.max(0.001, it.s0.y * k(r.y)), z: Math.max(0.001, it.s0.z * k(r.z)) }
        // keep the box centre fixed: p' = c - R S1 S0^-1 R^-1 (c - p0)
        const local = it.centre.clone().sub(it.p0).applyQuaternion(it.q0.clone().invert())
        local.set((local.x / it.s0.x) * s1.x, (local.y / it.s0.y) * s1.y, (local.z / it.s0.z) * s1.z).applyQuaternion(it.q0)
        const p = it.centre.clone().sub(local)
        it.o.scale = { x: round4(s1.x), y: round4(s1.y), z: round4(s1.z) }
        it.o.position.x = p.x
        it.o.position.y = p.y
        it.o.position.z = p.z
        dropToBed(it.o)
      }
    }
  }

  private gizmoEnd(): void {
    if (!this.gizmoStart) return
    for (const it of this.gizmoStart.items) dropToBed(it.o)
    this.gizmoStart = null
    touch()
    this.updateGizmo()
  }

  // ------------------------------------------------------------------ picking

  private setPointer(e: { clientX: number; clientY: number }): void {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
  }

  pick(e: { clientX: number; clientY: number }, only?: Set<string>): Hit | null {
    this.setPointer(e)
    this.objects.updateMatrixWorld(true)
    const targets = [...this.objMeshes.values()].filter((m) => m.visible && (!only || only.has(m.userData.id)))
    const hit = this.raycaster.intersectObjects(targets, false)[0]
    if (!hit) return null
    const object = store.objects.find((o) => o.id === hit.object.userData.id)
    if (!object) return null
    return { object, mesh: hit.object as Mesh, point: hit.point.clone(), faceIndex: hit.faceIndex ?? -1 }
  }

  private planePoint(e: PointerEvent, z: number): Vector3 | null {
    this.setPointer(e)
    const out = new Vector3()
    return this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -z), out)
  }

  // ------------------------------------------------------------------ pointer input

  private isCanvas(e: Event): boolean {
    return e.target === this.renderer.domElement
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.isCanvas(e)) return
    this.down = { x: e.clientX, y: e.clientY, button: e.button, moved: false }
    this.gesture = null
    if (e.button !== 0) return
    const additive = e.ctrlKey || e.shiftKey || e.metaKey

    if (this.gizmo.object && this.gizmo.axis !== null) {
      this.gesture = { kind: 'gizmo' }
      this.orbit.enabled = false
      return
    }

    if (ws.layFlat) {
      const hit = this.pick(e)
      if (hit) {
        // applied on release, so a drag that starts on the part still orbits
        this.gesture = { kind: 'layflat', hit }
        return
      }
      this.gesture = { kind: 'empty', additive }
      return
    }

    const hit = this.pick(e)
    if (!hit) {
      this.gesture = { kind: 'empty', additive }
      return
    }
    this.orbit.enabled = false
    const id = hit.object.id
    const wasSelected = store.selection.includes(id)
    if (!wasSelected) select([id], additive)
    this.renderer.domElement.setPointerCapture(e.pointerId)
    this.gesture = {
      kind: 'object',
      id,
      wasSelected,
      additive,
      pointerId: e.pointerId,
      dragging: false,
      planeZ: hit.point.z,
      start: hit.point.clone(),
      starts: [],
      primaryCentre: new Vector3()
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.down.button >= 0 && (e.buttons & 7) !== 0) {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_SLOP) this.down.moved = true
    }
    const g = this.gesture
    if (g?.kind === 'object') {
      if (!g.dragging) {
        if (!this.down.moved) return
        g.dragging = true
        const sel = this.selectedVisible()
        g.starts = sel.map((o) => ({ o, x: o.position.x, y: o.position.y }))
        const primary = store.objects.find((o) => o.id === g.id)
        g.primaryCentre = primary ? boxCentre(primary) : new Vector3()
        this.renderer.domElement.classList.add('dragging')
      }
      const p = this.planePoint(e, g.planeZ)
      if (!p) return
      let dx = clamp(p.x - g.start.x, -600, 600)
      let dy = clamp(p.y - g.start.y, -600, 600)
      if (e.shiftKey) {
        dx = Math.round((g.primaryCentre.x + dx) / SNAP) * SNAP - g.primaryCentre.x
        dy = Math.round((g.primaryCentre.y + dy) / SNAP) * SNAP - g.primaryCentre.y
      }
      for (const s of g.starts) {
        s.o.position.x = round3(s.x + dx)
        s.o.position.y = round3(s.y + dy)
      }
      return
    }
    if (!this.isCanvas(e) || (e.buttons & 7) !== 0) return
    // Hover feedback (face highlight in lay-flat mode, move cursor over parts), once per frame.
    this.lastMove = e
    if (this.hoverQueued) return
    this.hoverQueued = true
    requestAnimationFrame(() => {
      this.hoverQueued = false
      if (this.lastMove) this.hover(this.lastMove)
    })
  }

  private onPointerUp = (e: PointerEvent): void => {
    const g = this.gesture
    const clicked = !this.down.moved && e.button === this.down.button
    this.gesture = null
    this.down.button = -1
    this.orbit.enabled = true
    this.renderer.domElement.classList.remove('dragging')
    if (!g) return
    if (g.kind === 'object') {
      if (this.renderer.domElement.hasPointerCapture(g.pointerId)) this.renderer.domElement.releasePointerCapture(g.pointerId)
      if (g.dragging) {
        touch()
        return
      }
      if (clicked && g.wasSelected) {
        if (g.additive) select(store.selection.filter((id) => id !== g.id))
        else if (store.selection.length > 1) select([g.id])
      }
      return
    }
    if (g.kind === 'layflat') {
      if (clicked) this.applyLayFlat(g.hit)
      return
    }
    if (g.kind === 'empty' && clicked && e.button === 0) {
      if (ws.layFlat) ws.layFlat = false
      else if (!g.additive) select([])
    }
  }

  private onPointerLeave = (): void => {
    this.lastMove = null
    if (ws.layFlat) this.clearOverlay()
    this.renderer.domElement.classList.remove('over-object')
  }

  private onContextMenuEvent = (e: MouseEvent): void => {
    e.preventDefault()
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_SLOP) return
    const hit = this.pick(e)
    const r = this.container.getBoundingClientRect()
    if (!hit) {
      this.onContextMenu({ x: e.clientX - r.left, y: e.clientY - r.top, id: null })
      return
    }
    if (!store.selection.includes(hit.object.id)) select([hit.object.id])
    this.onContextMenu({ x: e.clientX - r.left, y: e.clientY - r.top, id: hit.object.id })
  }

  private totalTriangles(): number {
    let t = 0
    for (const o of store.objects) if (o.visible) t += meshes.get(o.meshId)?.triangles ?? 0
    return t
  }

  private hover(e: PointerEvent): void {
    if (this.gesture) return
    if (ws.layFlat) {
      const hit = this.pick(e)
      this.showOverlay(hit)
      return
    }
    // Raycasting a huge mesh on every move costs more than the cursor hint is worth.
    if (this.totalTriangles() > 400_000) return
    const over = !!this.pick(e)
    this.renderer.domElement.classList.toggle('over-object', over)
  }

  // ------------------------------------------------------------------ lay on face

  private showOverlay(hit: Hit | null): void {
    if (!hit || hit.faceIndex < 0) return this.clearOverlay()
    const region = faceRegion(hit.mesh.geometry, hit.faceIndex)
    if (!region) return this.clearOverlay()
    if (this.overlay && this.overlayRegion === region && this.overlayObject === hit.object.id) return
    this.clearOverlay()
    this.overlay = new Mesh(region.geometry, this.mats.overlay)
    this.overlay.renderOrder = 1
    this.overlayRegion = region
    this.overlayObject = hit.object.id
    hit.mesh.add(this.overlay)
    this.requestRender()
  }

  private clearOverlay(): void {
    if (!this.overlay) return
    this.overlay.parent?.remove(this.overlay)
    this.overlay = null
    this.overlayRegion = null
    this.overlayObject = null
    this.requestRender()
  }

  private applyLayFlat(hit: Hit): void {
    if (hit.faceIndex < 0) return
    if (!store.selection.includes(hit.object.id)) select([hit.object.id])
    layFlatOnFace(hit.object.id, hit.faceIndex)
    ws.layFlat = false
    this.clearOverlay()
  }

  // ------------------------------------------------------------------ teardown

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.resizeObs.disconnect()
    this.themeObs.disconnect()
    this.container.removeEventListener('pointerdown', this.onPointerDown, true)
    this.container.removeEventListener('pointermove', this.onPointerMove, true)
    this.container.removeEventListener('pointerup', this.onPointerUp, true)
    this.container.removeEventListener('pointercancel', this.onPointerUp, true)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenuEvent)
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave)
    this.gizmo.detach()
    this.gizmo.dispose()
    this.orbit.dispose()
    this.bed.dispose()
    this.brackets.geometry.dispose()
    for (const m of Object.values(this.mats)) m.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v))
}
const round3 = (v: number): number => Math.round(v * 1000) / 1000
const round4 = (v: number): number => Math.round(v * 10000) / 10000
