<script setup lang="ts">
// Bottom of the right column: Slice -> progress -> result card -> save to the SD card.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { app, blockingIssues, cancelSlice, refreshDrives, runSlice } from '@/stores/app'
import Button from '@/ui/Button.vue'
import ResultCard from './slice/ResultCard.vue'
import SaveActions from './slice/SaveActions.vue'

const status = computed(() => app.slice.status)
const result = computed(() => app.slice.result)
const issues = computed(() => blockingIssues())
const reason = computed(() => {
  if (!app.engine.ok) return app.engine.error ? `Slicing engine unavailable: ${app.engine.error}.` : 'The slicing engine is not available.'
  return issues.value[0] ?? ''
})
const canSlice = computed(() => !reason.value && status.value !== 'slicing')

// Elapsed seconds while slicing.
const elapsed = ref(0)
// The engine reports stages, not progress inside a stage (supports can sit at one value for 10 s).
// The bar eases forward within the current stage but never past the start of the next real stage,
// so it never claims more than the engine has done.
const STAGE_STARTS = [1, 5, 15, 25, 35, 50, 60, 70, 75, 80, 99, 100]
const shown = ref(0)
function tickShown(): void {
  const real = app.sliceProgress.percent
  const cap = (STAGE_STARTS.find((b) => b > real) ?? 100) - 1
  shown.value = Math.max(real, Math.min(cap, shown.value + (cap - shown.value) * 0.03))
}
let started = 0
let timer: ReturnType<typeof setInterval> | undefined
watch(
  status,
  (s) => {
    clearInterval(timer)
    if (s === 'slicing') {
      started = Date.now()
      elapsed.value = 0
      shown.value = 0
      timer = setInterval(() => {
        elapsed.value = Math.floor((Date.now() - started) / 1000)
        tickShown()
      }, 100)
    }
  },
  { immediate: true }
)

onMounted(() => refreshDrives())
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section class="slicebar" :data-status="status">
    <!-- Slicing -->
    <div v-if="status === 'slicing'" class="progress">
      <div class="progress-head">
        <span class="title">Slicing <span class="pct num">{{ Math.floor(shown) }}%</span></span>
        <span class="muted num">{{ elapsed }} s</span>
      </div>
      <div class="bar" role="progressbar" aria-label="Slicing" :aria-valuenow="Math.floor(shown)" aria-valuemin="0" aria-valuemax="100">
        <div class="bar-fill" :style="{ width: `${Math.max(2, shown)}%` }" />
      </div>
      <div class="stage">{{ app.sliceProgress.stage || 'Starting' }}</div>
      <Button block @click="cancelSlice">Cancel</Button>
    </div>

    <!-- Done -->
    <template v-else-if="status === 'done' && result">
      <ResultCard :result="result" />
      <SaveActions :result="result" />
    </template>

    <!-- Stale -->
    <template v-else-if="status === 'stale' && result">
      <div class="note">Settings changed since the last slice.</div>
      <ResultCard :result="result" dim />
      <Button variant="primary" size="lg" block :disabled="!canSlice" @click="runSlice">Slice again</Button>
      <p v-if="reason" class="reason">{{ reason }}</p>
    </template>

    <!-- Error -->
    <template v-else-if="status === 'error'">
      <div class="callout" role="alert">
        <strong>Slicing failed</strong>
        <span>{{ app.slice.error || 'The slicing engine stopped without saying why.' }}</span>
      </div>
      <Button variant="primary" size="lg" block :disabled="!canSlice" @click="runSlice">Slice again</Button>
      <p v-if="reason && reason !== app.slice.error" class="reason">{{ reason }}</p>
    </template>

    <!-- Idle -->
    <template v-else>
      <Button variant="primary" size="lg" block :disabled="!canSlice" @click="runSlice">Slice</Button>
      <p v-if="reason" class="reason">{{ reason }}</p>
    </template>
  </section>
</template>

<style scoped>
.slicebar {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.title {
  font-size: var(--fs-14);
  font-weight: 600;
}
.progress-head .muted {
  font-size: var(--fs-12);
}
.bar {
  position: relative;
  height: 4px;
  border-radius: 2px;
  background: var(--surface-3);
  overflow: hidden;
}
.bar-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: 2px;
  background: var(--accent);
  transition: width 200ms var(--ease);
}
.pct {
  margin-left: 6px;
  font-weight: 500;
  color: var(--text-2);
}
.stage {
  margin-top: -2px;
  font-size: var(--fs-12);
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-run {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 35%;
  border-radius: 2px;
  background: var(--accent);
  animation: run 1.2s var(--ease) infinite;
}
@keyframes run {
  from {
    left: -35%;
  }
  to {
    left: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bar-run {
    animation: none;
    left: 0;
    width: 100%;
    opacity: 0.5;
  }
}
.note {
  padding: 6px 10px;
  border-radius: var(--r);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: var(--fs-12);
  font-weight: 500;
}
.callout {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--danger);
  border-radius: var(--r);
  background: var(--danger-soft);
  font-size: var(--fs-12);
  color: var(--text);
  user-select: text;
  max-height: 160px;
  overflow: auto;
}
.callout strong {
  font-size: var(--fs-13);
  font-weight: 600;
  color: var(--danger);
}
.reason {
  margin-top: -4px;
  font-size: var(--fs-12);
  color: var(--text-2);
}
</style>
