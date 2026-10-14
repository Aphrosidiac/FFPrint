// SD card detection and writing. Never touches a real drive: saves go to a temp folder.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyDrive, saveToDrive, toDrives, type DriveRow } from '../src/main/sd'

const GB = 2 ** 30
// What this Windows box reported on 2026-10-14: a Rufus-made Windows installer stick (UEFI helper
// partition + NTFS data partition) and an empty card reader.
const box: DriveRow[] = [
  { DeviceID: 'E:', VolumeName: 'UEFI_NTFS', Size: 1028096, FreeSpace: 133120, FileSystem: 'FAT', Partitions: 2, Model: 'Kingston DataTraveler 3.0 USB Device' },
  { DeviceID: 'F:', VolumeName: 'CCCOMA_X64FRE_EN-GB_DV9', Size: 61989638144, FreeSpace: 51217915904, FileSystem: 'NTFS', Partitions: 2, Model: 'Kingston DataTraveler 3.0 USB Device' },
  { DeviceID: 'G:', VolumeName: null, Size: null, FreeSpace: null, FileSystem: null, Partitions: 0, Model: '' }
]
const card: DriveRow = { DeviceID: 'H:', VolumeName: '', Size: 7.4 * GB, FreeSpace: 7 * GB, FileSystem: 'FAT32', Partitions: 1, Model: 'Generic- SD/MMC USB Device' }

describe('drive detection', () => {
  it('flags nothing on the installer stick and hides its helper partition and the empty reader', () => {
    const drives = toDrives(box, '', () => false)
    expect(drives.map((d) => d.root)).toEqual(['F:\\'])
    expect(drives[0].likelyPrinterCard).toBe(false)
  })
  it('flags a FAT32 card of SD size, sorted first', () => {
    const drives = toDrives([...box, card], '', () => false)
    expect(drives[0]).toMatchObject({ root: 'H:\\', likelyPrinterCard: true })
  })
  it('needs FAT: exFAT and NTFS cards are listed but not flagged', () => {
    expect(classifyDrive({ ...card, FileSystem: 'exFAT' }, '', false)).toBe(false)
    expect(classifyDrive({ ...card, FileSystem: 'NTFS' }, '', true)).toBe(false)
  })
  it('a big or multi-partition FAT volume needs G-code on it or the remembered label', () => {
    const big = { ...card, Size: 128 * GB, VolumeName: 'PRINTER' }
    expect(classifyDrive(big, '', false)).toBe(false)
    expect(classifyDrive(big, 'PRINTER', false)).toBe(true)
    expect(classifyDrive(big, '', true)).toBe(true)
    expect(classifyDrive({ ...card, Partitions: 2 }, '', false)).toBe(false)
  })
  it('never flags boot helper partitions', () => {
    expect(classifyDrive({ ...card, VolumeName: 'EFI' }, '', true)).toBe(false)
  })
})

describe('saveToDrive', () => {
  it('writes a clean, de-duplicated name and verifies the copy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffprint-card-'))
    const src = join(mkdtempSync(join(tmpdir(), 'ffprint-src-')), 'plate_1.gcode')
    const body = ';FLAVOR:Marlin\n' + 'G1 X1 Y1 E0.1\n'.repeat(20000)
    writeFileSync(src, body)
    const a = saveToDrive(src, dir, 'Test cube (v2)')
    expect(a).toBe(join(dir, 'Test_cube_v2.gcode'))
    expect(readFileSync(a, 'utf8')).toBe(body)
    const b = saveToDrive(src, dir, 'Test cube (v2).gcode')
    expect(b).toBe(join(dir, 'Test_cube_v2_2.gcode'))
  })
  it('reports a missing card', () => {
    expect(() => saveToDrive('x', join(tmpdir(), 'ffprint-no-such-card-xyz'), 'a')).toThrow(/no longer connected/)
  })
})
