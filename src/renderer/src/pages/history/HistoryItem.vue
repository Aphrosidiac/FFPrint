<script setup lang="ts">
// One saved job: thumbnail, name, when, where it went, settings, filament, estimate vs real time.
import { computed, ref } from 'vue'
import { Clock, FolderOpen, RotateCcw, Trash2 } from 'lucide-vue-next'
import { QUALITIES, settingsSummary } from '@shared/settings'
import type { HistoryEntry } from '@shared/types'
import { errorText } from '@/lib/api'
import { duration, grams, meters, money, when } from '@/lib/format'
import { app, toast } from '@/stores/app'
import { setActualTime, showJobFile } from '@/stores/outputActions'
import Button from '@/ui/Button.vue'
import IconButton from '@/ui/IconButton.vue'
import NumberField from '@/ui/NumberField.vue'

const props = defineProps<{ entry: HistoryEntry }>()
const emit = defineEmits<{ reprint: []; remove: [] }>()

const e = computed(() => props.entry)
const quality = computed(() => QUALITIES.find((q) => q.id === e.value.settings.quality)?.label ?? '')
const summary = computed(() => `${quality.value ? quality.value + ' · ' : ''}${settingsSummary(e.value.settings)}`)
const where = computed(() => {
  const p = e.value.savedTo
  const drive = app.drives.find((d) => p.toUpperCase().startsWith(d.root.toUpperCase()))
  return drive ? `SD card ${drive.root.replace(/\\$/, '')}` : p.replace(/[\\/][^\\/]*$/, '') || p
})
const delta = computed(() => {
  const a = e.value.actualSeconds
  const est = e.value.stats.seconds || e.value.stats.estimateSeconds
  if (!a || !est) return ''
  const d = Math.round(((a - est) / est) * 100)
  return d === 0 ? 'on time' : d > 0 ? `+${d}%` : `${d}%`
})

// "Enter actual print time"
const editing = ref(false)
const hours = ref(0)
const minutes = ref(0)
const busy = ref(false)
function startEdit(): void {
  const s = e.value.actualSeconds ?? e.value.stats.seconds
  hours.value = Math.floor(s / 3600)
  minutes.value = Math.round((s % 3600) / 60)
  editing.value = true
}
async function saveActual(seconds: number | null): Promise<void> {
  busy.value = true
  try {
    await setActualTime(e.value.id, seconds)
    editing.value = false
  } catch (err) {
    toast('error', errorText(err))
  } finally {
    busy.value = false
  }
}
function commit(): void {
  const s = Math.round(hours.value) * 3600 + Math.round(minutes.value) * 60
  if (s <= 0) return
  saveActual(s)
}
</script>

<template>
  <article class="item">
    <div class="thumb">
      <img v-if="e.thumbnail" :src="e.thumbnail" alt="" />
      <span v-else class="no-thumb">No preview</span>
    </div>

    <div class="body">
      <div class="title-row">
        <h3 :title="e.jobName">{{ e.jobName }}</h3>
        <span class="date num">{{ when(e.createdAt) }}</span>
      </div>
      <div class="line file">
        <span class="fname" :title="e.savedTo">{{ e.fileName }}</span>
        <span class="sep">·</span>
        <span class="where" :title="e.savedTo">{{ where }}</span>
      </div>
      <div class="line settings" :title="summary">{{ summary }}</div>
      <div class="facts">
        <div class="fact">
          <span class="k">Filament</span>
          <span class="v num">{{ e.filamentName }} · {{ grams(e.stats.filamentG) }} · {{ meters(e.stats.filamentMm) }} · {{ money(e.stats.cost, app.prefs?.currency || 'RM') }}</span>
        </div>
        <div class="fact">
          <span class="k">Estimate</span>
          <span class="v num" :title="`Engine estimate ${duration(e.stats.estimateSeconds)}`">{{ duration(e.stats.seconds) }}</span>
        </div>
        <div class="fact">
          <span class="k">Actual</span>
          <span v-if="e.actualSeconds" class="v num">
            {{ duration(e.actualSeconds) }}
            <span class="delta">{{ delta }}</span>
          </span>
          <button v-else type="button" class="v enter" @click="startEdit">Enter time</button>
        </div>
      </div>

      <div v-if="editing" class="edit">
        <span class="edit-label">Actual print time</span>
        <NumberField v-model="hours" unit="h" :min="0" :max="999" width="80px" aria-label="Hours" />
        <NumberField v-model="minutes" unit="min" :min="0" :max="59" width="88px" aria-label="Minutes" />
        <Button size="sm" variant="primary" :disabled="busy || hours * 60 + minutes <= 0" @click="commit">Save</Button>
        <Button size="sm" variant="ghost" :disabled="busy" @click="editing = false">Cancel</Button>
        <Button v-if="e.actualSeconds" size="sm" variant="ghost" :disabled="busy" @click="saveActual(null)">Clear</Button>
      </div>
    </div>

    <div class="actions">
      <Button size="sm" @click="emit('reprint')"><RotateCcw /> Reprint</Button>
      <div class="icons">
        <IconButton size="sm" :label="e.actualSeconds ? 'Change the actual print time' : 'Enter the actual print time'" :active="editing" @click="editing ? (editing = false) : startEdit()">
          <Clock />
        </IconButton>
        <IconButton size="sm" label="Show the file" @click="showJobFile(e.id).catch((err) => toast('error', errorText(err)))"><FolderOpen /></IconButton>
        <IconButton size="sm" label="Delete from history" @click="emit('remove')"><Trash2 /></IconButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.item {
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr) auto;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
}
.thumb {
  width: 128px;
  height: 96px;
  border-radius: var(--r);
  background: var(--viewport-bg);
  overflow: hidden;
  display: grid;
  place-items: center;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.no-thumb {
  font-size: var(--fs-11);
  color: var(--text-3);
}
.body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
h3 {
  font-size: var(--fs-14);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.date {
  flex: none;
  font-size: var(--fs-12);
  color: var(--text-3);
}
.line {
  font-size: var(--fs-12);
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file {
  display: flex;
  gap: 6px;
}
.fname {
  font-family: var(--mono);
  font-size: var(--fs-12);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 0 1 auto;
  min-width: 0;
}
.where {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.sep {
  color: var(--text-3);
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 24px;
  margin-top: 8px;
}
.fact {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.k {
  font-size: var(--fs-11);
  color: var(--text-3);
  line-height: 16px;
}
.v {
  font-size: var(--fs-13);
  line-height: 18px;
  white-space: nowrap;
}
.enter {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-text);
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.enter:hover {
  text-decoration: underline;
}
.delta {
  margin-left: 4px;
  font-size: var(--fs-12);
  color: var(--text-2);
}
.edit {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.edit-label {
  font-size: var(--fs-12);
  color: var(--text-2);
  margin-right: 4px;
}
.actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.icons {
  display: flex;
  gap: 2px;
}
</style>
