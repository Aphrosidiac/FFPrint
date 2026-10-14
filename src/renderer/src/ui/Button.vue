<script setup lang="ts">
// Variants: primary (one per area), secondary (default), ghost (toolbars), danger.
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; block?: boolean; disabled?: boolean; type?: 'button' | 'submit' }>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button'
})
</script>

<template>
  <button :type="type" class="btn" :class="[variant, size, { block }]" :disabled="disabled"><slot /></button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: var(--control-h);
  padding: 0 12px;
  border-radius: var(--r);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font-size: var(--fs-13);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.btn:hover:not(:disabled) {
  background: var(--surface-3);
}
.btn :deep(svg) {
  width: 16px;
  height: 16px;
  flex: none;
}
.sm {
  height: var(--control-h-sm);
  padding: 0 10px;
  font-size: var(--fs-12);
}
.lg {
  height: 40px;
  padding: 0 16px;
  font-size: var(--fs-14);
  font-weight: 600;
}
.block {
  width: 100%;
}
.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.primary:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}
.ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-2);
}
.ghost:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}
.danger {
  color: var(--danger);
}
.danger:hover:not(:disabled) {
  background: var(--danger-soft);
}
/* Disabled fills drop to an outline instead of becoming a grey slab. */
.btn:disabled {
  cursor: default;
  background: transparent;
  border-color: var(--border);
  color: var(--text-3);
}
</style>
