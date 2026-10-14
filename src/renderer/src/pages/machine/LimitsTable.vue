<script setup lang="ts">
// Firmware motion limits: read-only stock values, editable only behind "I changed my printer's firmware".
import { computed } from 'vue'
import { MACHINE, type MachineLimits } from '@shared/machine'
import type { MachineSettings } from '@shared/types'
import NumberField from '@/ui/NumberField.vue'
import { toast } from '@/stores/app'
import { updateMachine } from '@/stores/settingsActions'

const props = defineProps<{ machine: MachineSettings }>()

const ROWS: { key: keyof MachineLimits; label: string; help: string; unit: string; step: number; max: number }[] = [
  { key: 'accelExtruding', label: 'Print acceleration', help: 'How quickly the head may speed up while printing. The firmware ignores anything higher (M204 P).', unit: 'mm/s²', step: 100, max: 20000 },
  { key: 'accelTravel', label: 'Travel acceleration', help: 'How quickly the head may speed up on moves that do not print (M204 T).', unit: 'mm/s²', step: 100, max: 20000 },
  { key: 'accelRetracting', label: 'Retract acceleration', help: 'How quickly the extruder may pull filament back (M204 R).', unit: 'mm/s²', step: 100, max: 20000 },
  { key: 'accelX', label: 'Max acceleration X', help: 'Hard cap on how quickly the X axis (left-right) speeds up (M201 X).', unit: 'mm/s²', step: 100, max: 20000 },
  { key: 'accelY', label: 'Max acceleration Y', help: 'Hard cap on how quickly the Y axis (the bed) speeds up (M201 Y).', unit: 'mm/s²', step: 100, max: 20000 },
  { key: 'accelZ', label: 'Max acceleration Z', help: 'Hard cap on how quickly the Z axis (up-down) speeds up (M201 Z).', unit: 'mm/s²', step: 50, max: 5000 },
  { key: 'accelE', label: 'Max acceleration E', help: 'Hard cap on how quickly the extruder speeds up (M201 E).', unit: 'mm/s²', step: 100, max: 20000 },
  { key: 'speedX', label: 'Max speed X', help: 'Top speed of the X axis (M203 X).', unit: 'mm/s', step: 10, max: 1000 },
  { key: 'speedY', label: 'Max speed Y', help: 'Top speed of the Y axis (M203 Y).', unit: 'mm/s', step: 10, max: 1000 },
  { key: 'speedZ', label: 'Max speed Z', help: 'Top speed of the Z axis. The V3 SE lifts slowly, so FF Print never asks for more (M203 Z).', unit: 'mm/s', step: 1, max: 100 },
  { key: 'speedE', label: 'Max speed E', help: 'Top speed of the extruder motor, which also caps retraction speed (M203 E).', unit: 'mm/s', step: 5, max: 200 },
  { key: 'junctionDeviation', label: 'Junction deviation', help: 'How sharply the head may turn a corner without slowing down. Higher is faster but shakes more (M205 J).', unit: 'mm', step: 0.01, max: 1 }
]

const editable = computed(() => props.machine.firmwareModified)
function set(key: keyof MachineLimits, v: number): void {
  try {
    updateMachine({ limits: { [key]: v } }).catch((e) => toast('error', e instanceof Error ? e.message : String(e)))
  } catch (e) {
    toast('error', e instanceof Error ? e.message : String(e))
  }
}
const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3))))
</script>

<template>
  <div class="lt" :class="{ editable }" role="table" aria-label="Firmware limits">
    <div class="tr th" role="row">
      <span role="columnheader">Limit</span>
      <span role="columnheader" class="r">Stock firmware</span>
      <span v-if="editable" role="columnheader" class="r">Your firmware</span>
    </div>
    <div v-for="r in ROWS" :key="r.key" class="tr" role="row" :class="{ diff: editable && machine.limits[r.key] !== MACHINE.limits[r.key] }">
      <span role="cell" class="label" :title="r.help">{{ r.label }}</span>
      <span role="cell" class="r num stock">{{ fmt(MACHINE.limits[r.key]) }} <span class="unit">{{ r.unit }}</span></span>
      <span v-if="editable" role="cell" class="r">
        <NumberField :model-value="machine.limits[r.key]" @update:model-value="set(r.key, $event)" :unit="r.unit" :min="0" :max="r.max" :step="r.step" :aria-label="r.label" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.lt {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  align-items: center;
  gap: 12px;
  min-height: 36px;
  padding: 0 12px;
  border-top: 1px solid var(--border);
}
.editable .tr {
  grid-template-columns: minmax(0, 1fr) 140px 168px;
  min-height: 44px;
}
.tr.th {
  min-height: 32px;
  border-top: 0;
  background: var(--surface-2);
  font-size: var(--fs-12);
  font-weight: 500;
  color: var(--text-2);
}
.label {
  cursor: help;
}
.r {
  text-align: right;
}
.stock {
  color: var(--text);
}
.editable .stock {
  color: var(--text-3);
}
.unit {
  color: var(--text-3);
  font-size: var(--fs-12);
}
.diff .label {
  font-weight: 600;
}
</style>
