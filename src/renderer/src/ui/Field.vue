<script setup lang="ts">
// One labelled setting row: label (help as tooltip), control on the right, optional reset when changed.
defineProps<{ label: string; help?: string; changed?: boolean; stacked?: boolean }>()
defineEmits<{ reset: [] }>()
</script>

<template>
  <div class="field" :class="{ stacked }">
    <div class="label">
      <span :title="help || undefined">{{ label }}</span>
      <button v-if="changed" type="button" class="reset" title="Reset to default" @click="$emit('reset')">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.5M3 3v2.5h2.5" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
      </button>
    </div>
    <div class="control"><slot /></div>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 132px);
  align-items: center;
  gap: 12px;
  min-height: var(--control-h);
}
.field.stacked {
  grid-template-columns: 1fr;
  gap: 6px;
}
.label {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  color: var(--text-2);
  font-size: var(--fs-13);
}
.label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.label span[title] {
  cursor: help;
}
.reset {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--accent-text);
  cursor: pointer;
  flex: none;
}
.reset:hover {
  background: var(--accent-soft);
}
.reset svg {
  width: 13px;
  height: 13px;
}
.control {
  min-width: 0;
}
</style>
