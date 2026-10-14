<script setup lang="ts">
// Right column: the few decisions that matter for a print on the V3 SE, top to bottom in the order
// people make them. Everything else sits behind "More settings". The slice bar is pinned below.
import { computed, ref } from 'vue'
import { RotateCcw, SlidersHorizontal, TriangleAlert } from 'lucide-vue-next'
import { ADHESION_TYPES, INFILL_PATTERNS, NOZZLE_MAX_LAYER, QUALITIES, STRENGTHS, SUPPORT_MODES, qualityFits, settingsSummary, strengthEdited } from '@shared/settings'
import type { AdhesionType, QualityId, StrengthId, SupportMode } from '@shared/types'
import { app, toast } from '@/stores/app'
import { resetStrengthNumbers, setAdhesion, setQuality, setStrength, setStrengthNumbers, setSupports, type StrengthNumbers } from '@/stores/settingsActions'
import Field from '@/ui/Field.vue'
import NumberField from '@/ui/NumberField.vue'
import Segmented from '@/ui/Segmented.vue'
import SelectField from '@/ui/SelectField.vue'
import Toggle from '@/ui/Toggle.vue'
import FilamentPicker from './print/FilamentPicker.vue'
import MoreSettings from './print/MoreSettings.vue'
import PanelSection from './print/PanelSection.vue'
import SetupPicker from './print/SetupPicker.vue'

const s = computed(() => app.settings)
const nozzle = computed(() => app.machine?.nozzle ?? '0.4')

const quality = computed(() => QUALITIES.find((q) => q.id === s.value.quality) ?? QUALITIES[1])
/** Runs an action; a rejected value shows as a toast instead of throwing inside a v-model setter. */
function act(fn: () => void): void {
  try {
    fn()
  } catch (e) {
    toast('error', e instanceof Error ? e.message : String(e))
  }
}

const qualityModel = computed<QualityId>({ get: () => s.value.quality, set: (v) => act(() => setQuality(v)) })
const fits = computed(() => qualityFits(s.value.quality, nozzle.value))
const fittingQualities = computed(() => QUALITIES.filter((q) => qualityFits(q.id, nozzle.value)).map((q) => q.label))

const strength = computed(() => STRENGTHS.find((x) => x.id === s.value.strength) ?? STRENGTHS[1])
// Picking a strength (even the selected one) applies its numbers, so it doubles as "reset".
const strengthModel = computed<StrengthId>({ get: () => s.value.strength, set: (v) => act(() => setStrength(v)) })
const strengthField = <K extends keyof StrengthNumbers>(key: K, read: () => NonNullable<StrengthNumbers[K]>) =>
  computed<NonNullable<StrengthNumbers[K]>>({ get: read, set: (v) => act(() => setStrengthNumbers({ [key]: v })) })
const walls = strengthField('walls', () => s.value.walls)
const topLayers = strengthField('topLayers', () => s.value.topLayers)
const bottomLayers = strengthField('bottomLayers', () => s.value.bottomLayers)
const infill = strengthField('infill', () => s.value.infill)
const pattern = strengthField('pattern', () => s.value.infillPattern)
const custom = computed(() => strengthEdited(s.value))
const resetStrength = (): void => resetStrengthNumbers()

const supportModel = computed<SupportMode>({ get: () => s.value.supports, set: (v) => act(() => setSupports(v)) })
const supportAngle = computed({ get: () => s.value.supportAngle, set: (v: number) => act(() => setSupports(s.value.supports, { angle: v })) })
const buildPlateOnly = computed({ get: () => s.value.supportBuildPlateOnly, set: (v: boolean) => act(() => setSupports(s.value.supports, { buildPlateOnly: v })) })
const supportHint = computed(() => SUPPORT_MODES.find((x) => x.id === s.value.supports)?.hint ?? '')
const adhesionModel = computed<AdhesionType>({ get: () => s.value.adhesion, set: (v) => act(() => setAdhesion(v)) })
const brimWidth = computed({ get: () => s.value.brimWidth, set: (v: number) => act(() => setAdhesion(s.value.adhesion, v)) })
const adhesionHint = computed(() => ADHESION_TYPES.find((x) => x.id === s.value.adhesion)?.hint ?? '')

const moreOpen = ref(false)
const changedCount = computed(() => Object.keys(s.value.overrides).length)
const summary = computed(() => settingsSummary(s.value))
</script>

