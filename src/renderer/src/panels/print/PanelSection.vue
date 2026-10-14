<script setup lang="ts">
// One block of the Print panel: a quiet title row (optional meta on the right) and its controls.
defineProps<{ title: string; help?: string }>()
</script>

<template>
  <section class="ps">
    <div class="head">
      <h3 class="section-title" :title="help || undefined">{{ title }}</h3>
      <div v-if="$slots.meta" class="meta"><slot name="meta" /></div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.ps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}
h3[title] {
  cursor: help;
}
.meta {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: var(--fs-12);
  color: var(--text-3);
}
</style>
