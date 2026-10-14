<script setup lang="ts">
// The slice result: print time (calibrated by the learned time factor), filament, cost, layers.
import { computed } from 'vue'
import type { SliceResult } from '@shared/types'
import { duration, grams, meters, mm, money } from '@/lib/format'
import { app } from '@/stores/app'

const props = defineProps<{ result: SliceResult; dim?: boolean }>()
const s = computed(() => props.result.stats)
const factor = computed(() => app.machine?.timeFactor ?? 1)
const calibrated = computed(() => Math.abs(factor.value - 1) > 0.0005 && s.value.estimateSeconds > 0)
const calTip = computed(
  () => `The engine estimates ${duration(s.value.estimateSeconds)}. Corrected by ×${factor.value.toFixed(2)}, learned from your real print times.`
)
</script>

<template>
  <div class="card" :class="{ dim }">
    <div class="time-row">
      <span class="label">Print time</span>
      <span v-if="calibrated" class="cal" :title="calTip">Calibrated</span>
    </div>
    <div class="time num" :title="calibrated ? calTip : undefined">{{ duration(s.seconds) }}</div>
    <dl class="stats">
      <div>
        <dt>Filament</dt>
        <dd class="num">{{ meters(s.filamentMm) }}</dd>
      </div>
      <div>
        <dt>Weight</dt>
        <dd class="num">{{ grams(s.filamentG) }}</dd>
      </div>
      <div>
        <dt>Cost</dt>
        <dd class="num">{{ money(s.cost, app.prefs?.currency || 'RM') }}</dd>
      </div>
      <div>
        <dt>Layers</dt>
        <dd class="num">{{ s.layers }}</dd>
      </div>
      <div>
        <dt>Height</dt>
        <dd class="num">{{ mm(s.maxZ, s.maxZ < 100 ? 2 : 1) }}</dd>
      </div>
      <div>
        <dt>Sliced in</dt>
        <dd class="num">{{ (result.durationMs / 1000).toFixed(1) }} s</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.card {
  transition: opacity var(--dur) var(--ease);
}
.card.dim {
  opacity: 0.5;
}
.time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 20px;
}
.label {
  font-size: var(--fs-12);
  color: var(--text-2);
}
.cal {
  padding: 0 6px;
  border-radius: var(--r-sm);
  background: var(--accent-soft);
  color: var(--accent-text);
  font-size: var(--fs-11);
  font-weight: 500;
  line-height: 18px;
  cursor: help;
}
.time {
  font-family: var(--font-display);
  font-size: var(--fs-20);
  font-weight: 600;
  line-height: 28px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 8px 0 0;
}
.stats div {
  min-width: 0;
}
dt {
  font-size: var(--fs-11);
  color: var(--text-3);
  line-height: 16px;
}
dd {
  margin: 0;
  font-size: var(--fs-13);
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
