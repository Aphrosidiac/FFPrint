<script setup lang="ts">
// Automation: the local MCP server Claude Code connects to. Status, the `claude mcp add` command and
// the access key (masked until shown).
import { computed, onMounted, ref } from 'vue'
import { Check, Copy, Eye, EyeOff } from 'lucide-vue-next'
import { api, errorText } from '@/lib/api'
import { toast } from '@/stores/app'
import Button from '@/ui/Button.vue'
import MachineSection from './MachineSection.vue'

type Status = Awaited<ReturnType<typeof api.automationStatus>>
const status = ref<Status | null>(null)
const error = ref('')
const showToken = ref(false)
const copied = ref<'' | 'command' | 'token'>('')

onMounted(async () => {
  try {
    status.value = await api.automationStatus()
  } catch (e) {
    error.value = errorText(e)
  }
})

// The URL carries the port actually bound (the configured one may have been taken).
const port = computed(() => status.value?.url.match(/:(\d+)\//)?.[1] ?? String(status.value?.port ?? ''))
const masked = computed(() => (status.value?.token ? '•'.repeat(Math.min(32, status.value.token.length)) : ''))
// The command carries the key; keep it masked in the box too until "Show key".
const commandShown = computed(() => {
  const s = status.value
  if (!s) return ''
  return showToken.value || !s.token ? s.command : s.command.split(s.token).join(masked.value)
})

let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy(what: 'command' | 'token'): Promise<void> {
  const s = status.value
  if (!s) return
  try {
    await navigator.clipboard.writeText(what === 'command' ? s.command : s.token)
    copied.value = what
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = ''), 1500)
  } catch (e) {
    toast('error', `Could not copy: ${errorText(e)}`)
  }
}
</script>

<template>
  <MachineSection title="Automation" description="Lets Claude Code control FF Print: open models, change settings, slice, save to the card. Only programs on this PC with the key can connect.">
    <div class="row">
      <span class="lbl">Status</span>
      <span v-if="error" class="bad">{{ error }}</span>
      <span v-else-if="!status" class="muted">Checking…</span>
      <span v-else-if="status.running" class="ok"><span class="dot" />Running on <span class="mono">127.0.0.1:{{ port }}</span></span>
      <span v-else class="muted"><span class="dot off" />Off</span>
    </div>

    <template v-if="status?.command">
      <div class="block">
        <div class="head">
          <span class="lbl">Add to Claude Code</span>
          <Button size="sm" variant="ghost" @click="copy('command')">
            <Check v-if="copied === 'command'" /><Copy v-else />{{ copied === 'command' ? 'Copied' : 'Copy command' }}
          </Button>
        </div>
        <pre class="box mono">{{ commandShown }}</pre>
        <p class="hint">Run this once in a terminal. The copied command includes the key.</p>
      </div>

      <div class="block">
        <div class="head">
          <span class="lbl">Access key</span>
          <div class="btns">
            <Button size="sm" variant="ghost" @click="showToken = !showToken"><EyeOff v-if="showToken" /><Eye v-else />{{ showToken ? 'Hide' : 'Show' }}</Button>
            <Button size="sm" variant="ghost" @click="copy('token')"><Check v-if="copied === 'token'" /><Copy v-else />{{ copied === 'token' ? 'Copied' : 'Copy' }}</Button>
          </div>
        </div>
        <div class="box mono key">{{ showToken ? status.token : masked }}</div>
      </div>
    </template>
  </MachineSection>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.lbl {
  font-size: var(--fs-13);
  color: var(--text-2);
}
.row .lbl {
  width: 120px;
  flex: none;
}
.ok,
.muted,
.bad {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ok {
  color: var(--text);
}
.muted {
  color: var(--text-3);
}
.bad {
  color: var(--danger);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
}
.dot.off {
  background: var(--border-strong);
}
.block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}
.btns {
  display: flex;
  gap: 4px;
}
.box {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface-2);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
  -webkit-user-select: text;
}
.key {
  min-height: 32px;
}
.mono {
  font-family: var(--mono);
  font-size: var(--fs-12);
}
.hint {
  font-size: var(--fs-12);
  color: var(--text-3);
}
</style>
