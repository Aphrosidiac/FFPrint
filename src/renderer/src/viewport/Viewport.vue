<script setup lang="ts">
import { canRedo, canUndo, redo, undo } from '@/stores/undo'
// Prepare mode's 3D workspace: the bed, the parts, camera views, tools, keyboard and context menu.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowDownToLine, BoxSelect, SquareDashed, Copy, FolderOpen, LayoutGrid, Move, Redo2, Rotate3d, Scale3d, Scan, Trash2, Crosshair, ArrowDownFromLine, Undo2 } from 'lucide-vue-next'
import { app, openDialog } from '@/stores/app'
import { hasObjects, meshes, scene, selected } from '@/stores/scene'
import IconButton from '@/ui/IconButton.vue'
import ViewIcon from './ViewIcon.vue'
import { Workspace3D, type ContextMenuRequest } from './scene3d'
import { arrangeAll, centreOnBed, clearSelection, deleteObjects, dropToBed, duplicateObjects, selectAll, setCameraView, setLayFlatMode, setPlateVisible, setTool } from './actions'
import * as actions from './actions'
import { captureThumbnail } from './capture'
import { viewBridge, ws, type Tool, type View } from './workspace'

const host = ref<HTMLDivElement>()
const view = shallowRef<Workspace3D | null>(null)
const menu = ref<ContextMenuRequest | null>(null)

const tools: { id: Tool; label: string; key: string; icon: typeof Move }[] = [
  { id: 'move', label: 'Move', key: 'M', icon: Move },
  { id: 'rotate', label: 'Rotate', key: 'R', icon: Rotate3d },
  { id: 'scale', label: 'Scale', key: 'S', icon: Scale3d }
]
const views: { id: View; label: string }[] = [
  { id: 'iso', label: 'Iso view' },
  { id: 'top', label: 'Top view' },
  { id: 'front', label: 'Front view' },
  { id: 'left', label: 'Left view' },
  { id: 'right', label: 'Right view' }
]

function setView(v: View): void {
  setCameraView(v)
}

function fit(): void {
  setCameraView('fit-selection')
}

onMounted(() => {
  const v = new Workspace3D(host.value as HTMLDivElement)
  v.onContextMenu = (r) => (menu.value = r)
  view.value = v
  viewBridge.setView = (x) => v.setView(x)
  viewBridge.fit = () => v.fit()
  viewBridge.fitAll = () => v.fitAll()
  viewBridge.requestRender = () => v.requestRender()
  window.addEventListener('keydown', onKey)
  window.addEventListener('pointerdown', closeMenuOutside, true)
  // Automation/test handle (scripts/shot.mjs --eval, e2e): every Prepare action plus the camera.
  ;(window as unknown as { __ffPrepare: unknown }).__ffPrepare = { ...actions, ws, captureThumbnail, camera: () => ({ position: v.camera.position.toArray(), target: v.orbit.target.toArray() }), project: (x: number, y: number, z: number) => v.project(x, y, z), _view: v }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pointerdown', closeMenuOutside, true)
  viewBridge.setView = () => {}
  viewBridge.fit = () => {}
  viewBridge.fitAll = () => {}
  viewBridge.requestRender = () => {}
  view.value?.dispose()
  view.value = null
})

// Keep the 3D scene in step with the store: structure, transforms, visibility and selection.
// Shade the faces that will get support while supports are on.
watch(
  () => [app.settings.supports, app.settings.supportAngle, view.value] as const,
  ([mode, angle, w]) => w?.setOverhangShading(mode !== 'off', angle),
  { immediate: true }
)

watch(
  () => [ws.plate, view.value] as const,
  ([on, w]) => w?.setPlateVisible(on),
  { immediate: true }
)

watch(
  () => [scene.revision, scene.selection, scene.objects, meshes.size],
  () => view.value?.sync(),
  { deep: true }
)
watch(
  () => [ws.tool, ws.layFlat],
  () => view.value?.sync()
)
// Coming back from Preview: the canvas was hidden, redraw it.
watch(
  () => app.mode,
  (m) => {
    if (m === 'prepare') requestAnimationFrame(() => view.value?.requestRender())
  }
)

