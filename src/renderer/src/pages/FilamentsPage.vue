<script setup lang="ts">
// The filament library: the spools Fakhrul owns. Add (pre-filled per material), edit, duplicate, delete,
// and choose which one the next print uses.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown, Copy, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { MATERIALS, MATERIAL_COLORS as COLORS, newFilament } from '@shared/settings'
import type { Filament, Material } from '@shared/types'
import { app, toast } from '@/stores/app'
import { errorText } from '@/lib/api'
import { createFilament, deleteFilament, selectFilament, updateFilament } from '@/stores/settingsActions'
import { money } from '@/lib/format'
import Button from '@/ui/Button.vue'
import Dialog from '@/ui/Dialog.vue'
import IconButton from '@/ui/IconButton.vue'
import FilamentEditor from './filaments/FilamentEditor.vue'
import BackLink from '@/ui/BackLink.vue'

const materialLabel = (m: Material): string => MATERIALS.find((x) => x.id === m)?.label ?? m
const currency = computed(() => app.prefs?.currency ?? 'RM')
const temp = (t: number, first: number): string => (first !== t ? `${t} °C (${first})` : `${t} °C`)

// ---- editor
const editing = ref<Filament | null>(null)
const isNew = ref(false)
function edit(f: Filament): void {
  isNew.value = false
  editing.value = f
}
function add(m: Material): void {
  addOpen.value = false
  isNew.value = true
  editing.value = newFilament(app.filaments, { material: m })
}
function duplicate(f: Filament): void {
  isNew.value = true
  editing.value = { ...f, id: '', name: `${f.name} copy` }
}
async function save(f: Filament): Promise<void> {
  try {
    const entry = isNew.value ? await createFilament(f) : await updateFilament(f.id, f)
    toast('success', isNew.value ? `Added ${entry.name}.` : `Saved ${entry.name}.`)
    editing.value = null
  } catch (e) {
    toast('error', errorText(e))
  }
}

// ---- delete
const deleting = ref<Filament | null>(null)
const deleteOpen = computed({ get: () => !!deleting.value, set: (v) => !v && (deleting.value = null) })
async function confirmDelete(): Promise<void> {
  const f = deleting.value
  deleting.value = null
  if (!f) return
  try {
    await deleteFilament(f.id)
    toast('info', `Deleted ${f.name}.`)
  } catch (e) {
    toast('error', errorText(e))
  }
}

// ---- add menu
const addOpen = ref(false)
const addRoot = ref<HTMLElement>()
function onDocDown(e: MouseEvent): void {
  if (addRoot.value && !addRoot.value.contains(e.target as Node)) addOpen.value = false
}
watch(addOpen, (v) => (v ? document.addEventListener('mousedown', onDocDown) : document.removeEventListener('mousedown', onDocDown)))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocDown))
</script>

