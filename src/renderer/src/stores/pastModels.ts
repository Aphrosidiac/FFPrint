// Past models for the empty bed (see src/main/pastModels.ts). Files without a picture yet get one
// drawn in the background, one at a time, smallest first; big files are skipped so the app never
// stalls on a library scan.

import { reactive } from 'vue'
import type { PastModel } from '@shared/types'
import { api, errorText } from '@/lib/api'
import { parseFile } from '@/lib/loaders'
import { renderThumbnail } from '@/viewport/capture'
import { openPaths, reprint, toast } from './app'

const MAX_BG_BYTES = 40 * 1024 * 1024

export const past = reactive({
  items: [] as PastModel[],
  loading: false,
  loaded: false
})

let generating = false

export async function refreshPast(): Promise<void> {
  past.loading = true
  try {
    past.items = await api.listPastModels()
    past.loaded = true
  } finally {
    past.loading = false
  }
  void fillThumbnails()
}

export async function openPast(m: PastModel): Promise<void> {
  if (m.kind === 'job' && m.historyId) await reprint(m.historyId)
  else await openPaths([m.path])
}

export async function hidePast(m: PastModel): Promise<void> {
  await api.hidePastModel({ kind: m.kind, path: m.path, historyId: m.historyId })
  past.items = past.items.filter((x) => x.id !== m.id)
}


async function fillThumbnails(): Promise<void> {
  if (generating) return
  generating = true
  try {
    const todo = past.items
      .filter((m) => !m.thumbnail && m.kind === 'file' && /^(stl|obj|3mf)$/.test(m.ext) && m.sizeBytes <= MAX_BG_BYTES)
      .sort((a, b) => a.sizeBytes - b.sizeBytes)
    for (const m of todo) {
      try {
        const bytes = await api.readModelBytes(m.path)
        const parsed = parseFile({ path: m.path, name: m.name, ext: m.ext as 'stl' | 'obj' | '3mf', bytes })
        const url = renderThumbnail(parsed.models.map((p) => ({ geometry: p.geometry })))
        for (const p of parsed.models) p.geometry.dispose()
        if (url) {
          await api.saveModelThumbnail(m.path, url)
          m.thumbnail = url
        }
      } catch {
        // unreadable model: leave the placeholder
      }
      await new Promise((r) => setTimeout(r, 30)) // keep the UI responsive between files
    }
  } finally {
    generating = false
  }
}

export function reportOpenError(e: unknown): void {
  toast('error', errorText(e))
}
