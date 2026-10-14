<script setup lang="ts">
// Shown in the Objects panel while the bed is empty: every model opened or printed before, newest
// first. Click a tile to put it back on the bed; the x removes it from this list (never the file).
import { computed, onMounted, ref } from 'vue'
import { Box, Search, X } from 'lucide-vue-next'
import type { PastModel } from '@shared/types'
import { hidePast, openPast, past, refreshPast, reportOpenError } from '@/stores/pastModels'

const query = ref('')
const opening = ref<string | null>(null)

const SOURCE: Record<PastModel['source'], string> = { ffprint: 'Opened', creality: 'Creality', printed: 'Printed' }

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? past.items.filter((m) => m.name.toLowerCase().includes(q)) : past.items
})

function day(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

async function open(m: PastModel): Promise<void> {
  if (opening.value) return
  opening.value = m.id
  try {
    await openPast(m)
  } catch (e) {
    reportOpenError(e)
  } finally {
    opening.value = null
  }
}

onMounted(() => void refreshPast())
</script>

<template>
  <section class="past">
    <div class="head">
      <span class="title">Past models</span>
      <span v-if="past.items.length" class="count num">{{ past.items.length }}</span>
    </div>

    <label v-if="past.items.length > 6" class="search">
      <Search />
      <input v-model="query" type="search" placeholder="Search" aria-label="Search past models" />
    </label>

    <div v-if="!past.loaded && past.loading" class="grid">
      <div v-for="i in 4" :key="i" class="tile skeleton"><div class="thumb" /><div class="line" /></div>
    </div>

    <p v-else-if="!past.items.length" class="empty">Models you open or print show up here, ready to put back on the bed.</p>

    <p v-else-if="!shown.length" class="empty">Nothing matches “{{ query }}”.</p>

    <div v-else class="grid">
      <div
        v-for="m in shown"
        :key="m.id"
        class="tile"
        :class="{ busy: opening === m.id }"
        role="button"
        tabindex="0"
        :title="`${m.name}\n${m.path}`"
        @click="open(m)"
        @keydown.enter.prevent="open(m)"
      >
        <div class="thumb">
          <img v-if="m.thumbnail" :src="m.thumbnail" alt="" draggable="false" />
          <Box v-else class="ph" />
          <span class="ext">{{ m.kind === 'job' ? 'job' : m.ext }}</span>
        </div>
        <div class="name">{{ m.name }}</div>
        <div class="meta">{{ SOURCE[m.source] }} · {{ day(m.date) }}</div>
        <button type="button" class="hide" :aria-label="`Remove ${m.name} from this list`" title="Remove from this list" @click.stop="hidePast(m)"><X /></button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.past {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.title {
  font-size: var(--fs-12);
  font-weight: 600;
  color: var(--text-2);
}
.count {
  padding: 0 6px;
  border-radius: 10px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: var(--fs-11);
  line-height: 18px;
}
.search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--control-h-sm);
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
}
.search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search svg {
  width: 14px;
  height: 14px;
  color: var(--text-3);
  flex: none;
}
.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: var(--fs-12);
}
.empty {
  color: var(--text-3);
  font-size: var(--fs-12);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 4px 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.tile:hover,
.tile:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
  outline: none;
}
.tile.busy {
  opacity: 0.6;
  cursor: progress;
}
.thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
  border-radius: var(--r);
  background: var(--surface-2);
  overflow: hidden;
  margin-bottom: 4px;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.thumb .ph {
  width: 22px;
  height: 22px;
  color: var(--text-3);
}
.ext {
  position: absolute;
  left: 4px;
  bottom: 4px;
  padding: 0 4px;
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text-3);
  font-size: var(--fs-11);
  line-height: 16px;
  text-transform: uppercase;
}
.name {
  padding: 0 2px;
  font-size: var(--fs-12);
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.meta {
  padding: 0 2px;
  font-size: var(--fs-11);
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hide {
  position: absolute;
  top: 8px;
  right: 8px;
  display: none;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
}
.tile:hover .hide {
  display: grid;
}
.hide:hover {
  color: var(--danger);
}
.hide svg {
  width: 12px;
  height: 12px;
}
.skeleton {
  cursor: default;
}
.skeleton .line {
  height: 10px;
  margin: 2px;
  border-radius: 4px;
  background: var(--surface-3);
}
</style>
