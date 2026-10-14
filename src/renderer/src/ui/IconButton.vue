<script setup lang="ts">
defineProps<{ label: string; active?: boolean; disabled?: boolean; size?: 'sm' | 'md' }>()
</script>

<template>
  <button type="button" class="icon-btn" :class="[size ?? 'md', { active }]" :aria-label="label" :title="label" :disabled="disabled"><slot /></button>
</template>

<style scoped>
.icon-btn {
  display: inline-grid;
  place-items: center;
  width: var(--control-h);
  height: var(--control-h);
  border-radius: var(--r);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.icon-btn.sm {
  width: var(--control-h-sm);
  height: var(--control-h-sm);
}
.icon-btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}
.icon-btn.active {
  background: var(--accent-soft);
  color: var(--accent-text);
}
.icon-btn:disabled {
  color: var(--text-3);
  opacity: 0.5;
  cursor: default;
}
.icon-btn :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>
