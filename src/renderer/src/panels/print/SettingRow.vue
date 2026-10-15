<script setup lang="ts">
// One catalogue setting: label (help on hover), Orca's effective default underneath, the control, and a
// reset when it is overridden. Values are stored in app.settings.overrides in Orca's string encoding;
// setting a value equal to the default removes the override instead of storing a no-op.
import { computed } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import { decodeBool, decodeNumber, effectiveDefault, effectiveLimits, effectiveMax, formatValue, type SettingDef } from '@shared/settings'
import { app, currentFilament, toast } from '@/stores/app'
import { resetOverride, setOverride } from '@/stores/settingsActions'
import NumberField from '@/ui/NumberField.vue'
import SelectField from '@/ui/SelectField.vue'
import Toggle from '@/ui/Toggle.vue'

const props = defineProps<{ def: SettingDef; showGroup?: boolean }>()

const limits = computed(() => (app.machine ? effectiveLimits(app.machine) : undefined))
const max = computed(() => (limits.value ? effectiveMax(props.def, limits.value) : props.def.max))
const defaultRaw = computed(() => {
  const f = currentFilament()
  if (!f || !app.machine) return undefined
  return effectiveDefault(props.def, app.settings, f, app.machine)
})
const override = computed(() => app.settings.overrides[props.def.key])
const raw = computed(() => override.value ?? defaultRaw.value)
const changed = computed(() => override.value !== undefined)

function set(v: number | boolean | string): void {
  try {
    setOverride(props.def.key, v)
  } catch (e) {
    toast('error', e instanceof Error ? e.message : String(e))
  }
}
const reset = (): void => resetOverride(props.def.key)

const num = computed({ get: () => decodeNumber(raw.value), set: (v: number) => set(v) })
const bool = computed({ get: () => decodeBool(raw.value), set: (v: boolean) => set(v) })
const choice = computed({ get: () => (raw.value && props.def.refuse?.[raw.value]?.use) || (raw.value ?? ''), set: (v: string) => set(v) })
const options = computed(() => {
  const opts = props.def.options ?? []
  return choice.value && !opts.some((o) => o.value === choice.value) ? [...opts, { value: choice.value, label: choice.value }] : opts
})

const firmwareNote = computed(() => (props.def.limit && limits.value ? `Firmware maximum: ${props.def.limit(limits.value)} ${props.def.unit ?? ''}`.trim() : ''))
const tooltip = computed(() => [props.def.help, firmwareNote.value].filter(Boolean).join('\n'))
const defaultText = computed(() => {
  const d = formatValue(props.def, defaultRaw.value)
  return firmwareNote.value ? `Default ${d} · max ${props.def.limit && limits.value ? props.def.limit(limits.value) : ''}` : `Default ${d}`
})
</script>

<template>
  <div class="row" :class="{ changed }">
    <div class="label" :title="tooltip || undefined">
      <div class="top">
        <span class="name">{{ def.label }}</span>
        <span v-if="showGroup" class="group">{{ def.group }}</span>
      </div>
      <span class="default num">{{ defaultText }}</span>
    </div>
    <button v-if="changed" type="button" class="reset" :title="`Reset to ${formatValue(def, defaultRaw)}`" @click="reset"><RotateCcw /></button>
    <span v-else class="reset-space" />
    <div class="control">
      <NumberField v-if="def.kind === 'number' || def.kind === 'percent'" v-model="num" :unit="def.unit" :min="def.min" :max="max" :step="def.step ?? 1" :aria-label="def.label" />
      <div v-else-if="def.kind === 'bool'" class="toggle"><Toggle v-model="bool" :aria-label="def.label" /></div>
      <SelectField v-else v-model="choice" :options="options" :aria-label="def.label" />
    </div>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px 176px;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.row:last-child {
  border-bottom: 0;
}
.label {
  display: flex;
  flex-direction: column;
  min-width: 0;
  cursor: help;
}
.top {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.name {
  font-size: var(--fs-13);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.changed .name {
  font-weight: 600;
}
.group {
  font-size: var(--fs-11);
  color: var(--text-3);
  white-space: nowrap;
}
.default {
  font-size: var(--fs-12);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reset {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--accent-text);
  cursor: pointer;
}
.reset:hover {
  background: var(--accent-soft);
}
.reset svg {
  width: 14px;
  height: 14px;
}
.toggle {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  height: var(--control-h);
}
</style>
