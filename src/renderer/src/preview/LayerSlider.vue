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
    <div class="readout">
      <div class="layer num" title="Highest layer shown">{{ top + 1 }}<span class="of"> / {{ last + 1 }}</span></div>
      <div class="z num" title="Height of this layer">{{ topInfo ? topInfo.z.toFixed(2) : '0.00' }} mm</div>
      <div v-if="topInfo && topInfo.time > 0" class="t num" title="Approximate time for this layer">{{ duration(topInfo.time) }}</div>
    </div>
    <div ref="track" class="track" @pointerdown.self="onTrackDown">
      <div class="rail" />
      <div class="fill" :style="{ top: pct(top) + '%', bottom: 100 - pct(bottom) + '%' }" />
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
    <div class="foot">
      <div class="lo-label num" title="Lowest layer shown">{{ bottom + 1 }}</div>
      <button type="button" class="play" :aria-label="playing ? 'Pause' : 'Play through the layers'" :title="playing ? 'Pause' : 'Play through the layers'" @click="play">
        <Pause v-if="playing" />
        <Play v-else />
      </button>
    </div>
  </div>
</template>

<style scoped>
.slider {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 72px;
  padding: 8px 0;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  user-select: none;
}
.readout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 0 4px 8px;
  width: 100%;
  border-bottom: 1px solid var(--border);
  text-align: center;
}
.layer {
  font-size: var(--fs-14);
  font-weight: 600;
  line-height: 20px;
}
.of {
  font-size: var(--fs-11);
  font-weight: 400;
  color: var(--text-3);
}
.z,
.t {
  font-size: var(--fs-11);
  line-height: 16px;
  color: var(--text-2);
}
.t {
  color: var(--text-3);
}
.track {
  position: relative;
  flex: 1;
  width: 32px;
  margin: 16px 0;
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
  width: 24px;
  height: 12px;
  margin: -6px 0 0 -12px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.18);
  cursor: grab;
  touch-action: none;
}
.handle.hi {
  border-color: var(--accent);
  border-width: 2px;
}
.handle:active {
  cursor: grabbing;
}
.handle:hover {
  background: var(--surface-2);
}
.foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.lo-label {
  font-size: var(--fs-11);
  color: var(--text-2);
  line-height: 16px;
}
.play {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--r);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}
.play:hover {
  background: var(--surface-3);
  color: var(--text);
}
.play svg {
  width: 14px;
  height: 14px;
}
</style>
