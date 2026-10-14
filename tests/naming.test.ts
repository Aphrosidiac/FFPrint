// Printer-friendly file names: ASCII only, no .bin, de-duplicated on the card.
import { describe, expect, it } from 'vitest'
import { applyPattern, dedupeName, parseDuration, safeFileName } from '../src/main/engine/gcode'

describe('safeFileName', () => {
  it('keeps letters, digits, dash and underscore', () => {
    expect(safeFileName('Test cube (v2)')).toBe('Test_cube_v2.gcode')
    expect(safeFileName('Café déjà-vu')).toBe('Cafe_deja-vu.gcode')
    expect(safeFileName('bracket.stl')).toBe('bracket.gcode')
    expect(safeFileName('bracket.gcode')).toBe('bracket.gcode')
  })
  it('never produces a firmware .bin and never an empty name', () => {
    expect(safeFileName('firmware.bin')).toBe('firmware.gcode')
    expect(safeFileName('???')).toBe('print.gcode')
    expect(safeFileName('')).toBe('print.gcode')
  })
  it('caps the stem at 48 characters', () => {
    expect(safeFileName('a'.repeat(80))).toBe(`${'a'.repeat(48)}.gcode`)
  })
})

describe('dedupeName', () => {
  it('appends _2, _3 ... until free', () => {
    const taken = new Set(['cube.gcode', 'cube_2.gcode'])
    expect(dedupeName('cube.gcode', (n) => taken.has(n))).toBe('cube_3.gcode')
    expect(dedupeName('free.gcode', (n) => taken.has(n))).toBe('free.gcode')
  })
})

describe('applyPattern / parseDuration', () => {
  it('fills the pattern', () => {
    expect(applyPattern('{name}_{quality}_{material}', { name: 'cube', quality: 'fine', material: 'PLA' })).toBe('cube_fine_PLA')
    expect(applyPattern('{name}_{nope}', { name: 'x' })).toBe('x_')
  })
  it('reads Orca durations', () => {
    expect(parseDuration('1d 2h 3m 4s')).toBe(86400 + 7200 + 180 + 4)
    expect(parseDuration('16m 9s')).toBe(969)
  })
})
