<script setup lang="ts">
// Feature types with their colour, a show/hide toggle and their share of the print time.
import { computed } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import { duration } from '@/lib/format'
import { TRAVEL_COLOR } from './palette'
import { setFeatureVisible, showAllFeatures } from './actions'
import { preview } from './state'

const rows = computed(() => preview.legend)
const allShown = computed(() => rows.value.every((r) => !preview.hidden[r.type]))

function toggle(type: string): void {
  setFeatureVisible(type, !!preview.hidden[type])
}
/** Double-click: show only this feature (double-click it again to bring everything back). */
function solo(type: string): void {
  const alone = rows.value.every((r) => r.type === type || preview.hidden[r.type])
  if (alone) return showAllFeatures()
  for (const r of rows.value) setFeatureVisible(r.type, r.type === type)
}
function toggleAll(): void {
  if (!allShown.value) return showAllFeatures()
  for (const r of rows.value) setFeatureVisible(r.type, false)
}
/** What each feature is, in plain words (legend tooltip). */
const HELP: Record<string, string> = {
  'Outer wall': 'the visible outside skin of the part.',
  'Inner wall': 'walls just inside the outer wall, for strength.',
  'Overhang wall': 'outer wall printed over air on a steep overhang (printed slower).',
  'Sparse infill': 'the light inner fill pattern.',
  'Internal solid infill': 'fully solid layers inside the part, under top surfaces.',
  'Top surface': 'the solid layers that close any upward-facing area. On curved parts every gentle slope gets a few.',
  'Bottom surface': 'solid layers that close downward-facing areas, including the first layer.',
  Bridge: 'lines stretched across a gap with nothing underneath.',
  'Internal Bridge': 'bridging lines inside the part, over sparse infill.',
  'Gap infill': 'thin fill for gaps too narrow for a full line.',
  Ironing: 'a smoothing pass over the top surface.',
  Support: 'temporary structure holding up overhangs; snapped off after printing.',
  'Support interface': 'the dense top of a support that touches the part.',
  'Support transition': 'where tree support branches join.',
  Skirt: 'an outline around the print that primes the nozzle.',
  Brim: 'extra lines attached to the first layer so the part does not lift.',
  Custom: 'the start and end routine (purge line, park).'
}
const share = (s: number): string => (s < 0.01 ? '<1%' : `${Math.round(s * 100)}%`)
</script>

<template>
  <div class="legend">
    <div class="head">
      <button type="button" class="all" :title="allShown ? 'Hide all' : 'Show all'" @click="toggleAll">
        <EyeOff v-if="allShown" />
        <Eye v-else />
      </button>
      <span class="section-title">Features</span>
      <span class="col">Time</span>
    </div>
    <button
      v-for="r in rows"
      :key="r.type"
      type="button"
      class="row"
      :class="{ off: preview.hidden[r.type] }"
      :aria-pressed="!preview.hidden[r.type]"
      :title="`${r.label}: ${HELP[r.type] ?? ''}
${duration(r.time)} · ${(r.length / 1000).toFixed(2)} m of path`"
      @click="toggle(r.type)"
      @dblclick="solo(r.type)"
    >
      <span class="sw" :style="{ background: preview.hidden[r.type] ? 'transparent' : r.color, borderColor: r.color }" />
      <span class="name">{{ r.label }}</span>
      <span class="val num">{{ share(r.share) }}</span>
    </button>
    <button type="button" class="row travel" :class="{ off: !preview.travel }" :aria-pressed="preview.travel" :title="preview.travel ? 'Hide travel moves' : 'Show travel moves'" @click="setFeatureVisible('Travel', !preview.travel)">
      <span class="sw line" :style="{ background: preview.travel ? TRAVEL_COLOR : 'transparent', borderColor: TRAVEL_COLOR }" />
      <span class="name">Travel</span>
      <span class="val">{{ preview.travel ? 'On' : 'Off' }}</span>
    </button>
    <p class="tip">Click to hide · double-click to show only that</p>
  </div>
</template>

<style scoped>
.tip {
  margin-top: 4px;
  padding: 6px 4px 0;
  border-top: 1px solid var(--border);
  font-size: var(--fs-11);
  color: var(--text-3);
}
.legend {
  width: 208px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}
.head {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 4px 0 0;
  margin-bottom: 4px;
}
.head .section-title {
  flex: 1;
}
.col {
  font-size: var(--fs-11);
  color: var(--text-3);
}
.all {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}
.all:hover {
  background: var(--surface-3);
  color: var(--text);
}
.all svg {
  width: 14px;
  height: 14px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 24px;
  padding: 0 4px 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text);
  font-size: var(--fs-12);
  text-align: left;
  cursor: pointer;
}
.row:hover {
  background: var(--surface-3);
}
.row.off .name,
.row.off .val {
  color: var(--text-3);
}
.row.travel {
  margin-top: 4px;
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--r-sm) var(--r-sm);
  height: 28px;
}
.sw {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 2px solid;
  flex: none;
}
.sw.line {
  height: 4px;
  border-width: 1px;
  border-radius: 2px;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.val {
  color: var(--text-2);
  font-size: var(--fs-11);
}
</style>
