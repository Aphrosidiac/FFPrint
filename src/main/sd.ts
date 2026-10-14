// Removable drives (the printer's SD card), writing G-code to them, and ejecting.
// Windows: drive letters are probed cheaply every 2 s; the detailed CIM query only runs when the set of
// letters changes. macOS: /Volumes.

import { execFile } from 'node:child_process'
import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
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

export interface DriveRow {
  DeviceID: string
  VolumeName: string | null
  Size: number | null
  FreeSpace: number | null
  FileSystem: string | null
  /** partitions on the physical disk (0 = unknown) */
  Partitions?: number | null
  Model?: string | null
}

const MB = 2 ** 20
const GB = 2 ** 30
/** Boot/helper partitions that USB installers (Rufus, Ventoy, Windows media) leave on sticks. */
const HELPER_LABEL = /^(UEFI_NTFS|EFI|ESP|SYSTEM|BOOT|RECOVERY|VTOYEFI|WINPE)$/i

/**
 * The printer reads FAT32 cards (stock firmware: no exFAT, no NTFS). A volume is a likely printer card
 * when it is FAT, big enough to be a real card (the 1 MB UEFI helper partition on a USB stick is not),
 * not a boot helper, and either already holds G-code / carries the remembered label, or is the only
 * partition on a disk of SD-card size. USB sticks prepared as installers have several partitions.
 */
export function classifyDrive(r: DriveRow, hint: string, hasGcodeFiles: boolean): boolean {
  const size = r.Size ?? 0
  const fat = /^FAT(32)?$/i.test(r.FileSystem ?? '')
  const label = r.VolumeName ?? ''
  if (!fat || size < 64 * MB || HELPER_LABEL.test(label)) return false
  if ((!!hint && label === hint) || hasGcodeFiles) return true
  const parts = r.Partitions ?? 0
  return size <= 64 * GB && parts <= 1
}

/** Volumes worth showing: removable, with media, and not a tiny helper partition. */
export function toDrives(rows: DriveRow[], hint: string, hasGcodeFiles: (root: string) => boolean): Drive[] {
  return rows
    .filter((r) => (r.Size ?? 0) >= 64 * MB) // empty readers report no size; helper partitions are tiny
    .map((r) => {
      const root = `${r.DeviceID}\\`
      return {
        root,
        label: r.VolumeName ?? '',
        sizeBytes: r.Size ?? 0,
        freeBytes: r.FreeSpace ?? 0,
        likelyPrinterCard: classifyDrive(r, hint, /^FAT/i.test(r.FileSystem ?? '') && hasGcodeFiles(root))
      }
    })
    .sort((a, b) => Number(b.likelyPrinterCard) - Number(a.likelyPrinterCard) || a.root.localeCompare(b.root))
}

// One CIM round trip: each removable volume with its physical disk's partition count and model.
const LIST_SCRIPT = [
  "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | ForEach-Object {",
  '$p = Get-CimAssociatedInstance -InputObject $_ -ResultClassName Win32_DiskPartition -ErrorAction SilentlyContinue | Select-Object -First 1;',
  '$d = if ($p) { Get-CimAssociatedInstance -InputObject $p -ResultClassName Win32_DiskDrive -ErrorAction SilentlyContinue | Select-Object -First 1 };',
  '[pscustomobject]@{ DeviceID = $_.DeviceID; VolumeName = $_.VolumeName; Size = $_.Size; FreeSpace = $_.FreeSpace; FileSystem = $_.FileSystem;',
  'Partitions = $(if ($d) { $d.Partitions } else { 0 }); Model = $(if ($d) { $d.Model } else { "" }) } } | ConvertTo-Json -Compress'
].join(' ')

export async function listDrives(): Promise<Drive[]> {
  if (process.platform === 'win32') {
    const { stdout } = await ps(LIST_SCRIPT)
    const raw = stdout.trim()
    if (!raw) return []
    const rows = ([] as DriveRow[]).concat(JSON.parse(raw))
    return toDrives(rows, hint, hasGcode)
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

/**
 * Copies the G-code to the card root under a clean, unused name, flushes it to the card (so pulling
 * the card after "Saved" is safe even without Eject) and checks the copy matches: same size and same
 * bytes at the start and end.
 */
export function saveToDrive(gcodePath: string, driveRoot: string, fileName: string): string {
  if (!existsSync(driveRoot)) throw new Error('The SD card is no longer connected.')
  const name = dedupeName(safeFileName(fileName), (n) => existsSync(join(driveRoot, n)))
  const target = join(driveRoot, name)
  const want = statSync(gcodePath).size
  try {
    copyFileSync(gcodePath, target)
    const fd = openSync(target, 'r+')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOSPC') throw new Error('The SD card is full. Delete old files from it and try again.')
    if (code === 'EROFS' || code === 'EPERM' || code === 'EACCES') throw new Error('The SD card is write-protected. Check the lock switch on the card or adapter.')
    throw new Error(`Could not write to the SD card: ${(e as Error).message}`)
  }
  const got = statSync(target).size
  if (want !== got) throw new Error(`The copy on the card is incomplete (${got} of ${want} bytes). Try again or use another card.`)
  if (!sameEnds(gcodePath, target, want)) throw new Error('The copy on the card does not match the sliced file. Try again or use another card.')
  return target
}

function sameEnds(a: string, b: string, size: number): boolean {
  const n = Math.min(size, 64 * 1024)
  const read = (path: string, pos: number): Buffer => {
    const fd = openSync(path, 'r')
    try {
      const buf = Buffer.alloc(n)
      readSync(fd, buf, 0, n, pos)
      return buf
    } finally {
      closeSync(fd)
    }
  }
  return read(a, 0).equals(read(b, 0)) && read(a, size - n).equals(read(b, size - n))
}

export async function ejectDrive(driveRoot: string): Promise<{ ok: boolean; message?: string }> {
  if (process.platform === 'win32') {
    const letter = driveRoot.replace(/\\$/, '')
    try {
      if (!/^[A-Z]:$/i.test(letter)) return { ok: false, message: 'That is not a drive letter.' }
      if (!existsSync(driveRoot)) return { ok: true }
      await ps(
        `$i = (New-Object -ComObject Shell.Application).Namespace(17).ParseName('${letter}'); if (-not $i) { throw 'Drive not found' }; $i.InvokeVerb('Eject')`
      )
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
