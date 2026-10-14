// Footprint packing on the 220 x 220 bed. Shelf packing of world-space footprints (largest first),
// centred as a block on the bed. Good enough for the handful of parts a V3 SE plate holds.

import { MACHINE } from '@shared/machine'
import { type SceneObject, worldBox } from '@/stores/scene'

const GAP = 6

export function arrange(objects: SceneObject[]): boolean {
  const items = objects
    .map((o) => {
      const b = worldBox(o)
      return { o, w: b.max.x - b.min.x, d: b.max.y - b.min.y, cx: (b.max.x + b.min.x) / 2 - o.position.x, cy: (b.max.y + b.min.y) / 2 - o.position.y }
    })
    .sort((a, b) => b.d - a.d || b.w - a.w)

  const usable = MACHINE.bed.x - MACHINE.purgeKeepout.xMax - 2
  const placed: { item: (typeof items)[number]; x: number; y: number }[] = []
  let x = 0
  let y = 0
  let shelf = 0
  let fits = true
  for (const item of items) {
    if (x > 0 && x + item.w > usable) {
      x = 0
      y += shelf + GAP
      shelf = 0
    }
    placed.push({ item, x, y })
    x += item.w + GAP
    shelf = Math.max(shelf, item.d)
  }
  const totalW = Math.max(...placed.map((p) => p.x + p.item.w), 0)
  const totalD = y + shelf
  if (totalD > MACHINE.bed.y || totalW > usable) fits = false
  const ox = MACHINE.purgeKeepout.xMax + 2 + (usable - totalW) / 2
  const oy = (MACHINE.bed.y - totalD) / 2
  for (const p of placed) {
    p.item.o.position.x = ox + p.x + p.item.w / 2 - p.item.cx
    p.item.o.position.y = oy + p.y + p.item.d / 2 - p.item.cy
  }
  return fits
}
