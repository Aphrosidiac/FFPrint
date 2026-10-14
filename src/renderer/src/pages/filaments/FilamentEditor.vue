<script setup lang="ts">
// Add / edit one library filament. Works on a copy; nothing is saved until Save.
import { computed, ref, watch } from 'vue'
import { MATERIALS, filamentDefaults, newFilament, validateFilament } from '@shared/settings'
import type { Filament, Material } from '@shared/types'
import { app } from '@/stores/app'
import Button from '@/ui/Button.vue'
import Dialog from '@/ui/Dialog.vue'
import NumberField from '@/ui/NumberField.vue'
import SelectField from '@/ui/SelectField.vue'
import TextInput from '@/panels/print/TextInput.vue'

const props = defineProps<{ filament: Filament | null; isNew: boolean }>()
const emit = defineEmits<{ save: [f: Filament]; close: [] }>()

const open = computed({ get: () => !!props.filament, set: (v) => !v && emit('close') })
const f = ref<Filament>(blank())
watch(
  () => props.filament,
  (v) => {
    if (v) f.value = JSON.parse(JSON.stringify(v))
  },
  { immediate: true }
)

function blank(): Filament {
  return { id: '', name: '', brand: '', material: 'PLA', color: '#ffffff', ...filamentDefaults('PLA'), pricePerKg: 75, notes: '' }
}

const materialOptions = MATERIALS.map((m) => ({ value: m.id, label: m.label }))
const material = computed({
  get: () => f.value.material,
  set: (m: Material) => {
    // A new entry follows the material: take a matching spool's numbers, else Orca's generic profile.
    if (props.isNew) {
      const src = newFilament(app.filaments, { material: m })
      f.value = {
        ...f.value,
        nozzleTemp: src.nozzleTemp,
        nozzleTempFirstLayer: src.nozzleTempFirstLayer,
        bedTemp: src.bedTemp,
        bedTempFirstLayer: src.bedTempFirstLayer,
        flowRatio: src.flowRatio,
        maxVolumetricSpeed: src.maxVolumetricSpeed,
        fanMin: src.fanMin,
        fanMax: src.fanMax,
        density: src.density,
        diameter: src.diameter,
        pricePerKg: src.pricePerKg
      }
      const prevLabel = MATERIALS.find((x) => x.id === f.value.material)?.label ?? ''
      if (!f.value.name.trim() || f.value.name === `New ${prevLabel}`) f.value.name = `New ${MATERIALS.find((x) => x.id === m)?.label ?? m}`
    }
    f.value.material = m
  }
})

const hex = ref('')
watch(
  () => f.value.color,
  (c) => {
    if (c.toLowerCase() !== hex.value.toLowerCase()) hex.value = c
  },
  { immediate: true }
)
const hexValid = computed(() => /^#[0-9a-f]{6}$/i.test(hex.value.trim()))
watch(hex, (v) => {
  const t = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(t)) f.value.color = t
})

const errors = computed(() => {
  const e = validateFilament(f.value)
  if (!hexValid.value) e.color = 'Use a hex colour like #2f6fdb.'
  return e
})
const valid = computed(() => Object.keys(errors.value).length === 0)
const SHOWN_INLINE = ['name', 'color', 'nozzle', 'bed', 'fan']
const otherErrors = computed(() => Object.entries(errors.value).filter(([k]) => !SHOWN_INLINE.includes(k)).map(([, v]) => v))

function save(): void {
  if (!valid.value) return
  emit('save', { ...f.value, name: f.value.name.trim(), brand: f.value.brand.trim(), notes: f.value.notes.trim() })
}
</script>

