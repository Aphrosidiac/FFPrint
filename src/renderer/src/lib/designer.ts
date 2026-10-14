// A project 3MF from Creality Cloud / MakerWorld / Printables carries the print settings its designer
// used (Metadata/project_settings.config). FF Print reads the parts that describe the model's needs —
// layer height, supports, walls/infill density, brim — and leaves everything machine-specific alone
// (those files are often made for another printer). The infill pattern is skipped: it is almost always
// the designer's slicer default rather than a choice.

import { QUALITIES } from '@shared/settings'
import type { PrintSettings, QualityId, SupportMode } from '@shared/types'

const first = (v: unknown): string | undefined => {
  const x = Array.isArray(v) ? v[0] : v
  return x === undefined || x === null ? undefined : String(x)
}
const num = (v: unknown): number | undefined => {
  const n = parseFloat(first(v) ?? '')
  return Number.isFinite(n) ? n : undefined
}

export interface DesignerIntent {
  patch: Partial<PrintSettings>
  /** one short phrase per change, for the toast */
  notes: string[]
}

export function designerIntent(ps: Record<string, unknown>, current: PrintSettings): DesignerIntent | null {
  const patch: Partial<PrintSettings> = {}
  const notes: string[] = []

  const lh = num(ps.layer_height)
  if (lh !== undefined) {
    const q = QUALITIES.reduce((best, x) => (Math.abs(x.layerHeight - lh) < Math.abs(best.layerHeight - lh) ? x : best))
    if (q.id !== current.quality) {
      patch.quality = q.id as QualityId
      notes.push(`${q.label} quality`)
    }
  }

  if (first(ps.enable_support) !== undefined) {
    const on = first(ps.enable_support) === '1'
    const mode: SupportMode = !on ? 'off' : /tree/.test(first(ps.support_type) ?? '') ? 'tree' : 'grid'
    if (mode !== current.supports) {
      patch.supports = mode
      notes.push(mode === 'off' ? 'no supports' : `${mode} supports`)
    }
    const plateOnly = first(ps.support_on_build_plate_only)
    if (on && plateOnly !== undefined && (plateOnly === '1') !== current.supportBuildPlateOnly) patch.supportBuildPlateOnly = plateOnly === '1'
  }

  const walls = num(ps.wall_loops)
  const infill = num(ps.sparse_infill_density)
  const top = num(ps.top_shell_layers)
  const bottom = num(ps.bottom_shell_layers)
  if (walls !== undefined && walls !== current.walls) patch.walls = walls
  if (infill !== undefined && infill !== current.infill) patch.infill = infill
  if (top !== undefined && top !== current.topLayers) patch.topLayers = top
  if (bottom !== undefined && bottom !== current.bottomLayers) patch.bottomLayers = bottom
  if (patch.walls !== undefined) notes.push(`${patch.walls} walls`)
  if (patch.infill !== undefined) notes.push(`${patch.infill}% infill`)
  if (patch.topLayers !== undefined || patch.bottomLayers !== undefined) notes.push(`${patch.topLayers ?? current.topLayers} top / ${patch.bottomLayers ?? current.bottomLayers} bottom layers`)

  const brim = first(ps.brim_type)
  if (brim) {
    const wantBrim = brim !== 'no_brim'
    if (wantBrim && current.adhesion !== 'brim') {
      patch.adhesion = 'brim'
      const w = num(ps.brim_width)
      if (w) patch.brimWidth = w
      notes.push('brim')
    }
  }
  return notes.length ? { patch, notes } : null
}
