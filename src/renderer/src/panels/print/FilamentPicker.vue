<script setup lang="ts">
// The filament the job prints with: current spool on a button, the library in a popover below it.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronDown, Layers } from 'lucide-vue-next'
import { MATERIALS } from '@shared/settings'
import type { Filament } from '@shared/types'
import { app, currentFilament } from '@/stores/app'
import { selectFilament } from '@/stores/settingsActions'

const open = ref(false)
const root = ref<HTMLElement>()
const current = computed(() => currentFilament())

const materialLabel = (f: Filament): string => MATERIALS.find((m) => m.id === f.material)?.label ?? f.material
const temps = (f: Filament): string => `${f.nozzleTemp} °C · bed ${f.bedTemp} °C`

function pick(f: Filament): void {
  selectFilament(f.id)
  open.value = false
}
function manage(): void {
  open.value = false
  app.page = 'filaments'
}

function onDocDown(e: MouseEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false
}
watch(open, (v) => {
  if (v) {
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('mousedown', onDocDown)
    document.removeEventListener('keydown', onKey)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="root" class="fp">
    <button type="button" class="current" :class="{ on: open }" aria-haspopup="listbox" :aria-expanded="open" @click="open = !open">
      <span class="swatch" :style="{ background: current?.color }" />
      <span class="text">
        <span class="name">{{ current?.name ?? 'No filament' }}</span>
        <span v-if="current" class="sub num">{{ materialLabel(current) }} · {{ temps(current) }}</span>
      </span>
      <ChevronDown class="chev" />
    </button>

    <div v-if="open" class="pop" role="listbox">
      <div class="list">
        <button
          v-for="f in app.filaments"
          :key="f.id"
          type="button"
          role="option"
          class="item"
          :aria-selected="f.id === current?.id"
          @click="pick(f)"
        >
          <span class="swatch sm" :style="{ background: f.color }" />
          <span class="text">
            <span class="name">{{ f.name }}</span>
            <span class="sub num">{{ materialLabel(f) }} · {{ temps(f) }}</span>
          </span>
          <Check v-if="f.id === current?.id" class="tick" />
        </button>
      </div>
      <button type="button" class="manage" @click="manage"><Layers /><span>Manage filaments</span></button>
    </div>
  </div>
</template>

<style scoped>
.fp {
  position: relative;
}
.current {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 48px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease);
}
.current:hover,
.current.on {
  border-color: var(--text-3);
}
.swatch {
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--swatch-ring);
}
.swatch.sm {
  width: 16px;
  height: 16px;
}
.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.name {
  font-size: var(--fs-13);
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  font-size: var(--fs-12);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chev {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--text-3);
}
.pop {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}
.list {
  max-height: 296px;
  overflow: auto;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.item:hover {
  background: var(--surface-3);
}
.item[aria-selected='true'] {
  background: var(--accent-soft);
}
.tick {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--accent-text);
}
.manage {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  margin-top: 4px;
  padding: 0 8px;
  border: 0;
  border-top: 1px solid var(--border);
  border-radius: 0 0 var(--r-sm) var(--r-sm);
  background: transparent;
  color: var(--accent-text);
  font-size: var(--fs-13);
  font-weight: 500;
  cursor: pointer;
}
.manage:hover {
  background: var(--surface-3);
}
.manage svg {
  width: 14px;
  height: 14px;
}
</style>
