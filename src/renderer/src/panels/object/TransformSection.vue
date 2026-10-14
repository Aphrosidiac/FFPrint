<script setup lang="ts">
// Transform of the selection: position, rotation, scale and size for one part; a group move for
// several. Every edit goes through viewport/actions.ts (rotation/scale edits keep the part in place
// and drop it onto the bed).
import { computed, ref } from 'vue'
import { ArrowDownFromLine, ArrowDownToLine, Crosshair, LayoutGrid, Link, Unlink, RotateCw, Trash2, TriangleAlert, Maximize2 } from 'lucide-vue-next'
import { meshes, selected, worldBox, ISSUE_TEXT, issues, type Issue } from '@/stores/scene'
import {
  arrangeAll,
  centreOnBed,
  deleteObjects,
  dropToBed,
  groupCentre,
  layFlatAuto,
  moveObject,
  moveObjects,
  resetRotation,
  resetScale,
  rotateObject,
  scaleObject,
  setLayFlatMode
} from '@/viewport/actions'
import { ws } from '@/viewport/workspace'
import Button from '@/ui/Button.vue'
import AxisFields from './AxisFields.vue'

type Axis = 'x' | 'y' | 'z'
const lock = ref(true)

const one = computed(() => (selected.value.length === 1 ? selected.value[0] : null))
const ids = computed(() => selected.value.map((o) => o.id))

const box = computed(() => (one.value ? worldBox(one.value) : null))
const centre = computed(() => {
  if (one.value && box.value) return { x: (box.value.min.x + box.value.max.x) / 2, y: (box.value.min.y + box.value.max.y) / 2 }
  if (selected.value.length > 1) return groupCentre(ids.value)
  return { x: 0, y: 0 }
})
const lift = computed(() => (box.value ? box.value.min.z : 0))
const onBed = computed(() => Math.abs(lift.value) < 0.01)

const mesh = computed(() => (one.value ? meshes.get(one.value.meshId) : undefined))
const percent = computed(() => {
  const s = one.value?.scale ?? { x: 1, y: 1, z: 1 }
  return { x: s.x * 100, y: s.y * 100, z: s.z * 100 }
})
const size = computed(() => {
  const m = mesh.value
  const s = one.value?.scale
  if (!m || !s) return { x: 0, y: 0, z: 0 }
  return { x: m.size.x * s.x, y: m.size.y * s.y, z: m.size.z * s.z }
})
const triangles = computed(() => {
  let t = 0
  for (const o of selected.value) t += meshes.get(o.meshId)?.triangles ?? 0
  return t
})
const rotated = computed(() => !!one.value && (one.value.rotation.x !== 0 || one.value.rotation.y !== 0 || one.value.rotation.z !== 0))
const scaled = computed(() => !!one.value && (one.value.scale.x !== 1 || one.value.scale.y !== 1 || one.value.scale.z !== 1))

function setPos(axis: Axis, v: number): void {
  if (one.value) moveObject(one.value.id, { [axis]: v })
  else moveObjects(ids.value, { [axis]: v })
}
function setRot(axis: Axis, v: number): void {
  if (one.value) rotateObject(one.value.id, { [axis]: v })
}
function turn(axis: Axis): void {
  for (const id of ids.value) rotateObject(id, { [axis]: 90 }, 'relative')
}
function setPercent(axis: Axis, v: number): void {
  if (one.value) scaleObject(one.value.id, { axes: { [axis]: v }, uniform: lock.value })
}
function setSize(axis: Axis, v: number): void {
  if (one.value) scaleObject(one.value.id, { size: { [axis]: v }, uniform: lock.value })
}

// ------------------------------------------------------------------ issues

interface Banner {
  tone: 'danger' | 'warning'
  text: string
  action?: { label: string; run: () => void }
}

