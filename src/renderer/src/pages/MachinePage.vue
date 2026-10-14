<script setup lang="ts">
// Printer page: the one machine FF Print serves, its firmware limits, start/end G-code, the learned
// print-time factor, appearance, SD file names and engine info. Every change saves itself through
// the settings actions (debounced), with a quiet "Saved" in the header.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, CircleAlert, RotateCcw } from 'lucide-vue-next'
import { DEFAULT_END_GCODE, DEFAULT_START_GCODE, MACHINE, type Nozzle } from '@shared/machine'
import { MATERIALS, QUALITIES } from '@shared/settings'
import type { MachineSettings, Prefs } from '@shared/types'
import { app, currentFilament, toast } from '@/stores/app'
import { FILE_NAME_TOKENS, flushMachine, flushPrefs, saveStatus, setFileNamePattern, setTheme, updateMachine } from '@/stores/settingsActions'
import { api, errorText } from '@/lib/api'
import Button from '@/ui/Button.vue'
import Segmented from '@/ui/Segmented.vue'
import Toggle from '@/ui/Toggle.vue'
import TextInput from '@/panels/print/TextInput.vue'
import LimitsTable from './machine/LimitsTable.vue'
import MachineSection from './machine/MachineSection.vue'
import AutomationSection from './machine/AutomationSection.vue'
import pkg from '../../../../package.json'

const m = computed(() => app.machine)
const state = computed(() => saveStatus.state)

type MachinePatch = Parameters<typeof updateMachine>[0]
function change(patch: MachinePatch): void {
  try {
    updateMachine(patch).catch((e) => toast('error', `Could not save: ${errorText(e)}`))
  } catch (e) {
    toast('error', errorText(e))
  }
}
const field = <K extends 'firmwareModified' | 'startGcode' | 'endGcode'>(key: K) =>
  computed<MachineSettings[K]>({ get: () => app.machine![key], set: (v) => change({ [key]: v } as MachinePatch) })

// ---- printer
const nozzleOptions = MACHINE.nozzles.map((n) => ({ id: n, label: `${n} mm` }))
const nozzle = computed<Nozzle>({ get: () => m.value?.nozzle ?? '0.4', set: (v) => change({ nozzle: v }) })

// ---- firmware
const firmwareModified = field('firmwareModified')
const resetLimits = (): void => change({ limits: { ...MACHINE.limits } })
const limitsChanged = computed(() => !!m.value && (Object.keys(MACHINE.limits) as (keyof typeof MACHINE.limits)[]).some((k) => m.value!.limits[k] !== MACHINE.limits[k]))

// ---- g-code
const startGcode = field('startGcode')
const endGcode = field('endGcode')
const startChanged = computed(() => m.value?.startGcode !== DEFAULT_START_GCODE)
const endChanged = computed(() => m.value?.endGcode !== DEFAULT_END_GCODE)

// ---- print time
const factor = computed(() => m.value?.timeFactor ?? 1)
const factorText = computed(() => {
  const pct = Math.round((factor.value - 1) * 100)
  if (pct === 0) return 'Estimates are used as the slicer gives them.'
  return pct > 0
    ? `Your prints take about ${pct}% longer than the slicer estimates, so estimates are stretched to match.`
    : `Your prints finish about ${-pct}% sooner than the slicer estimates, so estimates are shortened to match.`
})

// ---- appearance
const themeOptions = [
  { id: 'system' as const, label: 'System' },
  { id: 'light' as const, label: 'Light' },
  { id: 'dark' as const, label: 'Dark' }
]
const theme = computed<Prefs['theme']>({
  get: () => app.prefs?.theme ?? 'system',
  set: (v) => {
    setTheme(v).catch((e) => toast('error', `Could not save: ${errorText(e)}`))
  }
})

// ---- file names
const PLACEHOLDERS: { token: (typeof FILE_NAME_TOKENS)[number]; help: string }[] = [
  { token: '{name}', help: 'first model on the bed' },
  { token: '{quality}', help: 'draft, standard, optimal or fine' },
  { token: '{material}', help: 'PLA, PETG, …' },
  { token: '{date}', help: 'today, as 2026-10-14' }
]
const patternText = ref(app.prefs?.fileNamePattern ?? '{name}')
const unknownTokens = computed(() => [...patternText.value.matchAll(/\{(\w+)\}/g)].map((x) => x[0]).filter((t) => !(FILE_NAME_TOKENS as readonly string[]).includes(t)))
const pattern = computed({
  get: () => patternText.value,
  set: (v: string) => {
    patternText.value = v
    if (!unknownTokens.value.length) setFileNamePattern(v).catch((e) => toast('error', `Could not save: ${errorText(e)}`))
  }
})
function insert(token: string): void {
  pattern.value = pattern.value.trim() ? `${pattern.value.trim()}_${token}` : token
}
const preview = computed(() => {
  const f = currentFilament()
  const vars: Record<string, string> = {
    name: 'benchy',
    quality: QUALITIES.find((q) => q.id === app.settings.quality)?.id ?? 'standard',
    material: MATERIALS.find((x) => x.id === f?.material)?.label ?? 'PLA',
    date: new Date().toISOString().slice(0, 10)
  }
  const filled = (pattern.value.trim() || '{name}').replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
  const clean = filled.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, 48)
  return `${clean || 'print'}.gcode`
})

