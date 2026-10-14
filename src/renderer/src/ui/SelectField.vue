<script setup lang="ts">
defineProps<{ options: { value: string; label: string }[]; disabled?: boolean; ariaLabel?: string }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="sel" :class="{ disabled }">
    <select v-model="model" :disabled="disabled" :aria-label="ariaLabel">
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
  </div>
</template>

<style scoped>
.sel {
  position: relative;
  height: var(--control-h);
}
select {
  appearance: none;
  width: 100%;
  height: 100%;
  padding: 0 28px 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  font-size: var(--fs-13);
  cursor: pointer;
  outline: 0;
}
select:hover {
  border-color: var(--text-3);
}
select:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
svg {
  position: absolute;
  right: 8px;
  top: 50%;
  width: 14px;
  height: 14px;
  margin-top: -7px;
  color: var(--text-3);
  pointer-events: none;
}
.disabled {
  opacity: 0.55;
}
</style>