const banner = computed<Banner | null>(() => {
  const sel = selected.value.filter((o) => o.visible)
  if (!sel.length) return null
  if (sel.length > 1) {
    const bad = sel.filter((o) => issues(o).some((i) => i !== 'purge-zone')).length
    if (!bad) return null
    return { tone: 'danger', text: `${bad} of the selected parts can't be printed where they are.`, action: { label: 'Arrange all', run: () => arrangeAll() } }
  }
  const o = sel[0]
  const list: Issue[] = issues(o)
  if (!list.length) return null
  const b = worldBox(o)
  const tooBig = b.max.x - b.min.x > 220 || b.max.y - b.min.y > 220
  if (list.includes('outside')) {
    if (tooBig) return { tone: 'danger', text: 'This part is larger than the 220 × 220 mm bed. Scale it down or lay it on another face.' }
    return { tone: 'danger', text: `${ISSUE_TEXT.outside}, so it can't be printed.`, action: { label: 'Move onto bed', run: () => centreOnBed([o.id]) } }
  }
  if (list.includes('too-tall')) return { tone: 'danger', text: `${ISSUE_TEXT['too-tall']}. Lay it on a larger face or scale it down.`, action: { label: 'Lay flat', run: () => layFlatAuto(o.id) } }
  if (list.includes('below-bed')) return { tone: 'danger', text: `Part of it sits below the bed and would be cut off.`, action: { label: 'Drop to bed', run: () => dropToBed([o.id]) } }
  return { tone: 'warning', text: `${ISSUE_TEXT['purge-zone']}; the nozzle primes there before printing.`, action: { label: 'Move onto bed', run: () => centreOnBed([o.id]) } }
})
</script>

<template>
  <section v-if="selected.length" class="tf">
    <div v-if="banner" class="banner" :class="banner.tone" role="status">
      <TriangleAlert />
      <div class="banner-body">
        <p>{{ banner.text }}</p>
        <button v-if="banner.action" type="button" class="banner-act" @click="banner.action.run">{{ banner.action.label }}</button>
      </div>
    </div>

    <!-- several parts: group move and plate actions -->
    <template v-if="!one">
      <div class="multi">
        <span class="note">{{ selected.length }} objects selected</span>
      </div>
      <div class="block">
        <div class="block-head">
          <span class="section-title">Position <span class="unit">mm</span></span>
          <button type="button" class="link" title="Centre the group on the bed" @click="centreOnBed(ids)"><Crosshair />Centre</button>
        </div>
        <AxisFields label="Position" :axes="['x', 'y']" :values="centre" :step="1" :digits="2" @change="setPos" />
      </div>
      <div class="block">
        <div class="block-head"><span class="section-title">Rotate 90°</span></div>
        <div class="quarter flush">
          <Button size="sm" title="Rotate 90° about X" @click="turn('x')"><RotateCw />X +90°</Button>
          <Button size="sm" title="Rotate 90° about Y" @click="turn('y')"><RotateCw />Y +90°</Button>
          <Button size="sm" title="Rotate 90° about Z" @click="turn('z')"><RotateCw />Z +90°</Button>
        </div>
      </div>
      <div class="grid2">
        <Button size="sm" @click="arrangeAll"><LayoutGrid />Arrange all</Button>
        <Button size="sm" @click="dropToBed(ids)"><ArrowDownFromLine />Drop to bed</Button>
        <Button size="sm" variant="danger" @click="deleteObjects(ids)"><Trash2 />Delete</Button>
      </div>
    </template>

    <!-- one part -->
    <template v-else>
      <div class="block">
        <div class="block-head">
          <span class="section-title">Position <span class="unit">mm</span></span>
          <button type="button" class="link" title="Centre on bed" @click="centreOnBed([one.id])"><Crosshair />Centre</button>
        </div>
        <AxisFields label="Position" :axes="['x', 'y']" :values="centre" :step="1" :digits="2" @change="setPos" />
        <div class="zrow">
          <span class="letter">Z</span>
          <span v-if="onBed" class="zval subtle">On bed</span>
          <span v-else class="zval num" :class="{ bad: lift < 0 }">{{ lift > 0 ? `${lift.toFixed(2)} mm above the bed` : `${(-lift).toFixed(2)} mm below the bed` }}</span>
          <button type="button" class="link" :disabled="onBed" title="Drop to bed" @click="dropToBed([one.id])"><ArrowDownFromLine />Drop</button>
        </div>
      </div>

      <div class="block">
        <div class="block-head">
          <span class="section-title">Rotation <span class="unit">°</span></span>
          <button type="button" class="link" :disabled="!rotated" title="Reset rotation" @click="resetRotation([one.id])">Reset</button>
        </div>
        <AxisFields label="Rotation" :values="one.rotation" :step="1" :digits="2" @change="setRot" />
        <div class="quarter">
          <Button size="sm" title="Rotate 90° about X" @click="turn('x')"><RotateCw />90°</Button>
          <Button size="sm" title="Rotate 90° about Y" @click="turn('y')"><RotateCw />90°</Button>
          <Button size="sm" title="Rotate 90° about Z" @click="turn('z')"><RotateCw />90°</Button>
        </div>
        <div class="grid2">
          <Button size="sm" :class="{ on: ws.layFlat }" title="Pick a face in the view to put it on the bed (L)" @click="setLayFlatMode(!ws.layFlat)"><ArrowDownToLine />Lay on face</Button>
          <Button size="sm" title="Put the largest flat face on the bed" @click="layFlatAuto(one.id)"><Maximize2 />Auto lay flat</Button>
        </div>
      </div>

      <div class="block">
        <div class="block-head">
          <span class="section-title">Scale <span class="unit">%</span></span>
          <div class="head-actions">
            <button type="button" class="link icon" :class="{ on: lock }" :title="lock ? 'Proportions locked' : 'Proportions unlocked'" :aria-pressed="lock" @click="lock = !lock">
              <Link v-if="lock" />
              <Unlink v-else />
            </button>
            <button type="button" class="link" :disabled="!scaled" title="Reset scale" @click="resetScale([one.id])">Reset</button>
          </div>
        </div>
        <AxisFields label="Scale" :values="percent" :step="1" :digits="2" :min="0.1" @change="setPercent" />
        <div class="block-head sub">
          <span class="section-title">Size <span class="unit">mm</span></span>
        </div>
        <AxisFields label="Size" :values="size" :step="1" :digits="2" :min="0.01" @change="setSize" />
      </div>
    </template>

    <p class="info subtle num">{{ triangles.toLocaleString('en-US') }} triangles</p>
  </section>
