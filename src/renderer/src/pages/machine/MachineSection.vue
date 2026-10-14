<script setup lang="ts">
// One settings block: title and explanation on the left, controls on the right.
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <section class="msec">
    <div class="intro">
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
      <slot name="intro" />
    </div>
    <div class="content"><slot /></div>
  </section>
</template>

<style scoped>
.msec {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: 32px;
  padding: 24px 0;
  border-top: 1px solid var(--border);
}
.intro {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
h2 {
  font-size: var(--fs-14);
  font-weight: 600;
}
p {
  font-size: var(--fs-12);
  color: var(--text-2);
}
.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
@media (max-width: 860px) {
  .msec {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