// ------------------------------------------------------------------ keyboard

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

function onKey(e: KeyboardEvent): void {
  if (app.page !== 'workspace' || app.mode !== 'prepare' || typing(e)) return
  if (document.querySelector('dialog[open]')) return
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  if (e.key === 'Escape') {
    if (menu.value) menu.value = null
    else if (ws.layFlat) setLayFlatMode(false)
    else clearSelection()
    return
  }
  if (e.key === 'Delete' || (e.key === 'Backspace' && !ctrl)) {
    if (!scene.selection.length) return
    e.preventDefault()
    deleteObjects([...scene.selection])
    menu.value = null
    return
  }
  if (ctrl && !e.altKey) {
    if (k === 'z' || k === 'y') {
      e.preventDefault()
      if (k === 'y' || e.shiftKey) redo()
      else undo()
      return
    }
    if (k === 'd') {
      e.preventDefault()
      duplicateObjects([...scene.selection])
    } else if (k === 'a') {
      e.preventDefault()
      selectAll()
    }
    return
  }
  if (e.altKey || e.repeat) return
  if (k === 'a') arrangeAll()
  else if (k === 'f') fit()
  else if (k === 'm') setTool('move')
  else if (k === 'r') setTool('rotate')
  else if (k === 's') setTool('scale')
  else if (k === 'l' && selected.value.length) setLayFlatMode(!ws.layFlat)
  else return
  e.preventDefault()
}

// ------------------------------------------------------------------ context menu

function closeMenuOutside(e: Event): void {
  if (!menu.value) return
  const el = (e.target as HTMLElement | null)?.closest?.('.ctx')
  if (!el) menu.value = null
}

function menuStyle(r: ContextMenuRequest): Record<string, string> {
  const w = host.value?.clientWidth ?? 0
  const h = host.value?.clientHeight ?? 0
  const x = Math.min(r.x, w - 208)
  const y = Math.min(r.y, h - (r.id === null ? 300 : 196))
  return { left: `${Math.max(8, x)}px`, top: `${Math.max(8, y)}px` }
}

const selIds = (): string[] => [...scene.selection]
const deleteAll = (): void => deleteObjects(scene.objects.map((o) => o.id))

function run(action: () => void): void {
  menu.value = null
  action()
}
</script>