</template>

<style scoped>
.tf {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--border);
}
.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
}
.block-head.sub {
  margin-top: 4px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.unit {
  font-weight: 400;
  color: var(--text-3);
  margin-left: 2px;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--accent-text);
  font-size: var(--fs-12);
  font-weight: 500;
  cursor: pointer;
}
.link:hover:not(:disabled) {
  background: var(--accent-soft);
}
.link:disabled {
  color: var(--text-3);
  cursor: default;
}
.link svg {
  width: 14px;
  height: 14px;
}
.link.icon {
  width: 24px;
  padding: 0;
  justify-content: center;
  color: var(--text-3);
}
.link.icon.on {
  color: var(--accent-text);
}
.zrow {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
}
.letter {
  width: 8px;
  flex: none;
  color: var(--text-3);
  font-size: var(--fs-11);
  font-weight: 600;
  text-align: center;
}
.zval {
  flex: 1;
  font-size: var(--fs-12);
}
.zval.bad {
  color: var(--danger);
}
.quarter {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding-left: 14px;
}
.quarter.flush {
  padding-left: 0;
}
.quarter :deep(.btn) {
  gap: 4px;
  padding: 0 4px;
}
.quarter :deep(.btn svg) {
  width: 13px;
  height: 13px;
  color: var(--text-3);
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.grid2 :deep(.btn) {
  padding: 0 8px;
}
.grid2 :deep(.btn.on) {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-text);
}
.multi .note {
  font-size: var(--fs-13);
  font-weight: 500;
}
.banner {
  display: flex;
  gap: 8px;
  padding: 8px 12px 8px 8px;
  border-radius: var(--r);
  font-size: var(--fs-12);
}
.banner > svg {
  width: 16px;
  height: 16px;
  flex: none;
  margin-top: 1px;
}
.banner.danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.banner.warning {
  background: var(--warning-soft);
  color: var(--warning);
}
.banner-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.banner-body p {
  color: var(--text);
}
.banner-act {
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: var(--fs-12);
  font-weight: 600;
  cursor: pointer;
}
.banner-act:hover {
  text-decoration: underline;
}
.info {
  font-size: var(--fs-11);
}
</style>
