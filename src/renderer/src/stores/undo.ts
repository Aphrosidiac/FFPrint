// Undo / redo for the bed: every settled change to the objects (add, delete, move, rotate, scale,
// rename, hide) becomes one step. Snapshots are taken 250 ms after the last change, so a drag or a
// typed number is one step, not hundreds. Meshes of deleted objects stay loaded while a step still
// needs them. Opening a project starts a fresh history.

import { computed, reactive, watch } from 'vue'
import { meshes, scene, touch, type SceneObject } from './scene'

type Snap = { objects: SceneObject[]; selection: string[] }

const LIMIT = 60
const state = reactive({ past: [] as Snap[], future: [] as Snap[], current: null as Snap | null })
let applying = false
let timer: ReturnType<typeof setTimeout> | undefined

const copy = (): Snap => ({ objects: JSON.parse(JSON.stringify(scene.objects)), selection: [...scene.selection] })
const same = (a: Snap | null, b: Snap): boolean => !!a && JSON.stringify(a.objects) === JSON.stringify(b.objects)

export const canUndo = computed(() => state.past.length > 0)
export const canRedo = computed(() => state.future.length > 0)

/** Drop meshes that neither the bed nor any undo/redo step refers to. */
function pruneMeshes(): void {
  const keep = new Set<string>()
  for (const s of [...state.past, ...state.future, state.current]) for (const o of s?.objects ?? []) keep.add(o.meshId)
  for (const o of scene.objects) keep.add(o.meshId)
  for (const id of [...meshes.keys()]) if (!keep.has(id)) meshes.delete(id)
}

function record(): void {
  if (applying) return
  const now = copy()
  if (same(state.current, now)) {
    if (state.current) state.current.selection = now.selection
    return
  }
  if (state.current) state.past.push(state.current)
  if (state.past.length > LIMIT) state.past.shift()
  state.current = now
  state.future = []
  pruneMeshes()
}

function apply(s: Snap): void {
  applying = true
  scene.objects = s.objects.map((o) => reactive(JSON.parse(JSON.stringify(o))) as SceneObject)
  scene.selection = s.selection.filter((id) => s.objects.some((o) => o.id === id))
  state.current = s
  touch()
  // let watchers see the change before recording resumes
  setTimeout(() => (applying = false), 0)
}

export function undo(): boolean {
  flush()
  const prev = state.past.pop()
  if (!prev || !state.current) return false
  state.future.push(state.current)
  apply(prev)
  return true
}

export function redo(): boolean {
  flush()
  const next = state.future.pop()
  if (!next || !state.current) return false
  state.past.push(state.current)
  apply(next)
  return true
}

/** Record any pending change now (before undo, or before a test reads the history). */
export function flush(): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
    record()
  }
}

/** Start over (new project, reprint): the loaded scene becomes the first step. */
export function resetUndo(): void {
  clearTimeout(timer)
  timer = undefined
  state.past = []
  state.future = []
  state.current = copy()
  pruneMeshes()
}

export function undoInfo(): { undo: number; redo: number } {
  return { undo: state.past.length, redo: state.future.length }
}

export function initUndo(): void {
  state.current = copy()
  watch(
    () => [scene.revision, JSON.stringify(scene.objects)],
    () => {
      if (applying) return
      // Adding or removing objects is always its own step, recorded at once, so a quick move right
      // after opening a file can never merge with (and undo away) the open itself.
      const ids = scene.objects.map((o) => o.id).join(',')
      if (ids !== (state.current?.objects.map((o) => o.id).join(',') ?? '')) {
        clearTimeout(timer)
        timer = undefined
        record()
        return
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        record()
      }, 250)
    }
  )
}
