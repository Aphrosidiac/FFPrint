<script setup lang="ts">
// "Back to workspace" at the top of the Filaments / History / Printer pages, in the page's own
// column so it lines up with the title at every window width. Esc does the same (App.vue).
import { ArrowLeft } from 'lucide-vue-next'
import { app } from '@/stores/app'
</script>

<template>
  <button type="button" class="back" title="Back to the workspace (Esc)" @click="app.page = 'workspace'">
    <ArrowLeft /><span>Back to workspace</span>
  </button>
</template>

<style scoped>
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 0 0 12px -8px;
  padding: 0 10px 0 8px;
  border: 0;
  border-radius: var(--r);
  background: transparent;
  color: var(--text-2);
  font-size: var(--fs-13);
  font-weight: 500;
  cursor: pointer;
}
.back:hover {
  background: var(--surface-3);
  color: var(--text);
}
.back svg {
  width: 16px;
  height: 16px;
}
</style>
