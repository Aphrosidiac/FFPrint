<script setup lang="ts">
// A row of X / Y (/ Z) number fields with small axis letters. Units live in the section title.
import NumberField from '@/ui/NumberField.vue'

type Axis = 'x' | 'y' | 'z'
const props = withDefaults(
  defineProps<{ values: Partial<Record<Axis, number>>; axes?: Axis[]; step?: number; digits?: number; min?: number; max?: number; label: string }>(),
  { axes: () => ['x', 'y', 'z'], step: 1, digits: 2 }
)
const emit = defineEmits<{ change: [axis: Axis, value: number] }>()

function update(axis: Axis, v: number): void {
  if (v !== props.values[axis]) emit('change', axis, v)
}
</script>

<template>
  <div class="axes" :class="`n${axes.length}`">
    <label v-for="a in axes" :key="a" class="axis">
      <span class="letter">{{ a.toUpperCase() }}</span>
      <NumberField
        :model-value="values[a] ?? 0"
        :step="step"
        :digits="digits"
        :min="min"
        :max="max"
        :aria-label="`${label} ${a.toUpperCase()}`"
        @update:model-value="update(a, $event)"
      />
    </label>
  </div>
</template>

<style scoped>
.axes {
  display: grid;
  gap: 8px;
}
.n2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.n3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.axis {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.letter {
  width: 8px;
  flex: none;
  color: var(--text-3);
  font-size: var(--fs-11);
  font-weight: 600;
  text-align: center;
}
.axis :deep(.nf) {
  flex: 1;
  min-width: 0;
  padding: 0 6px;
}
</style>