<template>
  <div class="page">
    <div class="inner">
      <BackLink />
      <header class="head">
        <div>
          <h1>Filament library</h1>
          <p class="sub">The spools you own. Temperatures, flow, fan and price go into every print made with them.</p>
        </div>
        <div ref="addRoot" class="add">
          <Button variant="primary" :aria-expanded="addOpen" @click="addOpen = !addOpen"><Plus />Add filament<ChevronDown /></Button>
          <div v-if="addOpen" class="menu" role="menu">
            <div class="menu-title">Start from</div>
            <button v-for="m in MATERIALS" :key="m.id" type="button" role="menuitem" class="menu-item" @click="add(m.id)">
              <span class="dot" :style="{ background: COLORS[m.id] }" />{{ m.label }}
            </button>
          </div>
        </div>
      </header>

      <div class="table" role="table" aria-label="Filaments">
        <div class="tr th" role="row">
          <span role="columnheader">Name</span>
          <span role="columnheader">Brand</span>
          <span role="columnheader">Material</span>
          <span role="columnheader" class="r" title="Nozzle temperature (first layer in brackets when different)">Nozzle</span>
          <span role="columnheader" class="r" title="Bed temperature (first layer in brackets when different)">Bed</span>
          <span role="columnheader" class="r">Price / kg</span>
          <span role="columnheader" />
        </div>
        <div v-for="f in app.filaments" :key="f.id" class="tr" :class="{ current: f.id === app.filamentId }" role="row" @dblclick="edit(f)">
          <span class="name-cell" role="cell">
            <span class="swatch" :style="{ background: f.color }" />
            <span class="name-text">
              <span class="name">{{ f.name }}</span>
              <span v-if="f.notes" class="notes">{{ f.notes }}</span>
            </span>
            <span v-if="f.id === app.filamentId" class="badge">In use</span>
          </span>
          <span role="cell" class="muted ell">{{ f.brand || '—' }}</span>
          <span role="cell" class="muted">{{ materialLabel(f.material) }}</span>
          <span role="cell" class="r num">{{ temp(f.nozzleTemp, f.nozzleTempFirstLayer) }}</span>
          <span role="cell" class="r num">{{ temp(f.bedTemp, f.bedTempFirstLayer) }}</span>
          <span role="cell" class="r num">{{ money(f.pricePerKg, currency) }}</span>
          <span role="cell" class="actions">
            <button v-if="f.id !== app.filamentId" type="button" class="use" title="Print with this filament" @click="selectFilament(f.id)">Use</button>
            <IconButton label="Edit" size="sm" @click="edit(f)"><Pencil /></IconButton>
            <IconButton label="Duplicate" size="sm" @click="duplicate(f)"><Copy /></IconButton>
            <IconButton label="Delete" size="sm" @click="deleting = f"><Trash2 /></IconButton>
          </span>
        </div>
      </div>
      <p class="foot">New filaments start from Orca's Creality V3 SE profile for the material. Nozzle temperatures are capped at 260 °C and the bed at 100 °C, the printer's limits.</p>
    </div>

    <FilamentEditor :filament="editing" :is-new="isNew" @save="save" @close="editing = null" />

    <Dialog v-model="deleteOpen" title="Delete filament" width="400px">
      <p class="confirm">Delete <strong>{{ deleting?.name }}</strong> from the library? Past jobs in History keep their settings.</p>
      <template #footer>
        <Button @click="deleting = null">Cancel</Button>
        <Button variant="danger" @click="confirmDelete">Delete</Button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page {
  flex: 1;
  min-width: 0;
  overflow: auto;
}
.inner {
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 24px 40px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
h1 {
  font-family: var(--font-display);
  font-size: var(--fs-20);
  font-weight: 600;
}
.sub {
  margin-top: 4px;
  color: var(--text-2);
}
.add {
  position: relative;
  flex: none;
}
.menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  right: 0;
  width: 200px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop);
}
.menu-title {
  padding: 6px 8px 4px;
  font-size: var(--fs-12);
  color: var(--text-3);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  font-size: var(--fs-13);
  text-align: left;
  cursor: pointer;
}
.menu-item:hover {
  background: var(--surface-3);
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--swatch-ring);
}
.table {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: minmax(200px, 2.2fr) minmax(80px, 1fr) minmax(96px, 1fr) 104px 96px 104px 168px;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 12px 0 16px;
  border-top: 1px solid var(--border);
}
.tr.th {
  min-height: 36px;
  border-top: 0;
  background: var(--surface-2);
  font-size: var(--fs-12);
  font-weight: 500;
  color: var(--text-2);
}
.tr:not(.th):hover {
  background: var(--surface-2);
}
.r {
  text-align: right;
}
.ell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.swatch {
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--swatch-ring);
}
.name-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.notes {
  font-size: var(--fs-12);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  flex: none;
  padding: 0 6px;
  border-radius: var(--r-sm);
  background: var(--accent-soft);
  color: var(--accent-text);
  font-size: var(--fs-11);
  font-weight: 600;
  line-height: 18px;
}
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.use {
  height: 28px;
  margin-right: 4px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  font-size: var(--fs-12);
  font-weight: 500;
  cursor: pointer;
}
.use:hover {
  background: var(--surface-3);
}
/* "Use" appears on the row being pointed at, so ten rows do not shout ten buttons. */
.tr:not(:hover):not(:focus-within) .use {
  visibility: hidden;
}
.foot {
  margin-top: 12px;
  font-size: var(--fs-12);
  color: var(--text-3);
}
.confirm {
  color: var(--text-2);
}
.confirm strong {
  color: var(--text);
  font-weight: 600;
}
</style>