<template>
  <div class="pp">
    <PanelSection title="Filament" help="The spool you print with. Its temperatures, flow and fan settings go into the G-code.">
      <FilamentPicker />
    </PanelSection>

    <SetupPicker />

    <hr />

    <PanelSection title="Quality" help="Layer height. Thinner layers look smoother and take longer.">
      <Segmented v-model="qualityModel" :options="QUALITIES" />
      <p class="hint"><span class="strong num">{{ quality.layerHeight.toFixed(2) }} mm layers</span> · {{ quality.hint }}</p>
      <p v-if="!fits" class="warn">
        <TriangleAlert />
        <span>Too thick for the {{ nozzle }} mm nozzle (max {{ NOZZLE_MAX_LAYER[nozzle].toFixed(2) }} mm). Use {{ fittingQualities.join(' or ') }}.</span>
      </p>
    </PanelSection>

    <PanelSection title="Strength" help="Walls, solid layers and infill. Pick a preset, then adjust the numbers if needed.">
      <template #meta>
        <template v-if="custom">
          <span title="The numbers differ from the preset.">Custom</span>
          <button type="button" class="link" :title="`Back to ${strength.label}`" @click="resetStrength"><RotateCcw /><span>Reset</span></button>
        </template>
      </template>
      <Segmented v-model="strengthModel" :options="STRENGTHS" />
      <p class="hint">{{ strength.hint }}</p>
      <div class="grid">
        <label class="mini" title="Outlines around every layer. More walls are the cheapest way to add strength.">
          <span>Walls</span>
          <NumberField v-model="walls" :min="1" :max="10" aria-label="Walls" />
        </label>
        <label class="mini" title="Solid layers closing the top. More hides infill on flat tops.">
          <span>Top layers</span>
          <NumberField v-model="topLayers" :min="0" :max="20" aria-label="Top layers" />
        </label>
        <label class="mini" title="Solid layers on the bottom.">
          <span>Bottom layers</span>
          <NumberField v-model="bottomLayers" :min="0" :max="20" aria-label="Bottom layers" />
        </label>
        <label class="mini" title="How full the inside is.">
          <span>Infill</span>
          <NumberField v-model="infill" unit="%" :min="0" :max="100" :step="5" aria-label="Infill density" />
        </label>
        <label class="mini span2" title="Shape of the infill. Gyroid and cubic are strong in every direction; grid and crosshatch are quick.">
          <span>Pattern</span>
          <SelectField v-model="pattern" :options="INFILL_PATTERNS" aria-label="Infill pattern" />
        </label>
      </div>
    </PanelSection>

    <PanelSection title="Supports" help="Temporary structures under overhangs, removed after printing.">
      <Segmented v-model="supportModel" :options="SUPPORT_MODES" />
      <p class="hint">{{ supportHint }}</p>
      <template v-if="s.supports !== 'off'">
        <Field label="Overhang angle" help="Overhangs steeper than this from vertical get support. Lower adds more support.">
          <NumberField v-model="supportAngle" unit="°" :min="0" :max="90" :step="5" aria-label="Overhang angle" />
        </Field>
        <Field label="Only from the bed" help="Supports start on the bed only, never on top of the model. Easier to remove, but some overhangs go unsupported.">
          <div class="toggle"><Toggle v-model="buildPlateOnly" /></div>
        </Field>
      </template>
    </PanelSection>

    <PanelSection title="Adhesion" help="What goes down around the first layer.">
      <Segmented v-model="adhesionModel" :options="ADHESION_TYPES" />
      <p class="hint">{{ adhesionHint }}</p>
      <Field v-if="s.adhesion === 'brim'" label="Brim width" help="How far the brim reaches out from the part.">
        <NumberField v-model="brimWidth" unit="mm" :min="1" :max="20" :step="1" aria-label="Brim width" />
      </Field>
    </PanelSection>

    <hr />

    <button type="button" class="more" @click="moreOpen = true">
      <SlidersHorizontal />
      <span class="label">More settings</span>
      <span v-if="changedCount" class="changed num">{{ changedCount }} changed</span>
    </button>
    <p class="summary num" :title="summary">{{ summary }}</p>

    <MoreSettings v-model="moreOpen" />
  </div>
</template>

<style scoped>
.pp {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 20px;
  /* The scrollbar's 10px is always reserved (right padding 6 + 10 = 16), so the panel doesn't
     shift sideways when the result card takes space and the list starts to scroll. */
  padding: 16px 6px 16px 16px;
  scrollbar-gutter: stable;
}
hr {
  width: 100%;
  margin: 0;
  border: 0;
  border-top: 1px solid var(--border);
}
.hint {
  font-size: var(--fs-12);
  color: var(--text-3);
}
.hint .strong {
  color: var(--text-2);
  font-weight: 500;
}
.warn {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--r);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: var(--fs-12);
}
.warn svg {
  width: 14px;
  height: 14px;
  flex: none;
  margin-top: 2px;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  margin-left: 4px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--accent-text);
  font-size: var(--fs-12);
  font-weight: 500;
  cursor: pointer;
}
.link:hover {
  background: var(--accent-soft);
}
.link svg {
  width: 12px;
  height: 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.mini {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.mini > span {
  font-size: var(--fs-12);
  color: var(--text-2);
  cursor: help;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.span2 {
  grid-column: span 2;
}
.toggle {
  display: flex;
  justify-content: flex-end;
}
.more {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: var(--control-h);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--text);
  font-size: var(--fs-13);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.more:hover {
  background: var(--surface-3);
}
.more svg {
  width: 16px;
  height: 16px;
  color: var(--text-2);
}
.more .label {
  flex: 1;
  text-align: left;
}
.more .changed {
  color: var(--accent-text);
  font-size: var(--fs-12);
}
.summary {
  margin-top: -12px;
  font-size: var(--fs-12);
  color: var(--text-3);
}
</style>
