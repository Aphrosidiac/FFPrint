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
function toggleAll(): void {
  if (!allShown.value) return showAllFeatures()
  for (const r of rows.value) setFeatureVisible(r.type, false)
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
      :title="`${preview.hidden[r.type] ? 'Show' : 'Hide'} ${r.label.toLowerCase()} · ${duration(r.time)} · ${(r.length / 1000).toFixed(2)} m of path`"
      @click="toggle(r.type)"
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
  </div>
</template>

<style scoped>
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