<template>
  <div ref="host" class="vp" :class="{ layflat: ws.layFlat }" @wheel.passive="menu = null">
    <div class="toolbar" @pointerdown.stop>
      <div class="group" role="toolbar" aria-label="Tools">
        <IconButton
          v-for="t in tools"
          :key="t.id"
          size="sm"
          :label="`${t.label} (${t.key})`"
          :active="ws.tool === t.id && !ws.layFlat"
          @click="setTool(t.id)"
        >
          <component :is="t.icon" />
        </IconButton>
        <span class="sep" />
        <IconButton size="sm" label="Lay on face (L)" :active="ws.layFlat" :disabled="!hasObjects" @click="setLayFlatMode(!ws.layFlat)">
          <ArrowDownToLine />
        </IconButton>
      </div>
      <div class="group" role="toolbar" aria-label="Views">
        <IconButton v-for="v in views" :key="v.id" size="sm" :label="v.label" @click="setView(v.id)">
          <ViewIcon :view="v.id" />
        </IconButton>
        <span class="sep" />
        <IconButton size="sm" :label="selected.length ? 'Fit selection (F)' : 'Fit bed (F)'" @click="fit">
          <Scan />
        </IconButton>
        <IconButton size="sm" :label="ws.plate ? 'Hide plate (P)' : 'Show plate (P)'" :active="!ws.plate" @click="setPlateVisible(!ws.plate)">
          <SquareDashed />
        </IconButton>
      </div>
    </div>

    <div v-if="ws.layFlat" class="hint">
      <span>{{ selected.length || !hasObjects ? 'Click a face to lay it on the bed' : 'Click a face of any part to lay it on the bed' }}</span>
      <span class="key">Esc</span>
    </div>

    <div v-if="menu && menu.id === null" class="ctx" role="menu" :style="menuStyle(menu)" @contextmenu.prevent>
      <button type="button" role="menuitem" @click="run(openDialog)"><FolderOpen /><span>Add models…</span><kbd>Ctrl+O</kbd></button>
      <div class="ctx-sep" />
      <button type="button" role="menuitem" :disabled="!hasObjects" @click="run(() => arrangeAll())"><LayoutGrid /><span>Arrange all</span><kbd>A</kbd></button>
      <button type="button" role="menuitem" :disabled="!hasObjects" @click="run(selectAll)"><BoxSelect /><span>Select all</span><kbd>Ctrl+A</kbd></button>
      <button type="button" role="menuitem" @click="run(fit)"><Scan /><span>Fit view</span><kbd>F</kbd></button>
      <div class="ctx-sep" />
      <button type="button" role="menuitem" :disabled="!canUndo" @click="run(undo)"><Undo2 /><span>Undo</span><kbd>Ctrl+Z</kbd></button>
      <button type="button" role="menuitem" :disabled="!canRedo" @click="run(redo)"><Redo2 /><span>Redo</span><kbd>Ctrl+Y</kbd></button>
      <div class="ctx-sep" />
      <button type="button" role="menuitem" class="danger" :disabled="!hasObjects" @click="run(deleteAll)"><Trash2 /><span>Delete all</span></button>
    </div>
    <div v-else-if="menu" class="ctx" role="menu" :style="menuStyle(menu)" @contextmenu.prevent>
      <button type="button" role="menuitem" @click="run(() => duplicateObjects(selIds()))"><Copy /><span>Duplicate</span><kbd>Ctrl+D</kbd></button>
      <button type="button" role="menuitem" @click="run(() => setLayFlatMode(true))"><ArrowDownToLine /><span>Lay on face</span><kbd>L</kbd></button>
      <button type="button" role="menuitem" @click="run(() => dropToBed(selIds()))"><ArrowDownFromLine /><span>Drop to bed</span></button>
      <button type="button" role="menuitem" @click="run(() => centreOnBed(selIds()))"><Crosshair /><span>Centre on bed</span></button>
      <div class="ctx-sep" />
      <button type="button" role="menuitem" class="danger" @click="run(() => deleteObjects(selIds()))"><Trash2 /><span>Delete</span><kbd>Del</kbd></button>
    </div>
  </div>
</template>

<style scoped>
.vp {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--viewport-bg);
}
.vp :deep(.vp-canvas) {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
  touch-action: none;
}
.vp :deep(.vp-canvas.over-object) {
  cursor: move;
}
.vp :deep(.vp-canvas.dragging) {
  cursor: grabbing;
}
.vp.layflat :deep(.vp-canvas) {
  cursor: crosshair;
}

.toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 8px;
}
.group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
}
.sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--border);
}

.hint {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  font-size: var(--fs-12);
  color: var(--text);
  pointer-events: none;
  white-space: nowrap;
}
.key,
kbd {
  font: 500 var(--fs-11) / 1 var(--font);
  color: var(--text-3);
}
.key {
  padding: 3px 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
}


.ctx {
  position: absolute;
  z-index: 10;
  width: 200px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}
.ctx button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text);
  font-size: var(--fs-13);
  text-align: left;
  cursor: pointer;
}
.ctx button:hover:not(:disabled) {
  background: var(--surface-3);
}
.ctx button:disabled {
  color: var(--text-3);
  cursor: default;
  opacity: 0.6;
}
.ctx button:disabled svg {
  color: var(--text-3);
}
.ctx button span {
  flex: 1;
}
.ctx button svg {
  width: 14px;
  height: 14px;
  color: var(--text-2);
  flex: none;
}
.ctx button.danger,
.ctx button.danger svg {
  color: var(--danger);
}
.ctx button.danger:hover {
  background: var(--danger-soft);
}
.ctx-sep {
  height: 1px;
  margin: 4px 0;
  background: var(--border);
}
</style>
