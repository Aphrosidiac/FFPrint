<script setup lang="ts">
// Preview mode: the sliced toolpaths on the bed, a layer range slider on the right, the feature
// legend bottom-left and view presets top-right, in the same place and style as Prepare's.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Scan, SquareDashed } from 'lucide-vue-next'
import ViewIcon from '@/viewport/ViewIcon.vue'
import { app, blockingIssues, runSlice } from '@/stores/app'
import Button from '@/ui/Button.vue'
import IconButton from '@/ui/IconButton.vue'
import LayerSlider from './LayerSlider.vue'
import Legend from './Legend.vue'
import { currentParse, isFeatureVisible, loadPreview, preview } from './state'
import { PreviewScene } from './toolpaths'
import { setPreviewView, type PreviewView } from './actions'
import { setPlateVisible } from '@/viewport/actions'
import { ws } from '@/viewport/workspace'

const host = ref<HTMLElement>()
let view: PreviewScene | null = null

const result = computed(() => app.slice.result)
const stale = computed(() => app.slice.status === 'stale' || (app.slice.status === 'error' && !!result.value))
const blocked = computed(() => blockingIssues())

function build(): void {
  const p = currentParse()
  if (!view || !p || preview.status !== 'ready') return
  const t = performance.now()
  view.load(p, isFeatureVisible, preview.travel)
  view.setRange(preview.range[0], preview.range[1])
  view.setView(preview.view)
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ;(window as unknown as { __ffPreviewBuildMs?: number }).__ffPreviewBuildMs = Math.round(performance.now() - t)
    })
  )
}

onMounted(() => {
  if (!host.value) return
  view = new PreviewScene(host.value)
  view.setPlateVisible(ws.plate)
  ;(window as unknown as { __ffPreview: unknown }).__ffPreview = { preview, view }
  if (result.value) loadPreview(result.value)
  build()
})
onBeforeUnmount(() => {
  view?.dispose()
  view = null
})

watch(
  () => result.value?.id,
  () => {
    if (result.value) loadPreview(result.value)
  }
)
watch(() => preview.revision, build)
watch(
  () => [preview.range[0], preview.range[1]],
  ([lo, hi]) => view?.setRange(lo, hi)
)
watch(
  () => ({ ...preview.hidden }),
  (h) => {
    for (const r of preview.legend) view?.setFeatureVisible(r.type, !h[r.type])
  }
)
watch(
  () => preview.travel,
  (on) => view?.setTravelVisible(on)
)

watch(
  () => ws.plate,
  (on) => view?.setPlateVisible(on)
)

watch(
  () => preview.viewSeq,
  () => view?.setView(preview.view)
)
watch(
  () => preview.fitSeq,
  () => view?.fit()
)
const activeView = computed(() => preview.view)
const setView = (v: PreviewView): void => setPreviewView(v)
</script>

<template>
  <div class="preview">
    <div ref="host" class="canvas" />

    <div class="tools" role="toolbar" aria-label="Views">
      <IconButton size="sm" label="Iso view" :active="activeView === 'iso'" @click="setView('iso')"><ViewIcon view="iso" /></IconButton>
      <IconButton size="sm" label="Top view" :active="activeView === 'top'" @click="setView('top')"><ViewIcon view="top" /></IconButton>
      <IconButton size="sm" label="Front view" :active="activeView === 'front'" @click="setView('front')"><ViewIcon view="front" /></IconButton>
      <span class="sep" />
      <IconButton size="sm" label="Fit to the print" @click="setView('fit')"><Scan /></IconButton>
      <IconButton size="sm" :label="ws.plate ? 'Hide plate (P)' : 'Show plate (P)'" :active="!ws.plate" @click="setPlateVisible(!ws.plate)"><SquareDashed /></IconButton>
    </div>

    <div v-if="result && stale" class="banner">Preview is from the previous slice</div>

    <div v-if="!result" class="empty">
      <div class="empty-card">
        <strong>Slice to see the toolpaths</strong>
        <span v-if="blocked.length" class="muted">{{ blocked[0] }}</span>
        <span v-else class="muted">Every wall, infill line and support, layer by layer.</span>
        <Button variant="primary" :disabled="!!blocked.length || !app.engine.ok || app.slice.status === 'slicing'" @click="runSlice">Slice</Button>
      </div>
    </div>

    <div v-else-if="preview.status === 'loading'" class="loading">
      <span>{{ preview.phase === 'reading' ? 'Reading the G-code' : 'Building the toolpaths' }}</span>
      <div class="bar"><div class="bar-fill" :style="{ width: Math.round(preview.progress * 100) + '%' }" /></div>
    </div>

    <div v-else-if="preview.status === 'error'" class="empty">
      <div class="empty-card">
        <strong>The preview could not be built</strong>
        <span class="muted">{{ preview.error }}</span>
      </div>
    </div>

    <template v-if="result && preview.status === 'ready'">
      <Legend class="legend" />
      <LayerSlider v-if="preview.layers.length > 1" v-model="preview.range" class="slider" :layers="preview.layers" />
    </template>
  </div>
</template>

<style scoped>
.preview {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.canvas {
  position: absolute;
  inset: 0;
}
.tools {
  position: absolute;
  top: 8px;
  right: 8px;
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
.banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: var(--fs-12);
  font-weight: 500;
  white-space: nowrap;
  background-clip: padding-box;
}
.empty,
.loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 320px;
  padding: 20px 24px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
  text-align: center;
  pointer-events: auto;
}
.empty-card strong {
  font-size: var(--fs-14);
  font-weight: 600;
}
.empty-card span {
  font-size: var(--fs-12);
}
.empty-card .btn {
  margin-top: 4px;
  min-width: 120px;
}
.loading {
  align-content: center;
  gap: 8px;
  color: var(--text-2);
  font-size: var(--fs-12);
}
.loading .bar {
  width: 200px;
  height: 4px;
  border-radius: 2px;
  background: var(--surface-3);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--accent);
  transition: width 120ms linear;
}
.legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
}
.slider {
  position: absolute;
  right: 14px;
  top: 56px;
  bottom: 16px;
}
</style>
