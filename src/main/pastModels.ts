// "Past models": everything Fakhrul has opened or printed, for the empty Objects panel.
// Sources: files opened in FF Print (prefs.recent), jobs saved to history, and Creality Print's own
// recent projects + Creality Cloud downloads (so his older work shows up too).
// Thumbnails: a cached PNG per file version in userData/thumbs — taken from the picture a project
// 3MF carries, or rendered by the window when the model was opened (saveModelThumbnail).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { unzipSync } from 'fflate'
import type { PastModel } from '@shared/types'
import { getHistory } from './history'
import { getPrefs, savePrefs } from './library'
import { dataPaths } from './store'

const MODEL_EXT = /\.(stl|obj|3mf|ffprint)$/i
const thumbsDir = (): string => join(dataPaths.root, 'thumbs')
const keyOf = (path: string, mtimeMs: number): string => createHash('sha1').update(`${path.toLowerCase()}|${Math.round(mtimeMs)}`).digest('hex').slice(0, 20)
const idOf = (s: string): string => createHash('sha1').update(s.toLowerCase()).digest('hex').slice(0, 12)

/** The picture a Creality/Orca/Bambu project 3MF carries, if any. */
function embeddedThumb(path: string): Buffer | null {
  try {
    const names = ['Metadata/plate_1.png', 'Metadata/thumbnail.png', 'Auxiliaries/.thumbnails/thumbnail_middle.png', 'Metadata/top_1.png']
    const files = unzipSync(new Uint8Array(readFileSync(path)), { filter: (f) => names.includes(f.name) })
    for (const n of names) if (files[n]?.length) return Buffer.from(files[n])
  } catch {
    // not a zip / unreadable: no picture
  }
  return null
}

function thumbFor(path: string, mtimeMs: number): string | null {
  const file = join(thumbsDir(), `${keyOf(path, mtimeMs)}.png`)
  if (existsSync(file)) return `data:image/png;base64,${readFileSync(file).toString('base64')}`
  if (/\.3mf$/i.test(path)) {
    const png = embeddedThumb(path)
    if (png) {
      mkdirSync(thumbsDir(), { recursive: true })
      writeFileSync(file, png)
      return `data:image/png;base64,${png.toString('base64')}`
    }
  }
  return null
}

export function saveModelThumbnail(path: string, dataUrl: string): void {
  if (!dataUrl.startsWith('data:image/png;base64,') || !existsSync(path)) return
  mkdirSync(thumbsDir(), { recursive: true })
  writeFileSync(join(thumbsDir(), `${keyOf(path, statSync(path).mtimeMs)}.png`), Buffer.from(dataUrl.slice(22), 'base64'))
}

/** Creality Print's data folder (newest version), its recent projects and cloud downloads. */
function crealityPrintFiles(): { path: string; when?: number }[] {
  const root = join(process.env.APPDATA ?? '', 'Creality', 'Creality Print')
  if (!existsSync(root)) return []
  const out: { path: string; when?: number }[] = []
  for (const ver of readdirSync(root).filter((v) => /^\d/.test(v))) {
    const dir = join(root, ver)
    try {
      const raw = readFileSync(join(dir, 'Creality.conf'), 'utf8')
      // JSON followed by a "# MD5 checksum" line
      const conf = JSON.parse(raw.slice(0, raw.lastIndexOf('}') + 1)) as {
        recent_projects?: Record<string, string>
        recent_project_times?: Record<string, string>
      }
      for (const [k, p] of Object.entries(conf.recent_projects ?? {})) {
        const t = Date.parse(conf.recent_project_times?.[k] ?? '')
        out.push({ path: p, when: Number.isFinite(t) ? t : undefined })
      }
    } catch {
      // unreadable config: the folder scan below still finds the downloads
    }
    const cloud = join(dir, 'cloud_download_data')
    if (existsSync(cloud)) {
      for (const user of readdirSync(cloud)) {
        const d = join(cloud, user, '3mfs')
        if (existsSync(d)) for (const f of readdirSync(d)) if (MODEL_EXT.test(f)) out.push({ path: join(d, f) })
      }
    }
  }
  return out
}

export function listPastModels(): PastModel[] {
  const prefs = getPrefs()
  const hidden = new Set((prefs.hiddenModels ?? []).map((p) => p.toLowerCase()))
  const byPath = new Map<string, PastModel>()

  const addFile = (path: string, source: PastModel['source'], when?: number): void => {
    if (!MODEL_EXT.test(path) || hidden.has(path.toLowerCase())) return
    const key = path.toLowerCase()
    if (byPath.has(key)) {
      const m = byPath.get(key) as PastModel
      if (source === 'ffprint') m.source = 'ffprint'
      return
    }
    let st
    try {
      st = statSync(path)
    } catch {
      return // moved or deleted
    }
    byPath.set(key, {
      id: idOf(path),
      kind: 'file',
      path,
      name: basename(path, extname(path)),
      ext: extname(path).slice(1).toLowerCase(),
      source,
      date: new Date(when ?? st.mtimeMs).toISOString(),
      sizeBytes: st.size,
      thumbnail: thumbFor(path, st.mtimeMs)
    })
  }

  // FF Print's own recent list is newest-first; give it descending times so it sorts first.
  const now = Date.now()
  prefs.recent.forEach((p, i) => addFile(p, 'ffprint', now - i * 1000))
  for (const c of crealityPrintFiles()) addFile(c.path, 'creality', c.when)

  const jobs: PastModel[] = getHistory()
    .filter((h) => !hidden.has(`job:${h.id}`))
    .map((h) => ({
      id: `job-${h.id}`,
      kind: 'job' as const,
      path: h.projectPath,
      name: h.jobName.replace(/_/g, ' '),
      ext: 'ffprint',
      source: 'printed' as const,
      date: h.createdAt,
      sizeBytes: 0,
      thumbnail: h.thumbnail || null,
      historyId: h.id,
      detail: h.filamentName
    }))

  return [...jobs, ...byPath.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function hidePastModel(m: Pick<PastModel, 'kind' | 'path' | 'historyId'>): void {
  const prefs = getPrefs()
  const key = m.kind === 'job' ? `job:${m.historyId}` : m.path
  const recent = prefs.recent.filter((p) => p.toLowerCase() !== m.path.toLowerCase())
  savePrefs({ hiddenModels: [...new Set([...(prefs.hiddenModels ?? []), key])], recent })
}

/** Bytes of a model without adding it to the recent list (for background thumbnails). */
export function readModelBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path))
}
