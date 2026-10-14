<script setup lang="ts">
defineProps<{ label?: string; disabled?: boolean }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="tg" :class="{ disabled }">
    <input v-model="model" type="checkbox" role="switch" :disabled="disabled" />
    <span class="track"><span class="knob" /></span>
    <span v-if="label" class="text">{{ label }}</span>
  </label>
</template>

<style scoped>
.tg {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: var(--fs-13);
}
input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.track {
  position: relative;
  width: 30px;
  height: 18px;
  border-radius: 9px;
  background: var(--border-strong);
  transition: background var(--dur) var(--ease);
  flex: none;
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
  transition: transform var(--dur) var(--ease);
}
input:checked + .track {
  background: var(--accent);
}
input:checked + .track .knob {
  transform: translateX(12px);
}
input:focus-visible + .track {
  box-shadow: var(--focus);
}
.disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>
