// Small JSON documents in userData, written atomically (temp file + rename) so a crash mid-write
// never leaves a half file. Everything FF Print keeps is a few KB; a database would be overkill.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let root = ''

export const dataPaths = {
  get root(): string {
    return root
  },
  get work(): string {
    return join(root, 'work')
  },
  get history(): string {
    return join(root, 'history')
  }
}

export function initStore(dir: string): void {
  root = dir
  for (const d of [root, dataPaths.work, dataPaths.history]) mkdirSync(d, { recursive: true })
}

export function readDoc<T>(name: string, fallback: () => T): T {
  try {
    // strip a UTF-8 BOM (Windows tools add one when a file is edited by hand)
    return JSON.parse(readFileSync(join(root, `${name}.json`), 'utf8').replace(/^\uFEFF/, '')) as T
  } catch {
    return fallback()
  }
}

export function writeDoc<T>(name: string, value: T): T {
  const file = join(root, `${name}.json`)
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
  return value
}
