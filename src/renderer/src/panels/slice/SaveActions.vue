<script setup lang="ts">
// Output: file name, Save to SD card (when the printer's card is in), Save as..., then the saved
// confirmation with Eject.
import { computed, ref, watch } from 'vue'
import { CircleCheck, FolderOpen, HardDrive } from 'lucide-vue-next'
import type { SliceResult } from '@shared/types'
import { api } from '@/lib/api'
import { bytes } from '@/lib/format'
import { app, toast } from '@/stores/app'
import Button from '@/ui/Button.vue'
import SelectField from '@/ui/SelectField.vue'
import { errorText } from '@/lib/api'
import { ejectCard, output, saveAs, saveToCard } from '@/stores/outputActions'

const props = defineProps<{ result: SliceResult }>()

const stem = (n: string): string => n.replace(/\.gcode$/i, '')
const name = ref(stem(props.result.fileName))
watch(
  () => props.result.id,
  () => {
    name.value = stem(props.result.fileName)
  }
)
const fileName = computed(() => `${name.value.trim() || stem(props.result.fileName)}.gcode`)

const cards = computed(() => app.drives.filter((d) => d.likelyPrinterCard))
const driveRoot = ref('')
watch(
  cards,
  (list) => {
    if (!list.some((d) => d.root === driveRoot.value)) driveRoot.value = list[0]?.root ?? ''
  },
  { immediate: true }
)
const drive = computed(() => cards.value.find((d) => d.root === driveRoot.value))
const letter = (root: string): string => root.replace(/\\$/, '')
const driveOptions = computed(() => cards.value.map((d) => ({ value: d.root, label: `${letter(d.root)}  ${d.label || 'SD card'} · ${bytes(d.freeBytes)} free` })))

const saved = computed(() => (output.saved && output.saved.resultId === props.result.id ? output.saved : null))
const savedOnCard = computed(() => !!saved.value?.drive)

async function run(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    toast('error', errorText(e))
  }
}
const saveCard = (): Promise<void> => run(() => saveToCard(drive.value?.root, fileName.value))
const saveFile = (): Promise<void> => run(() => saveAs(fileName.value))
const eject = (): Promise<void> => run(() => ejectCard(saved.value?.drive))
</script>

<template>
  <div class="save">
    <label class="name-field">
      <span class="name-label">File name</span>
      <span class="input">
        <input v-model="name" spellcheck="false" aria-label="File name" @keydown.enter="($event.target as HTMLInputElement).blur()" />
        <span class="ext">.gcode</span>
      </span>
    </label>

    <template v-if="cards.length">
      <SelectField v-if="cards.length > 1" v-model="driveRoot" :options="driveOptions" aria-label="SD card" class="drive-select" />
      <Button variant="primary" size="lg" block :disabled="output.saving" @click="saveCard">
        <HardDrive />
        <span>Save to SD card</span>
        <span v-if="drive" class="drive num">{{ letter(drive.root) }} {{ drive.label }}</span>
      </Button>
      <Button block :disabled="output.saving" @click="saveFile">Save as...</Button>
    </template>
    <template v-else>
      <Button variant="primary" size="lg" block :disabled="output.saving" @click="saveFile">Save as...</Button>
      <p class="hint"><HardDrive /> Insert the printer's SD card to save straight to it.</p>
    </template>

    <div v-if="saved" class="saved" role="status">
      <div class="saved-head">
        <CircleCheck />
        <span>{{ savedOnCard ? 'Saved to the SD card' : 'Saved' }}</span>
      </div>
      <div class="path num" :title="saved.path">{{ saved.path }}</div>
      <div class="saved-actions">
        <Button v-if="savedOnCard && saved.eject !== 'done'" size="sm" :disabled="saved.eject === 'ejecting'" @click="eject">
          {{ saved.eject === 'ejecting' ? 'Ejecting...' : 'Eject card' }}
        </Button>
        <Button size="sm" variant="ghost" @click="api.showItemInFolder(saved.path)"><FolderOpen /> Show file</Button>
      </div>
      <p v-if="saved.eject === 'done'" class="eject ok">Card ejected. You can take it out and put it in the printer.</p>
      <p v-else-if="saved.eject === 'error'" class="eject err">{{ saved.ejectMessage }}</p>
    </div>
  </div>
</template>

<style scoped>
.save {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.name-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.name-label {
  font-size: var(--fs-12);
  color: var(--text-2);
}
.input {
  display: flex;
  align-items: center;
  height: var(--control-h);
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  cursor: text;
  transition: border-color var(--dur) var(--ease);
}
.input:hover {
  border-color: var(--text-3);
}
.input:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.input input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: var(--fs-13);
}
.ext {
  color: var(--text-3);
  font-size: var(--fs-12);
}
.drive {
  margin-left: auto;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--fs-12);
  font-weight: 500;
  opacity: 0.85;
}
.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-12);
  color: var(--text-2);
}
.hint svg {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--text-3);
}
.saved {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 8px 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--success-soft);
}
.saved-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--success);
  font-size: var(--fs-13);
  font-weight: 600;
}
.saved-head svg {
  width: 16px;
  height: 16px;
}
.path {
  font-size: var(--fs-12);
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: text;
}
.saved-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.eject {
  font-size: var(--fs-12);
}
.eject.ok {
  color: var(--text-2);
}
.eject.err {
  color: var(--danger);
}
</style>
