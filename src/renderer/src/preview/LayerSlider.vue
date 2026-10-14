<script setup lang="ts">
// Vertical two-handle layer range. Top handle = highest layer shown, bottom handle = lowest.
// Keyboard: Up/Down move the top handle (Shift = 10 layers), Home/End jump; with the bottom handle
// focused the arrows move that one. Click the track to move the nearest handle; wheel moves the top.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Pause, Play } from 'lucide-vue-next'
import type { LayerInfo } from './gcodeParse'
import { duration } from '@/lib/format'

const props = defineProps<{ layers: LayerInfo[] }>()
const range = defineModel<[number, number]>({ required: true })

const track = ref<HTMLElement>()
const last = computed(() => Math.max(0, props.layers.length - 1))
const pct = (v: number): number => (last.value ? (1 - v / last.value) * 100 : 0)
const top = computed(() => range.value[1])
const bottom = computed(() => range.value[0])
const topInfo = computed(() => props.layers[top.value])

function set(lo: number, hi: number): void {
  const L = last.value
  lo = Math.max(0, Math.min(Math.round(lo), L))
  hi = Math.max(0, Math.min(Math.round(hi), L))
  if (lo > hi) [lo, hi] = which.value === 'lo' ? [hi, hi] : [lo, lo]
  if (lo !== range.value[0] || hi !== range.value[1]) range.value = [lo, hi]
}

const which = ref<'lo' | 'hi'>('hi')
function valueAt(clientY: number): number {
  const r = track.value?.getBoundingClientRect()
  if (!r || r.height <= 0) return 0
  const f = 1 - (clientY - r.top) / r.height
  return Math.round(Math.max(0, Math.min(1, f)) * last.value)
}

let dragging = false
function startDrag(h: 'lo' | 'hi', e: PointerEvent): void {
  stop()
  which.value = h
  dragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  ;(e.currentTarget as HTMLElement).focus()
}
function onMove(e: PointerEvent): void {
  if (!dragging) return
  const v = valueAt(e.clientY)
  if (which.value === 'hi') set(Math.min(bottom.value, v), Math.max(v, bottom.value))
  else set(Math.min(v, top.value), top.value)
}
function endDrag(): void {
  dragging = false
}
function onTrackDown(e: PointerEvent): void {
  stop()
  const v = valueAt(e.clientY)
  if (Math.abs(v - top.value) <= Math.abs(v - bottom.value) || v > top.value) set(bottom.value, v)
  else set(v, top.value)
}
function onWheel(e: WheelEvent): void {
  stop()
  const step = (e.shiftKey ? 10 : 1) * (e.deltaY < 0 ? 1 : -1)
  set(bottom.value, Math.max(bottom.value, top.value + step))
}

function nudge(h: 'lo' | 'hi', delta: number): void {
  if (h === 'hi') set(bottom.value, Math.max(bottom.value, top.value + delta))
  else set(Math.min(top.value, bottom.value + delta), top.value)
}

function onKey(e: KeyboardEvent, h: 'lo' | 'hi'): boolean {
  const step = e.shiftKey ? 10 : 1
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') nudge(h, step)
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') nudge(h, -step)
  else if (e.key === 'PageUp') nudge(h, 10)
  else if (e.key === 'PageDown') nudge(h, -10)
  else if (e.key === 'Home') h === 'hi' ? set(bottom.value, last.value) : set(top.value, top.value)
  else if (e.key === 'End') h === 'hi' ? set(bottom.value, bottom.value) : set(0, top.value)
  else return false
  stop()
  e.preventDefault()
  return true
}

/** Window-level keys: Up/Down drive the top handle unless the user is typing somewhere. */
function onWindowKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null
  if (t && (t.closest('input, textarea, select, [contenteditable="true"], dialog') || t.classList.contains('handle'))) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  onKey(e, 'hi')
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKey)
  stop()
})

