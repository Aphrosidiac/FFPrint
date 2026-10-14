<script setup lang="ts">
// "More settings": the curated catalogue. Groups on the left, fields on the right, search across all.
import { computed, ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { CATALOGUE, GROUPS, QUALITIES, searchCatalogue } from '@shared/settings'
import { app, currentFilament } from '@/stores/app'
import { resetAllOverrides } from '@/stores/settingsActions'
import Button from '@/ui/Button.vue'
import Dialog from '@/ui/Dialog.vue'
import SettingRow from './SettingRow.vue'

const open = defineModel<boolean>({ required: true })
const group = ref<string>(GROUPS[0])
const query = ref('')
const searchEl = ref<HTMLInputElement>()

const changedIn = (g: string): number => CATALOGUE.filter((d) => d.group === g && app.settings.overrides[d.key] !== undefined).length
const total = computed(() => Object.keys(app.settings.overrides).length)
const results = computed(() => searchCatalogue(query.value))
const fields = computed(() => (query.value.trim() ? results.value : CATALOGUE.filter((d) => d.group === group.value)))
const context = computed(() => {
  const q = QUALITIES.find((x) => x.id === app.settings.quality)
  const f = currentFilament()
  return `Defaults come from the Ender-3 V3 SE profile with Creality Print's tuning, for ${q?.label ?? ''} ${q?.layerHeight.toFixed(2) ?? ''} mm with a ${app.machine?.nozzle ?? '0.4'} mm nozzle${f ? ` and ${f.name}` : ''}.`
})

function pickGroup(g: string): void {
  group.value = g
  query.value = ''
}
/** Escape clears the search first; a second Escape closes the dialog. */
function onEsc(e: KeyboardEvent): void {
  if (!query.value) return
  e.preventDefault()
  query.value = ''
}
const resetAll = (): void => resetAllOverrides()
watch(open, (v) => {
  if (v) requestAnimationFrame(() => searchEl.value?.focus())
})
</script>

<template>
  <Dialog v-model="open" title="More settings" width="760px">
    <div class="ms">
      <div class="search">
        <Search class="icon" />
        <input ref="searchEl" v-model="query" type="text" spellcheck="false" placeholder="Search settings" aria-label="Search settings" @keydown.esc="onEsc" />
        <button v-if="query" type="button" class="clear" aria-label="Clear search" @click="query = ''"><X /></button>
      </div>
      <div class="cols">
        <nav class="groups" aria-label="Setting groups">
          <button v-for="g in GROUPS" :key="g" type="button" class="g" :class="{ on: !query.trim() && g === group }" @click="pickGroup(g)">
            <span>{{ g }}</span>
            <span v-if="changedIn(g)" class="count num">{{ changedIn(g) }}</span>
          </button>
        </nav>
        <div class="fields">
          <p v-if="query.trim()" class="caption">{{ results.length ? `${results.length} matching ${results.length === 1 ? 'setting' : 'settings'}` : 'No setting matches.' }}</p>
          <SettingRow v-for="d in fields" :key="d.key" :def="d" :show-group="!!query.trim()" />
        </div>
      </div>
      <p class="context">{{ context }} Hover a name for what it does.</p>
    </div>
    <template #footer>
      <Button variant="ghost" class="reset-all" :disabled="!total" @click="resetAll">Reset all{{ total ? ` (${total})` : '' }}</Button>
      <Button variant="primary" @click="open = false">Done</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.ms {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search {
  position: relative;
  display: flex;
  align-items: center;
}
.search .icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--text-3);
  pointer-events: none;
}
.search input {
  width: 100%;
  height: var(--control-h);
  padding: 0 32px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  font-size: var(--fs-13);
  outline: 0;
}
.search input:hover {
  border-color: var(--text-3);
}
.search input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search input::placeholder {
  color: var(--text-3);
}
.clear {
  position: absolute;
  right: 4px;
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
.clear:hover {
  background: var(--surface-3);
  color: var(--text);
}
.clear svg {
  width: 14px;
  height: 14px;
}
.cols {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 16px;
  height: min(480px, calc(100vh - 330px));
}
.groups {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
  padding-right: 12px;
  border-right: 1px solid var(--border);
}
.g {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r);
  background: transparent;
  color: var(--text-2);
  font-size: var(--fs-13);
  text-align: left;
  cursor: pointer;
}
.g:hover {
  background: var(--surface-3);
  color: var(--text);
}
.g.on {
  background: var(--accent-soft);
  color: var(--accent-text);
  font-weight: 500;
}
.count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--fs-11);
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
.fields {
  overflow: auto;
  padding-right: 8px;
}
.caption {
  padding: 4px 0 4px;
  font-size: var(--fs-12);
  color: var(--text-3);
}
.context {
  font-size: var(--fs-12);
  color: var(--text-3);
}
.reset-all {
  margin-right: auto;
}
</style>