// ---- about
const engine = ref<{ ok: boolean; version: string; path: string; error?: string } | null>(null)
const versions = computed(() => {
  const ua = navigator.userAgent
  return { electron: ua.match(/Electron\/([\d.]+)/)?.[1] ?? '—', chrome: ua.match(/Chrome\/([\d.]+)/)?.[1] ?? '—' }
})
onMounted(async () => {
  try {
    engine.value = await api.engineStatus()
  } catch (e) {
    engine.value = { ok: false, version: '', path: '', error: errorText(e) }
  }
})
onBeforeUnmount(() => {
  // Write pending changes now instead of waiting for the debounce.
  flushMachine()
  flushPrefs()
})
</script>

<template>
  <div class="page">
    <div v-if="m" class="inner">
      <header class="head">
        <div>
          <h1>Printer</h1>
          <p class="sub">FF Print is set up for one machine. Changes here save automatically.</p>
        </div>
        <span class="status" :class="state" aria-live="polite">
          <template v-if="state === 'saving'">Saving…</template>
          <template v-else-if="state === 'saved'"><Check />Saved</template>
          <template v-else-if="state === 'error'"><CircleAlert />Not saved</template>
        </span>
      </header>

      <MachineSection title="Printer" description="The machine every job is sliced for.">
        <dl class="facts">
          <div><dt>Model</dt><dd>{{ MACHINE.name }}</dd></div>
          <div><dt>Build volume</dt><dd class="num">{{ MACHINE.bed.x }} × {{ MACHINE.bed.y }} × {{ MACHINE.maxZ }} mm</dd></div>
          <div><dt>Hot end / bed</dt><dd class="num">up to {{ MACHINE.maxNozzleTemp }} °C / {{ MACHINE.maxBedTemp }} °C</dd></div>
          <div><dt>Firmware</dt><dd>Creality stock, Marlin 2.0.8 based</dd></div>
        </dl>
        <div class="row">
          <div class="row-label">
            <span>Nozzle</span>
            <span class="hint">Quality presets follow the nozzle. Change it here when you swap nozzles.</span>
          </div>
          <Segmented v-model="nozzle" :options="nozzleOptions" class="nozzle" />
        </div>
      </MachineSection>

      <MachineSection title="Firmware limits" description="Acceleration and speed caps from the stock firmware. FF Print never asks the printer for more than these, whatever a setting says.">
        <div class="row">
          <div class="row-label">
            <span>I changed my printer's firmware</span>
            <span class="hint">Only turn this on if you flashed firmware with different limits.</span>
          </div>
          <Toggle v-model="firmwareModified" />
        </div>
        <LimitsTable :machine="m" />
        <div v-if="m.firmwareModified && limitsChanged" class="actions">
          <Button size="sm" variant="ghost" @click="resetLimits"><RotateCcw />Reset to stock values</Button>
        </div>
      </MachineSection>

      <MachineSection title="Start and end G-code" description="Runs before and after every print.">
        <template #intro>
          <p class="note">
            FF Print's start code sets absolute extrusion (M82) before the purge line, so a print cancelled in relative mode
            cannot turn the purge into a blob. It has no G29 or M8015: the firmware reloads the saved bed mesh after G28, and auto
            Z-offset stays a screen routine.
          </p>
        </template>
        <div class="code">
          <div class="code-head">
            <span>Start G-code</span>
            <Button v-if="startChanged" size="sm" variant="ghost" @click="startGcode = DEFAULT_START_GCODE"><RotateCcw />Reset to default</Button>
          </div>
          <textarea v-model="startGcode" spellcheck="false" wrap="off" rows="14" aria-label="Start G-code" />
        </div>
        <div class="code">
          <div class="code-head">
            <span>End G-code</span>
            <Button v-if="endChanged" size="sm" variant="ghost" @click="endGcode = DEFAULT_END_GCODE"><RotateCcw />Reset to default</Button>
          </div>
          <textarea v-model="endGcode" spellcheck="false" wrap="off" rows="12" aria-label="End G-code" />
        </div>
      </MachineSection>

      <MachineSection title="Print time" description="Learned from the real print times you enter in History.">
        <div class="row">
          <div class="row-label">
            <span>Time correction <strong class="num factor">× {{ factor.toFixed(2) }}</strong></span>
            <span class="hint">{{ factorText }}</span>
          </div>
          <Button size="sm" :disabled="factor === 1" @click="change({ timeFactor: 1 })"><RotateCcw />Reset to 1</Button>
        </div>
      </MachineSection>

      <MachineSection title="Appearance">
        <div class="row">
          <div class="row-label">
            <span>Theme</span>
            <span class="hint">System follows Windows.</span>
          </div>
          <Segmented v-model="theme" :options="themeOptions" class="theme" />
        </div>
      </MachineSection>

      <MachineSection title="File names" description="How G-code files are named on the SD card. The printer's screen shows these names.">
        <div class="pattern">
          <TextInput v-model="pattern" mono :maxlength="80" aria-label="File name pattern" :invalid="unknownTokens.length > 0" />
          <p class="hint">
            Result: <span class="mono">{{ preview }}</span>
            <span v-if="unknownTokens.length" class="bad"> · unknown {{ unknownTokens.join(' ') }}</span>
          </p>
        </div>
        <div class="tokens">
          <button v-for="p in PLACEHOLDERS" :key="p.token" type="button" class="token" :title="`Add ${p.token}`" @click="insert(p.token)">
            <span class="mono">{{ p.token }}</span><span class="hint">{{ p.help }}</span>
          </button>
        </div>
      </MachineSection>

      <AutomationSection />

      <MachineSection title="About">
        <dl class="facts">
          <div><dt>FF Print</dt><dd class="num">{{ pkg.version }}</dd></div>
          <div>
            <dt>Slicing engine</dt>
            <dd v-if="!engine">Checking…</dd>
            <dd v-else-if="engine.ok"><span class="ok"><Check />OrcaSlicer {{ engine.version }}</span></dd>
            <dd v-else><span class="bad">{{ engine.error || 'Not found' }}</span></dd>
          </div>
          <div v-if="engine?.path"><dt>Engine location</dt><dd class="mono path" :title="engine.path">{{ engine.path }}</dd></div>
          <div><dt>Electron</dt><dd class="num">{{ versions.electron }} (Chromium {{ versions.chrome }})</dd></div>
        </dl>
      </MachineSection>
    </div>
  </div>
