<script setup lang="ts" generic="T extends string">
// A row of mutually exclusive options. `hint` shows as the option's tooltip.
defineProps<{ options: { id: T; label: string; hint?: string }[]; size?: 'sm' | 'md' }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="seg" :class="size ?? 'md'" role="radiogroup">
    <button
      v-for="o in options"
      :key="o.id"
      type="button"
      role="radio"
      :aria-checked="model === o.id"
      :class="{ on: model === o.id }"
      :title="o.hint"
      @click="model = o.id"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: flex;
  padding: 2px;
  gap: 2px;
  border-radius: var(--r);
  background: var(--surface-3);
}
.seg button {
  flex: 1 1 0;
  min-width: 0;
  height: calc(var(--control-h) - 4px);
  padding: 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-2);
  font-size: var(--fs-12);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.seg.sm button {
  height: calc(var(--control-h-sm) - 4px);
}
.seg button:hover {
  color: var(--text);
}
.seg button.on {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12), 0 0 0 1px var(--border);
}
</style>
