// Preview actions, UI-independent: the preview components and the MCP bridge call these.
// Layer numbers are 0-based indices here (the slider shows index + 1).

import { watch } from 'vue'
import { app } from '@/stores/app'
import { featureStyle } from './palette'
import { lastLayer, loadPreview, preview } from './state'

export type PreviewView = 'iso' | 'top' | 'front' | 'fit'

export interface PreviewInfo {
  status: typeof preview.status
  error: string
  resultId: string
  /** the slice changed since this preview was built */
  stale: boolean
  layerCount: number
  /** shown range, 0-based inclusive */
  range: [number, number]
  /** per layer: top Z (mm), layer height (mm), approximate seconds */
  layers: { z: number; height: number; time: number }[]
  features: { type: string; label: string; color: string; visible: boolean; share: number; seconds: number; lengthMm: number }[]
  travelVisible: boolean
  view: 'iso' | 'top' | 'front'
}

export function getPreviewInfo(): PreviewInfo {
  return {
    status: preview.status,
    error: preview.error,
    resultId: preview.resultId,
    stale: !!app.slice.result && (app.slice.status !== 'done' || app.slice.result.id !== preview.resultId),
    layerCount: preview.layers.length,
    range: [preview.range[0], preview.range[1]],
    layers: preview.layers.map((l) => ({ z: Math.round(l.z * 1000) / 1000, height: Math.round(l.height * 1000) / 1000, time: Math.round(l.time * 10) / 10 })),
    features: preview.legend.map((r) => ({
      type: r.type,
      label: r.label,
      color: r.color,
      visible: !preview.hidden[r.type],
      share: Math.round(r.share * 1000) / 1000,
      seconds: Math.round(r.time),
      lengthMm: Math.round(r.length)
    })),
    travelVisible: preview.travel,
    view: preview.view
  }
}

/** Show layers min..max (0-based, inclusive, clamped). Returns the range actually applied. */
export function setLayerRange(min: number, max: number): [number, number] {
  const last = lastLayer()
  let lo = Math.max(0, Math.min(Math.round(min), last))
  let hi = Math.max(0, Math.min(Math.round(max), last))
  if (lo > hi) [lo, hi] = [hi, lo]
  preview.range = [lo, hi]
  return [lo, hi]
}

/** Show or hide one feature type, by Orca name ("Outer wall") or legend label; "Travel" for travel moves. */
export function setFeatureVisible(type: string, on: boolean): void {
  const key = type.trim().toLowerCase()
  if (key === 'travel') {
    preview.travel = on
    return
  }
  const row = preview.legend.find((r) => r.type.toLowerCase() === key || r.label.toLowerCase() === key || featureStyle(r.type).label.toLowerCase() === key)
  if (!row) throw new Error(`No "${type}" in this preview. Types: ${preview.legend.map((r) => r.type).join(', ')}, Travel.`)
  preview.hidden = { ...preview.hidden, [row.type]: !on }
}

/** Show every feature type (travel stays as it is). */
export function showAllFeatures(): void {
  preview.hidden = {}
}

/** Camera preset, or 'fit' to frame the print from the current direction. */
export function setPreviewView(v: PreviewView): void {
  if (v === 'fit') {
    preview.fitSeq++
    return
  }
  preview.view = v
  preview.viewSeq++
}

/** Switch to Preview mode and resolve once the toolpaths of the current slice are loaded. */
export async function openPreview(timeoutMs = 60000): Promise<PreviewInfo> {
  const r = app.slice.result
  if (!r) throw new Error('Nothing is sliced yet. Slice first.')
  app.page = 'workspace'
  app.mode = 'preview'
  void loadPreview(r)
  if (preview.status !== 'ready' || preview.resultId !== r.id) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        stop()
        reject(new Error('The preview took too long to load.'))
      }, timeoutMs)
      const stop = watch(
        () => [preview.status, preview.resultId] as const,
        ([s, id]) => {
          if (id === r.id && (s === 'ready' || s === 'error')) {
            clearTimeout(t)
            stop()
            if (s === 'error') reject(new Error(preview.error))
            else resolve()
          }
        },
        { immediate: true }
      )
    })
  }
  return getPreviewInfo()
}

// Test/automation handle (scripts/shot-output.mjs); the MCP bridge imports the functions directly.
;(window as unknown as { __ffPreviewActions: unknown }).__ffPreviewActions = { getPreviewInfo, setLayerRange, setFeatureVisible, showAllFeatures, setPreviewView, openPreview }