// Play-through: sweep the top handle from the bottom handle to the last layer.
const playing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
function stop(): void {
  playing.value = false
  clearInterval(timer)
}
function play(): void {
  if (playing.value) return stop()
  if (top.value >= last.value) set(bottom.value, bottom.value)
  playing.value = true
  const step = Math.max(1, Math.round(last.value / 150))
  timer = setInterval(() => {
    if (top.value >= last.value) return stop()
    set(bottom.value, top.value + step)
  }, 50)
}
</script>

<template>
  <div class="slider" @wheel.prevent="onWheel">
    <div ref="track" class="track" @pointerdown.self="onTrackDown">
      <div class="rail" />
      <div class="fill" :style="{ top: pct(top) + '%', bottom: 100 - pct(bottom) + '%' }" />
      <!-- the readout rides next to the top handle instead of sitting in a panel -->
      <div class="tag hi-tag" :style="{ top: pct(top) + '%' }">
        <span class="layer num">{{ top + 1 }}<span class="of">/{{ last + 1 }}</span></span>
        <span class="z num">{{ topInfo ? topInfo.z.toFixed(2) : '0.00' }} mm</span>
        <span v-if="topInfo && topInfo.time > 0" class="t num">{{ duration(topInfo.time) }}</span>
      </div>
      <div v-if="bottom > 0" class="tag lo-tag num" :style="{ top: pct(bottom) + '%' }">{{ bottom + 1 }}</div>
      <button
        type="button"
        class="handle hi"
        :style="{ top: pct(top) + '%' }"
        role="slider"
        aria-label="Highest layer shown"
        :aria-valuemin="0"
        :aria-valuemax="last + 1"
        :aria-valuenow="top + 1"
        @pointerdown="startDrag('hi', $event)"
        @pointermove="onMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="onKey($event, 'hi')"
      />
      <button
        type="button"
        class="handle lo"
        :style="{ top: pct(bottom) + '%' }"
        role="slider"
        aria-label="Lowest layer shown"
        :aria-valuemin="1"
        :aria-valuemax="last + 1"
        :aria-valuenow="bottom + 1"
        @pointerdown="startDrag('lo', $event)"
        @pointermove="onMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="onKey($event, 'lo')"
      />
    </div>
    <button type="button" class="play" :aria-label="playing ? 'Pause' : 'Play through the layers'" :title="playing ? 'Pause' : 'Play through the layers'" @click="play">
      <Pause v-if="playing" />
      <Play v-else />
    </button>
  </div>
</template>

<style scoped>
/* No panel: a slim track on the viewport edge; the numbers ride beside the handles. */
.slider {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 28px;
  user-select: none;
}
.track {
  position: relative;
  flex: 1;
  width: 28px;
  margin: 10px 0 8px;
  cursor: pointer;
  touch-action: none;
}
.rail,
.fill {
  position: absolute;
  left: 50%;
  width: 4px;
  margin-left: -2px;
  border-radius: 2px;
  pointer-events: none;
}
.rail {
  top: 0;
  bottom: 0;
  background: var(--surface-3);
  box-shadow: inset 0 0 0 1px var(--border);
}
.fill {
  background: var(--accent);
}
.handle {
  position: absolute;
  left: 50%;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  padding: 0;
  border: 2px solid var(--border-strong);
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  cursor: grab;
  touch-action: none;
}
.handle.hi {
  border-color: var(--accent);
}
.handle:active {
  cursor: grabbing;
}
.tag {
  position: absolute;
  right: 22px;
  transform: translateY(-50%);
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
  white-space: nowrap;
  pointer-events: none;
  font-size: var(--fs-11);
  color: var(--text-2);
}
.layer {
  font-size: var(--fs-12);
  font-weight: 600;
  color: var(--text);
}
.of {
  font-weight: 400;
  color: var(--text-3);
}
.t {
  color: var(--text-3);
}
.lo-tag {
  color: var(--text-2);
}
.play {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12);
}
.play:hover {
  color: var(--text);
  background: var(--surface-3);
}
.play svg {
  width: 13px;
  height: 13px;
}
</style>
