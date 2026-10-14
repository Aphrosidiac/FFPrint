<script setup lang="ts">
// Every job saved to a card or file. Reprint reopens the job with its settings; entering the real
// print time teaches FF Print how far off the engine's estimates are on this printer.
import { computed, ref } from 'vue'
import { History } from 'lucide-vue-next'
import type { HistoryEntry } from '@shared/types'
import { errorText } from '@/lib/api'
import { app, toast } from '@/stores/app'
import { deleteJob, reprint, timeFactorInfo } from '@/stores/outputActions'
import Button from '@/ui/Button.vue'
import Dialog from '@/ui/Dialog.vue'
import HistoryItem from './history/HistoryItem.vue'
import BackLink from '@/ui/BackLink.vue'

const info = computed(() => timeFactorInfo())
const factor = computed(() => info.value.factor)
const learnedFrom = computed(() => info.value.prints)
const factorText = computed(() => {
  const n = learnedFrom.value
  const prints = `${n} print${n === 1 ? '' : 's'}`
  if (!n) return 'After a print, enter how long it really took. FF Print uses the real times to correct its estimates for this printer.'
  if (Math.abs(factor.value - 1) < 0.0005) return `Estimates match this printer so far (from ${prints}).`
  return `Estimates are corrected by ×${factor.value.toFixed(2)} from ${prints}.`
})

async function onReprint(h: HistoryEntry): Promise<void> {
  await reprint(h.id)
}

const confirmOpen = ref(false)
const pending = ref<HistoryEntry | null>(null)
function askDelete(h: HistoryEntry): void {
  pending.value = h
  confirmOpen.value = true
}
async function doDelete(): Promise<void> {
  const h = pending.value
  confirmOpen.value = false
  if (!h) return
  try {
    await deleteJob(h.id)
  } catch (e) {
    toast('error', errorText(e))
  }
}
</script>

<template>
  <div class="page">
    <div class="inner">
      <BackLink />
      <header class="head">
        <div>
          <h1>History</h1>
          <p class="sub">{{ factorText }}</p>
        </div>
        <span v-if="app.history.length" class="count num">{{ app.history.length }} job{{ app.history.length === 1 ? '' : 's' }}</span>
      </header>

      <div v-if="!app.history.length" class="empty">
        <History />
        <strong>No saved jobs yet</strong>
        <span>Every G-code you save to the SD card or a folder shows up here, ready to print again.</span>
        <Button @click="app.page = 'workspace'">Back to the workspace</Button>
      </div>

      <div v-else class="list">
        <HistoryItem v-for="h in app.history" :key="h.id" :entry="h" @reprint="onReprint(h)" @remove="askDelete(h)" />
      </div>
    </div>

    <Dialog v-model="confirmOpen" title="Delete this job?" width="400px">
      <p class="muted">
        <strong>{{ pending?.jobName }}</strong> is removed from History along with its saved project. The G-code file itself is not touched.
      </p>
      <template #footer>
        <Button @click="confirmOpen = false">Cancel</Button>
        <Button variant="danger" @click="doDelete">Delete</Button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: var(--bg);
}
.inner {
  max-width: 1040px;
  margin: 0 auto;
  padding: 24px 24px 40px;
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
h1 {
  font-family: var(--font-display);
  font-size: var(--fs-20);
  font-weight: 600;
  line-height: 28px;
}
.sub {
  margin-top: 2px;
  font-size: var(--fs-13);
  color: var(--text-2);
}
.count {
  font-size: var(--fs-12);
  color: var(--text-3);
  white-space: nowrap;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 24px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--r-lg);
  text-align: center;
}
.empty svg {
  width: 16px;
  height: 16px;
  color: var(--text-3);
}
.empty strong {
  font-size: var(--fs-14);
  font-weight: 600;
}
.empty span {
  max-width: 360px;
  font-size: var(--fs-13);
  color: var(--text-2);
}
.empty .btn {
  margin-top: 8px;
}
</style>
