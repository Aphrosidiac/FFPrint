<script setup lang="ts">
// Saved setups: load one, save the current settings as a new one, update or delete the loaded one.
import { computed, ref } from 'vue'
import { BookmarkPlus, Save, Trash2 } from 'lucide-vue-next'
import { app, toast } from '@/stores/app'
import { errorText } from '@/lib/api'
import { activeSetup, activeSetupId, applySetup, deleteSetup, restoreSettings, saveSetupAs, setupModified, snapshotSettings, updateSetup } from '@/stores/settingsActions'
import Button from '@/ui/Button.vue'
import Dialog from '@/ui/Dialog.vue'
import IconButton from '@/ui/IconButton.vue'
import SelectField from '@/ui/SelectField.vue'
import PanelSection from './PanelSection.vue'
import TextInput from './TextInput.vue'

const options = computed(() => [{ value: '', label: 'Default' }, ...app.setups.map((s) => ({ value: s.id, label: s.name }))])
const selected = computed({
  get: () => (activeSetup.value ? activeSetupId.value : ''),
  set: (id: string) => load(id)
})

function load(id: string): void {
  const before = snapshotSettings()
  const wasModified = setupModified.value
  try {
    applySetup(id)
  } catch (e) {
    toast('error', errorText(e))
    return
  }
  if (wasModified) toast('info', `Loaded ${activeSetup.value?.name ?? 'Default'}. Your unsaved changes were replaced.`, { label: 'Undo', run: () => restoreSettings(before) })
}

async function attempt(fn: () => Promise<unknown>, done: string): Promise<void> {
  try {
    await fn()
    toast('success', done)
  } catch (e) {
    toast('error', errorText(e))
  }
}

const naming = ref(false)
const name = ref('')
const nameTaken = computed(() => app.setups.some((s) => s.name.trim().toLowerCase() === name.value.trim().toLowerCase()))
function startSaveAs(): void {
  name.value = activeSetup.value ? `${activeSetup.value.name} copy` : ''
  naming.value = true
}
async function confirmSaveAs(): Promise<void> {
  const n = name.value.trim()
  if (!n || nameTaken.value) return
  naming.value = false
  await attempt(() => saveSetupAs(n), `Saved setup ${n}.`)
}
async function update(): Promise<void> {
  const n = activeSetup.value?.name
  await attempt(() => updateSetup(), `Updated ${n}.`)
}

const confirmingDelete = ref(false)
async function confirmDelete(): Promise<void> {
  confirmingDelete.value = false
  const n = activeSetup.value?.name
  await attempt(() => deleteSetup(), `Deleted ${n}. The panel keeps its settings.`)
}
</script>

<template>
  <PanelSection title="Setup" help="A saved copy of everything on this panel, including More settings. Save one for each kind of print you make often.">
    <template #meta>
      <span v-if="setupModified" class="modified" title="The settings differ from the loaded setup.">Modified</span>
    </template>
    <div class="row">
      <SelectField v-model="selected" :options="options" aria-label="Saved setup" class="sel" />
      <IconButton label="Save changes to this setup" :disabled="!activeSetup || !setupModified" @click="update"><Save /></IconButton>
      <IconButton label="Save as new setup" @click="startSaveAs"><BookmarkPlus /></IconButton>
      <IconButton label="Delete this setup" :disabled="!activeSetup" @click="confirmingDelete = true"><Trash2 /></IconButton>
    </div>

    <Dialog v-model="naming" title="Save setup" width="400px">
      <div class="form">
        <label class="lbl" for="setup-name">Name</label>
        <TextInput id="setup-name" v-model="name" autofocus placeholder="e.g. Functional parts" :maxlength="48" :invalid="nameTaken" @enter="confirmSaveAs" />
        <p class="note" :class="{ err: nameTaken }">
          {{ nameTaken ? 'A setup with this name already exists.' : 'Saves quality, strength, supports, adhesion and every changed setting.' }}
        </p>
      </div>
      <template #footer>
        <Button @click="naming = false">Cancel</Button>
        <Button variant="primary" :disabled="!name.trim() || nameTaken" @click="confirmSaveAs">Save</Button>
      </template>
    </Dialog>

    <Dialog v-model="confirmingDelete" title="Delete setup" width="400px">
      <p class="body-text">Delete <strong>{{ activeSetup?.name }}</strong>? The settings on the panel stay as they are.</p>
      <template #footer>
        <Button @click="confirmingDelete = false">Cancel</Button>
        <Button variant="danger" @click="confirmDelete">Delete</Button>
      </template>
    </Dialog>
  </PanelSection>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sel {
  flex: 1;
  min-width: 0;
  margin-right: 4px;
}
.modified {
  color: var(--accent-text);
  font-weight: 500;
  cursor: help;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lbl {
  font-size: var(--fs-13);
  color: var(--text-2);
}
.note {
  font-size: var(--fs-12);
  color: var(--text-3);
}
.note.err {
  color: var(--danger);
}
.body-text {
  color: var(--text-2);
}
.body-text strong {
  color: var(--text);
  font-weight: 600;
}
</style>
