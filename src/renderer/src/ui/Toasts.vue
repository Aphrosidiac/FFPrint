<script setup lang="ts">
// Rendered in the top layer via the Popover API so toasts stay visible above modal dialogs.
import { onMounted, ref, watch } from 'vue'
import { app, dismissToast } from '@/stores/app'

const el = ref<HTMLElement>()
function show(): void {
  const p = el.value as (HTMLElement & { showPopover?: () => void; hidePopover?: () => void }) | undefined
  if (!p?.showPopover) return
  if (p.matches(':popover-open')) p.hidePopover?.()
  p.showPopover()
}
onMounted(show)
watch(() => app.toasts.length, show)

function act(id: number, run: () => void): void {
  run()
  dismissToast(id)
}
</script>

<template>
  <div ref="el" popover="manual" class="toasts" aria-live="polite">
    <div v-for="t in app.toasts" :key="t.id" class="toast" :class="t.kind">
      <span class="dot" />
      <span class="text">{{ t.text }}</span>
      <button v-if="t.action" type="button" class="act" @click="act(t.id, t.action.run)">{{ t.action.label }}</button>
      <button type="button" class="x" aria-label="Dismiss" @click="dismissToast(t.id)">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  inset: auto 16px 16px auto;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 360px;
  overflow: visible;
}
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-pop);
  font-size: var(--fs-13);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex: none;
}
.success .dot {
  background: var(--success);
}
.error .dot {
  background: var(--danger);
}
.text {
  flex: 1;
}
.act {
  border: 0;
  background: transparent;
  color: var(--accent-text);
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--r-sm);
}
.act:hover {
  background: var(--accent-soft);
}
.x {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}
.x:hover {
  background: var(--surface-3);
}
.x svg {
  width: 12px;
  height: 12px;
}
</style>
