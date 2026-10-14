<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { app, init, openDialog, openPaths, saveProject } from '@/stores/app'
import { pathForFile } from '@/lib/api'
import { initTheme } from '@/lib/theme'
import TopBar from '@/panels/TopBar.vue'
import ObjectPanel from '@/panels/ObjectPanel.vue'
import PrintPanel from '@/panels/PrintPanel.vue'
import SliceBar from '@/panels/SliceBar.vue'
import Viewport from '@/viewport/Viewport.vue'
import PreviewView from '@/preview/PreviewView.vue'
import FilamentsPage from '@/pages/FilamentsPage.vue'
import MachinePage from '@/pages/MachinePage.vue'
import HistoryPage from '@/pages/HistoryPage.vue'
import Toasts from '@/ui/Toasts.vue'

const dragging = ref(false)
let dragDepth = 0

function onKey(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || document.querySelector('dialog[open]')) return
  const k = e.key.toLowerCase()
  if (k === 'o') {
    e.preventDefault()
    app.page = 'workspace'
    openDialog()
  } else if (k === 's' && app.page === 'workspace') {
    e.preventDefault()
    saveProject()
  }
}

onMounted(async () => {
  await init()
  initTheme()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
}
function onDragEnter(e: DragEvent): void {
  if (!hasFiles(e)) return
  dragDepth++
  dragging.value = true
}
function onDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function onDrop(e: DragEvent): void {
  dragDepth = 0
  dragging.value = false
  const paths = [...(e.dataTransfer?.files ?? [])].map((f) => pathForFile(f)).filter(Boolean)
  if (paths.length) {
    app.page = 'workspace'
    openPaths(paths)
  }
}
</script>

<template>
  <div class="app" @dragenter.prevent="onDragEnter" @dragover.prevent @dragleave="onDragLeave" @drop.prevent="onDrop">
    <TopBar />
    <main v-if="app.ready" class="main">
      <template v-if="app.page === 'workspace'">
        <aside class="left"><ObjectPanel /></aside>
        <section class="centre">
          <Viewport v-show="app.mode === 'prepare'" />
          <PreviewView v-if="app.mode === 'preview'" />
        </section>
        <aside class="right">
          <PrintPanel />
          <SliceBar />
        </aside>
      </template>
      <FilamentsPage v-else-if="app.page === 'filaments'" />
      <MachinePage v-else-if="app.page === 'machine'" />
      <HistoryPage v-else-if="app.page === 'history'" />
    </main>
    <div v-if="dragging" class="drop">
      <div class="drop-card">
        <strong>Drop to add to the bed</strong>
        <span>STL, OBJ, 3MF or an FF Print project</span>
      </div>
    </div>
    <Toasts />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.main {
  flex: 1;
  min-height: 0;
  display: flex;
}
.left {
  width: var(--left-w);
  flex: none;
  border-right: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.centre {
  flex: 1;
  min-width: 0;
  position: relative;
  background: var(--viewport-bg);
}
.right {
  width: var(--right-w);
  flex: none;
  border-left: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.drop {
  position: fixed;
  inset: var(--topbar-h) 0 0 0;
  display: grid;
  place-items: center;
  background: rgb(37 99 235 / 0.08);
  border: 2px dashed var(--accent);
  pointer-events: none;
  z-index: 50;
}
.drop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 24px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}
.drop-card strong {
  font-size: var(--fs-14);
  font-weight: 600;
}
.drop-card span {
  color: var(--text-2);
  font-size: var(--fs-12);
}
</style>
