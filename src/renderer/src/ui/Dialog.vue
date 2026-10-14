<script setup lang="ts">
// Native <dialog> with showModal(). Closes on Escape, the X, or a click on the backdrop.
import { onMounted, ref, watch } from 'vue'
defineProps<{ title: string; width?: string }>()
const open = defineModel<boolean>({ required: true })
const el = ref<HTMLDialogElement>()

function sync(v: boolean): void {
  if (!el.value) return
  if (v && !el.value.open) el.value.showModal()
  if (!v && el.value.open) el.value.close()
}
watch(open, sync)
onMounted(() => sync(open.value))
</script>

<template>
  <dialog ref="el" class="dlg" :style="{ width: width ?? '480px' }" @close="open = false" @click.self="open = false">
    <div class="inner">
      <header>
        <h2>{{ title }}</h2>
        <button type="button" class="x" aria-label="Close" @click="open = false">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" /></svg>
        </button>
      </header>
      <div class="body"><slot /></div>
      <footer v-if="$slots.footer"><slot name="footer" /></footer>
    </div>
  </dialog>
</template>

<style scoped>
.dlg {
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-pop);
}
.dlg::backdrop {
  background: rgb(0 0 0 / 0.35);
}
.inner {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 48px);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px 20px;
}
h2 {
  font-size: var(--fs-16);
  font-weight: 600;
}
.x {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--r);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}
.x:hover {
  background: var(--surface-3);
}
.x svg {
  width: 14px;
  height: 14px;
}
.body {
  padding: 4px 20px 20px;
  overflow: auto;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
}
</style>
