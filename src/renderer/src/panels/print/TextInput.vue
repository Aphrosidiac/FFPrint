<script setup lang="ts">
// Plain single-line text input matching NumberField/SelectField (32 px, same border and focus ring).
import { onMounted, ref } from 'vue'
const props = defineProps<{ placeholder?: string; autofocus?: boolean; mono?: boolean; maxlength?: number; ariaLabel?: string; invalid?: boolean }>()
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ enter: [] }>()
const el = ref<HTMLInputElement>()
onMounted(() => {
  if (props.autofocus) requestAnimationFrame(() => el.value?.select())
})
</script>

<template>
  <input
    ref="el"
    v-model="model"
    class="ti"
    :class="{ mono, invalid }"
    type="text"
    spellcheck="false"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :aria-label="ariaLabel"
    @keydown.enter="emit('enter')"
  />
</template>

<style scoped>
.ti {
  width: 100%;
  height: var(--control-h);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--r);
  background: var(--surface);
  font-size: var(--fs-13);
  outline: 0;
  transition: border-color var(--dur) var(--ease);
}
.ti:hover {
  border-color: var(--text-3);
}
.ti:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.ti::placeholder {
  color: var(--text-3);
}
.mono {
  font-family: var(--mono);
  font-size: var(--fs-12);
}
.invalid,
.invalid:hover {
  border-color: var(--danger);
}
</style>