<template>
  <Dialog v-model="open" :title="isNew ? 'Add filament' : 'Edit filament'" width="600px">
    <form class="ed" @submit.prevent="save">
      <section>
        <h3 class="section-title">Basics</h3>
        <div class="grid">
          <label class="fld span2">
            <span class="lbl">Name</span>
            <TextInput v-model="f.name" placeholder="e.g. Sunlu PLA Matte Black" :maxlength="60" :invalid="!!errors.name" :autofocus="isNew" />
            <span v-if="errors.name" class="err">{{ errors.name }}</span>
          </label>
          <label class="fld">
            <span class="lbl">Brand</span>
            <TextInput v-model="f.brand" placeholder="Generic" :maxlength="40" />
          </label>
          <label class="fld">
            <span class="lbl" title="Decides which Orca base profile the filament starts from.">Material</span>
            <SelectField v-model="material" :options="materialOptions" aria-label="Material" />
          </label>
          <div class="fld">
            <span class="lbl">Colour</span>
            <div class="colour">
              <label class="swatch" :style="{ background: f.color }" title="Pick a colour">
                <input v-model="f.color" type="color" aria-label="Colour" />
              </label>
              <TextInput v-model="hex" mono :maxlength="7" :invalid="!!errors.color" aria-label="Colour hex" />
            </div>
            <span v-if="errors.color" class="err">{{ errors.color }}</span>
          </div>
          <label class="fld">
            <span class="lbl">Notes</span>
            <TextInput v-model="f.notes" placeholder="Optional" :maxlength="120" />
          </label>
        </div>
      </section>

      <section>
        <h3 class="section-title">Temperatures</h3>
        <div class="grid">
          <label class="fld">
            <span class="lbl" title="Nozzle temperature for every layer after the first.">Nozzle</span>
            <NumberField v-model="f.nozzleTemp" unit="°C" :min="0" :max="400" :step="5" aria-label="Nozzle temperature" />
          </label>
          <label class="fld">
            <span class="lbl" title="Usually 5 °C hotter than the rest for better adhesion.">Nozzle, first layer</span>
            <NumberField v-model="f.nozzleTempFirstLayer" unit="°C" :min="0" :max="400" :step="5" aria-label="Nozzle temperature, first layer" />
          </label>
          <span v-if="errors.nozzle" class="err span2">{{ errors.nozzle }}</span>
          <label class="fld">
            <span class="lbl" title="Bed temperature for every layer after the first.">Bed</span>
            <NumberField v-model="f.bedTemp" unit="°C" :min="0" :max="200" :step="5" aria-label="Bed temperature" />
          </label>
          <label class="fld">
            <span class="lbl" title="Bed temperature while printing the first layer.">Bed, first layer</span>
            <NumberField v-model="f.bedTempFirstLayer" unit="°C" :min="0" :max="200" :step="5" aria-label="Bed temperature, first layer" />
          </label>
          <span v-if="errors.bed" class="err span2">{{ errors.bed }}</span>
        </div>
      </section>

      <section>
        <h3 class="section-title">Flow and speed</h3>
        <div class="grid">
          <label class="fld">
            <span class="lbl" title="Scales extrusion. Lower it if top surfaces look overfilled; raise it for gaps.">Flow ratio</span>
            <NumberField v-model="f.flowRatio" :min="0.5" :max="1.5" :step="0.01" :digits="3" aria-label="Flow ratio" />
          </label>
          <label class="fld">
            <span class="lbl" title="How much this filament can melt per second. Print speed is capped to stay under it.">Max volumetric speed</span>
            <NumberField v-model="f.maxVolumetricSpeed" unit="mm³/s" :min="1" :max="40" :step="0.5" aria-label="Max volumetric speed" />
          </label>
        </div>
      </section>

      <section>
        <h3 class="section-title">Cooling</h3>
        <div class="grid">
          <label class="fld">
            <span class="lbl" title="Part fan on layers that take a long time.">Fan minimum</span>
            <NumberField v-model="f.fanMin" unit="%" :min="0" :max="100" :step="5" aria-label="Fan minimum" />
          </label>
          <label class="fld">
            <span class="lbl" title="Part fan on short, fast layers that need the most cooling.">Fan maximum</span>
            <NumberField v-model="f.fanMax" unit="%" :min="0" :max="100" :step="5" aria-label="Fan maximum" />
          </label>
          <span v-if="errors.fan" class="err span2">{{ errors.fan }}</span>
        </div>
      </section>

      <section>
        <h3 class="section-title">Cost</h3>
        <div class="grid three">
          <label class="fld">
            <span class="lbl" title="What a 1 kg spool costs you. Used for the cost of each print.">Price per kg</span>
            <NumberField v-model="f.pricePerKg" :unit="app.prefs?.currency ?? 'RM'" :min="0" :max="2000" :step="1" :digits="2" aria-label="Price per kg" />
          </label>
          <label class="fld">
            <span class="lbl" title="Converts length to weight.">Density</span>
            <NumberField v-model="f.density" unit="g/cm³" :min="0.5" :max="3" :step="0.01" aria-label="Density" />
          </label>
          <label class="fld">
            <span class="lbl" title="The V3 SE takes 1.75 mm filament.">Diameter</span>
            <NumberField v-model="f.diameter" unit="mm" :min="1" :max="3" :step="0.01" aria-label="Diameter" />
          </label>
        </div>
      </section>
      <p v-if="otherErrors.length" class="err">{{ otherErrors.join(' ') }}</p>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <Button @click="emit('close')">Cancel</Button>
      <Button variant="primary" :disabled="!valid" @click="save">{{ isNew ? 'Add filament' : 'Save' }}</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.ed {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
section + section {
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}
.grid.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.span2 {
  grid-column: span 2;
}
.lbl {
  font-size: var(--fs-12);
  color: var(--text-2);
}
.lbl[title] {
  cursor: help;
}
.err {
  margin-top: -4px;
  font-size: var(--fs-12);
  color: var(--danger);
}
.fld .err {
  margin-top: 0;
}
.colour {
  display: flex;
  gap: 8px;
}
.swatch {
  position: relative;
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: var(--r);
  box-shadow: inset 0 0 0 1px var(--border-strong);
  cursor: pointer;
  overflow: hidden;
}
.swatch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
