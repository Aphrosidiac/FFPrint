<script setup lang="ts">
// Title-bar row (draggable). Windows draws its caption buttons over the right edge (titleBarOverlay).
import { computed, ref } from 'vue'
import { FolderOpen, Save, Clock, Settings2, Layers, Box, ChevronDown, FileClock, Undo2, Redo2 } from 'lucide-vue-next'
import { app, openDialog, openPaths, saveProject } from '@/stores/app'
import { hasObjects } from '@/stores/scene'
import { canRedo, canUndo, redo, undo } from '@/stores/undo'
import { api, platform } from '@/lib/api'
import Segmented from '@/ui/Segmented.vue'

const isMac = platform() === 'darwin'
const recentOpen = ref(false)
const recent = ref<string[]>([])

const modeOptions = computed(() => [
  { id: 'prepare' as const, label: 'Prepare' },
  { id: 'preview' as const, label: 'Preview' }
])

async function toggleRecent(): Promise<void> {
  recentOpen.value = !recentOpen.value
  if (recentOpen.value) recent.value = await api.recentFiles()
}
function openRecent(p: string): void {
  recentOpen.value = false
  app.page = 'workspace'
  openPaths([p])
}
const base = (p: string): string => p.split(/[\\/]/).pop() ?? p

function go(page: typeof app.page): void {
  app.page = app.page === page ? 'workspace' : page
}
</script>

<template>
  <header class="top" :class="{ mac: isMac }">
    <div class="brand">
      <span class="mark">FF</span>
      <span class="name">FF Print</span>
      <span class="printer">Ender-3 V3 SE</span>
    </div>

    <div class="group">
      <button type="button" class="tb" title="Open models (Ctrl+O)" @click="app.page = 'workspace'; openDialog()"><FolderOpen /><span>Open</span></button>
      <div class="recent">
        <button type="button" class="tb icon" title="Recent files" :class="{ on: recentOpen }" @click="toggleRecent"><ChevronDown /></button>
        <div v-if="recentOpen" class="menu" @mouseleave="recentOpen = false">
          <div class="menu-title">Recent</div>
          <button v-for="p in recent" :key="p" type="button" class="menu-item" :title="p" @click="openRecent(p)">
            <FileClock /><span>{{ base(p) }}</span>
          </button>
          <div v-if="!recent.length" class="menu-empty">Nothing opened yet</div>
        </div>
      </div>
      <button type="button" class="tb" title="Save project (Ctrl+S)" :disabled="!hasObjects" @click="saveProject"><Save /><span>Save project</span></button>
      <span class="sep" />
      <button type="button" class="tb icon" title="Undo (Ctrl+Z)" aria-label="Undo" :disabled="!canUndo || app.page !== 'workspace'" @click="undo"><Undo2 /></button>
      <button type="button" class="tb icon" title="Redo (Ctrl+Y)" aria-label="Redo" :disabled="!canRedo || app.page !== 'workspace'" @click="redo"><Redo2 /></button>
    </div>

    <div class="centre">
      <Segmented v-if="app.page === 'workspace'" v-model="app.mode" :options="modeOptions" size="sm" class="modes" />
      <div v-else class="page-title">
        {{ app.page === 'filaments' ? 'Filament library' : app.page === 'machine' ? 'Printer' : 'History' }}
      </div>
    </div>

    <div class="group right">
      <button type="button" class="tb" :class="{ on: app.page === 'workspace' }" title="Workspace" @click="app.page = 'workspace'"><Box /><span>Workspace</span></button>
      <button type="button" class="tb" :class="{ on: app.page === 'filaments' }" title="Filament library" @click="go('filaments')"><Layers /><span>Filaments</span></button>
      <button type="button" class="tb" :class="{ on: app.page === 'history' }" title="History" @click="go('history')"><Clock /><span>History</span></button>
      <button type="button" class="tb" :class="{ on: app.page === 'machine' }" title="Printer settings" @click="go('machine')"><Settings2 /><span>Printer</span></button>
    </div>
  </header>
</template>

<style scoped>
.top {
  height: var(--topbar-h);
  flex: none;
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 12px;
  /* leave room for the Windows caption buttons (138px) */
  padding: 0 calc(140px + 8px) 0 12px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
}
.top.mac {
  padding: 0 12px 0 80px;
}
.top button,
.top .modes,
.top .menu {
  -webkit-app-region: no-drag;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 8px;
  border-right: 1px solid var(--border);
  height: 24px;
}
.mark {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: var(--text);
  color: var(--surface);
  font-size: var(--fs-11);
  font-weight: 600;
  letter-spacing: -0.02em;
}
.name {
  font-weight: 600;
  font-size: var(--fs-13);
}
.printer {
  color: var(--text-3);
  font-size: var(--fs-12);
}
.group {
  display: flex;
  align-items: center;
  gap: 2px;
}
.centre {
  display: flex;
  justify-content: center;
}
.modes {
  width: 200px;
}
.page-title {
  font-weight: 600;
  font-size: var(--fs-13);
}
.tb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r);
  background: transparent;
  color: var(--text-2);
  font-size: var(--fs-12);
  font-weight: 500;
  cursor: pointer;
}
.tb.icon {
  padding: 0 4px;
  margin-left: -2px;
}
.tb:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}
.tb.on {
  color: var(--text);
  background: var(--surface-3);
}
.tb:disabled {
  opacity: 0.45;
  cursor: default;
}
.tb svg {
  width: 15px;
  height: 15px;
}
.recent {
  position: relative;
}
.sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--border);
}
.menu {
  position: absolute;
  top: 32px;
  left: 0;
  z-index: 40;
  width: 300px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}
.menu-title {
  padding: 6px 8px 4px;
  font-size: var(--fs-11);
  font-weight: 600;
  color: var(--text-3);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  font-size: var(--fs-13);
  cursor: pointer;
}
.menu-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.menu-item svg {
  width: 14px;
  height: 14px;
  color: var(--text-3);
  flex: none;
}
.menu-item:hover {
  background: var(--surface-3);
}
.menu-empty {
  padding: 8px;
  color: var(--text-3);
  font-size: var(--fs-12);
}
</style>
