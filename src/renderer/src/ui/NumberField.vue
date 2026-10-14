<script setup lang="ts">
// Numeric input with unit suffix. Up/Down arrows step (Shift = x10); value is clamped on commit.
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ unit?: string; min?: number; max?: number; step?: number; digits?: number; width?: string; disabled?: boolean; ariaLabel?: string }>(), {
  step: 1,
  width: '100%'
})
const model = defineModel<number>({ required: true })
const text = ref(format(model.value))

function format(v: number): string {
  if (!Number.isFinite(v)) return ''
  const d = props.digits ?? (props.step < 1 ? Math.min(3, String(props.step).split('.')[1]?.length ?? 2) : 0)
  return String(Number(v.toFixed(d)))
}

watch(model, (v) => {
  if (parseFloat(text.value) !== v) text.value = format(v)
})

function commit(): void {
  let v = parseFloat(text.value.replace(',', '.'))
  if (!Number.isFinite(v)) {
    text.value = format(model.value)
    return
  }
  if (props.min !== undefined) v = Math.max(props.min, v)
  if (props.max !== undefined) v = Math.min(props.max, v)
  model.value = v
  text.value = format(v)
}

function nudge(dir: number, e: KeyboardEvent): void {
  const mult = e.shiftKey ? 10 : 1
  text.value = format((parseFloat(text.value) || 0) + dir * props.step * mult)
  commit()
}

function blurOnEnter(e: KeyboardEvent): void {
  ;(e.target as HTMLInputElement).blur()
}
</script>

<template>
  <label class="nf" :class="{ disabled }" :style="{ width }">
    <input
      v-model="text"
      inputmode="decimal"
      :aria-label="ariaLabel"
      :disabled="disabled"
      class="num"
      @blur="commit"
      @keydown.enter="blurOnEnter"
      @keydown.up.prevent="nudge(1, $event)"
      @keydown.down.prevent="nudge(-1, $event)"
    />
    <span v-if="unit" class="unit">{{ unit }}</span>
  </label>
</template>

<style scoped>
.nf {
  display: flex;
  align-items: center;
  height: var(--control-h);
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  padding: 0 8px;
  gap: 4px;
  cursor: text;
  transition: border-color var(--dur) var(--ease);
}
.nf:hover {
  border-color: var(--text-3);
}
.nf:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.nf input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: var(--fs-13);
  text-align: right;
}
.unit {
  color: var(--text-3);
  font-size: var(--fs-12);
  white-space: nowrap;
}
.disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>
