// Removable drives (the printer's SD card), writing G-code to them, and ejecting.
// Windows: drive letters are probed cheaply every 2 s; the detailed CIM query only runs when the set of
// letters changes. macOS: /Volumes.

import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Drive } from '@shared/types'
import { dedupeName, safeFileName } from './engine/gcode'

const exec = promisify(execFile)
const ps = (script: string): Promise<{ stdout: string }> =>
  exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 })

let hint = ''
export function setVolumeHint(h: string): void {
  hint = h
}

function hasGcode(root: string): boolean {
  try {
    return readdirSync(root).some((f) => /\.gcode$/i.test(f))
  } catch {
    return false
  }
}

export async function listDrives(): Promise<Drive[]> {
  if (process.platform === 'win32') {
    const { stdout } = await ps(
      "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | Select-Object DeviceID,VolumeName,Size,FreeSpace,FileSystem | ConvertTo-Json -Compress"
    )
    const raw = stdout.trim()
    if (!raw) return []
    const rows = ([] as { DeviceID: string; VolumeName: string | null; Size: number | null; FreeSpace: number | null; FileSystem: string | null }[]).concat(JSON.parse(raw))
    return rows
      .filter((r) => r.Size) // empty card readers report no size
      .map((r) => {
        const root = `${r.DeviceID}\\`
        const fat = /^FAT/i.test(r.FileSystem ?? '')
        const label = r.VolumeName ?? ''
        return {
          root,
          label,
          sizeBytes: r.Size ?? 0,
          freeBytes: r.FreeSpace ?? 0,
          likelyPrinterCard: fat && ((!!hint && label === hint) || hasGcode(root) || (r.Size ?? 0) <= 64 * 2 ** 30)
        }
      })
  }
  if (process.platform === 'darwin') {
    const vols = readdirSync('/Volumes').filter((v) => v !== 'Macintosh HD')
    return vols.map((v) => {
      const root = join('/Volumes', v)
      return { root, label: v, sizeBytes: 0, freeBytes: 0, likelyPrinterCard: hasGcode(root) || (!!hint && v === hint) }
    })
  }
  return []
}

/** Copies the G-code to the card root under a clean, unused name and checks the size landed. */
export function saveToDrive(gcodePath: string, driveRoot: string, fileName: string): string {
  if (!existsSync(driveRoot)) throw new Error('The SD card is no longer connected.')
  const name = dedupeName(safeFileName(fileName), (n) => existsSync(join(driveRoot, n)))
  const target = join(driveRoot, name)
  copyFileSync(gcodePath, target)
  const want = statSync(gcodePath).size
  const got = statSync(target).size
  if (want !== got) throw new Error(`The copy on the card is incomplete (${got} of ${want} bytes). Try again or use another card.`)
  return target
}

export async function ejectDrive(driveRoot: string): Promise<{ ok: boolean; message?: string }> {
  if (process.platform === 'win32') {
    const letter = driveRoot.replace(/\\$/, '')
    try {
      await ps(`(New-Object -ComObject Shell.Application).Namespace(17).ParseName('${letter}').InvokeVerb('Eject')`)
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
    for (let i = 0; i < 20; i++) {
      if (!existsSync(driveRoot)) return { ok: true }
      await new Promise((r) => setTimeout(r, 250))
    }
    return { ok: false, message: 'Windows did not release the card. Close any window showing its files and try again.' }
  }
  if (process.platform === 'darwin') {
    try {
      await exec('diskutil', ['eject', driveRoot])
      return { ok: true }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }
  return { ok: false, message: 'Eject is not supported on this system.' }
}

/** Calls `onChange` when a drive letter appears or disappears. */
export function watchDrives(onChange: () => void): () => void {
  if (process.platform !== 'win32') return () => {}
  const letters = (): string => {
    let s = ''
    for (let c = 68; c <= 90; c++) if (existsSync(`${String.fromCharCode(c)}:\\`)) s += String.fromCharCode(c)
    return s
  }
  let last = letters()
  const t = setInterval(() => {
    const now = letters()
    if (now !== last) {
      last = now
      onChange()
    }
  }, 2000)
  return () => clearInterval(t)
}
