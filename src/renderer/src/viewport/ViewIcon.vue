<script setup lang="ts">
// 16 px view icons: an oblique box with the face you will look at filled in.
import { computed } from 'vue'
import type { View } from './workspace'

const props = defineProps<{ view: View }>()

const FRONT = 'M2.5 6.5h8v7h-8z'
const TOP = 'M2.5 6.5L5.5 2.5H13.5L10.5 6.5z'
const SIDE = 'M10.5 6.5L13.5 2.5V9.5L10.5 13.5z'

const fill = computed(() => (props.view === 'front' ? FRONT : props.view === 'top' ? TOP : props.view === 'left' || props.view === 'right' ? SIDE : ''))
const mirror = computed(() => props.view === 'left')
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true" :style="mirror ? 'transform: scaleX(-1)' : undefined">
    <path v-if="fill" :d="fill" fill="currentColor" fill-opacity="0.35" stroke="none" />
    <path d="M2.5 6.5h8v7h-8z M2.5 6.5L5.5 2.5H13.5L10.5 6.5 M13.5 2.5V9.5L10.5 13.5" />
  </svg>
</template>
