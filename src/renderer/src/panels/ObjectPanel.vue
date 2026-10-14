<script setup lang="ts">
// Left column of Prepare: the parts on the bed (select, rename, hide) and the selection's transform.
import { computed, nextTick, ref } from 'vue'
import { Eye, EyeOff, LayoutGrid, Plus, Trash2 } from 'lucide-vue-next'
import { openDialog } from '@/stores/app'
import { ISSUE_TEXT, issues, scene, worldBox, type SceneObject } from '@/stores/scene'
import { arrangeAll, deleteObjects, renameObject, selectObjects, setVisible } from '@/viewport/actions'
import IconButton from '@/ui/IconButton.vue'
import Button from '@/ui/Button.vue'
import TransformSection from './object/TransformSection.vue'

const editing = ref<string | null>(null)
const draft = ref('')
const nameInput = ref<HTMLInputElement[]>([])
let anchor: string | null = null

const rows = computed(() =>
  scene.objects.map((o) => {
    const b = worldBox(o)
    const list = issues(o)
    return {
      o,
      size: `${(b.max.x - b.min.x).toFixed(1)} × ${(b.max.y - b.min.y).toFixed(1)} × ${(b.max.z - b.min.z).toFixed(1)} mm`,
      issues: list,
      blocking: list.some((i) => i !== 'purge-zone'),
      tip: list.map((i) => ISSUE_TEXT[i]).join('\n'),
      selected: scene.selection.includes(o.id)
    }
  })
)

function onRowClick(e: MouseEvent, o: SceneObject): void {
  if (editing.value) return
  if (e.shiftKey && anchor) {
    const ids = scene.objects.map((x) => x.id)
    const a = ids.indexOf(anchor)
    const b = ids.indexOf(o.id)
    if (a >= 0 && b >= 0) {
      const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1)
      selectObjects(range, e.ctrlKey || e.metaKey)
      return
    }
  }
  if (e.ctrlKey || e.metaKey) {
    selectObjects(scene.selection.includes(o.id) ? scene.selection.filter((id) => id !== o.id) : [...scene.selection, o.id])
  } else selectObjects([o.id])
  anchor = o.id
}

async function startRename(o: SceneObject): Promise<void> {
  editing.value = o.id
  draft.value = o.name
  await nextTick()
  const el = nameInput.value[0]
  el?.focus()
  el?.select()
}

function commitRename(o: SceneObject): void {
  if (editing.value !== o.id) return
  editing.value = null
  renameObject(o.id, draft.value)
}

function toggleVisible(o: SceneObject): void {
  setVisible(o.id, !o.visible)
}
</script>

<template>
  <div class="panel">
    <header class="head">
      <div class="title">
        <span class="section-title">Objects</span>
        <span v-if="scene.objects.length" class="count num">{{ scene.objects.length }}</span>
      </div>
      <div class="actions">
        <IconButton size="sm" label="Add models" @click="openDialog"><Plus /></IconButton>
        <IconButton size="sm" label="Arrange all (A)" :disabled="!scene.objects.length" @click="arrangeAll"><LayoutGrid /></IconButton>
        <IconButton size="sm" label="Delete selected (Del)" :disabled="!scene.selection.length" @click="deleteObjects([...scene.selection])"><Trash2 /></IconButton>
      </div>
    </header>

    <div v-if="!scene.objects.length" class="none">
      <p>No models on the bed.</p>
      <p class="subtle">Open or drop STL, OBJ or 3MF files.</p>
      <Button size="sm" @click="openDialog"><Plus />Add models</Button>
    </div>

    <ul v-else class="list" role="listbox" aria-multiselectable="true" aria-label="Objects">
      <li
        v-for="r in rows"
        :key="r.o.id"
        class="row"
        :class="{ sel: r.selected, hidden: !r.o.visible }"
        role="option"
        :aria-selected="r.selected"
        @click="onRowClick($event, r.o)"
      >
        <div class="text">
          <input
            v-if="editing === r.o.id"
            ref="nameInput"
            v-model="draft"
            class="rename"
            aria-label="Object name"
            @click.stop
            @keydown.enter.prevent="commitRename(r.o)"
            @keydown.esc.prevent.stop="editing = null"
            @blur="commitRename(r.o)"
          />
          <span v-else class="name" :title="`${r.o.name} (double-click to rename)`" @dblclick.stop="startRename(r.o)">{{ r.o.name }}</span>
          <span class="size num">{{ r.size }}</span>
        </div>
        <span v-if="r.issues.length" class="dot" :class="{ warn: !r.blocking }" :title="r.tip" role="img" :aria-label="r.tip" />
        <button type="button" class="eye" :title="r.o.visible ? 'Hide (not printed)' : 'Show'" :aria-label="r.o.visible ? 'Hide' : 'Show'" @click.stop="toggleVisible(r.o)">
          <Eye v-if="r.o.visible" />
          <EyeOff v-else />
        </button>
      </li>
    </ul>

    <TransformSection />
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 8px 0 16px;
  flex: none;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.count {
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: var(--fs-11);
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}
.actions {
  display: flex;
  gap: 2px;
}
.none {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 4px 16px 16px;
  font-size: var(--fs-13);
}
.none .subtle {
  font-size: var(--fs-12);
  margin-bottom: 8px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0 8px 8px;
  max-height: 40vh;
  overflow-y: auto;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 4px 0 8px;
  border-radius: var(--r);
  cursor: default;
}
.row:hover {
  background: var(--surface-2);
}
.row.sel {
  background: var(--accent-soft);
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-13);
  font-weight: 500;
  color: var(--text);
}
.row.sel .name {
  color: var(--accent-text);
}
.size {
  font-size: var(--fs-11);
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row.hidden .name,
.row.hidden .size {
  color: var(--text-3);
}
.row.hidden .name {
  text-decoration: line-through;
  text-decoration-color: var(--border-strong);
}
.rename {
  height: 22px;
  margin: -2px 0 -1px -4px;
  padding: 0 4px;
  border: 1px solid var(--accent);
  border-radius: var(--r-sm);
  outline: 0;
  background: var(--surface);
  font-size: var(--fs-13);
  font-weight: 500;
  min-width: 0;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
  flex: none;
}
.dot.warn {
  background: var(--warning);
}
.eye {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
}
.row:hover .eye,
.row.hidden .eye,
.eye:focus-visible {
  opacity: 1;
}
.eye:hover {
  background: var(--surface-3);
  color: var(--text);
}
.eye svg {
  width: 14px;
  height: 14px;
}
</style>