</template>

<style scoped>
.page {
  flex: 1;
  min-width: 0;
  overflow: auto;
}
.inner {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 24px 48px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 20px;
}
h1 {
  font-size: var(--fs-20);
  font-weight: 600;
}
.sub {
  margin-top: 4px;
  color: var(--text-2);
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 20px;
  font-size: var(--fs-12);
  color: var(--text-3);
}
.status svg {
  width: 14px;
  height: 14px;
}
.status.saved {
  color: var(--success);
}
.status.error {
  color: var(--danger);
}
.facts {
  display: flex;
  flex-direction: column;
  margin: 0;
}
.facts > div {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 12px;
  padding: 6px 0;
}
dt {
  color: var(--text-2);
}
dd {
  margin: 0;
  min-width: 0;
}
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.row-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.hint {
  font-size: var(--fs-12);
  color: var(--text-3);
}
.nozzle {
  width: 280px;
  flex: none;
}
.theme {
  width: 240px;
  flex: none;
}
.factor {
  margin-left: 6px;
  font-weight: 600;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.note {
  margin-top: 8px;
  font-size: var(--fs-12);
  color: var(--text-3);
}
.code {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  font-size: var(--fs-13);
  color: var(--text-2);
}
textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  font-family: var(--mono);
  font-size: var(--fs-12);
  line-height: 1.5;
  resize: vertical;
  outline: 0;
  white-space: pre;
  overflow: auto;
}
textarea:hover {
  border-color: var(--text-3);
}
textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.pattern {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mono {
  font-family: var(--mono);
  font-size: var(--fs-12);
}
.tokens {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 12px;
}
.token {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.token:hover {
  background: var(--surface-3);
}
.token .mono {
  color: var(--accent-text);
}
.ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--success);
}
.ok svg {
  width: 14px;
  height: 14px;
}
.bad {
  color: var(--danger);
}
</style>
