// The preview's G-code parser: layers, feature types, extrusion vs travel, E modes, arcs, timing.
import { describe, expect, it } from 'vitest'
import { parseGcode, SEG_STRIDE, transferables } from '../src/renderer/src/preview/gcodeParse'

const sample = `;FLAVOR:Marlin
;TIME:100
;TYPE:Custom
G90
M82
G92 E0
G1 X-2 Y20 Z0.28 F5000
G1 X-2 Y145 Z0.28 F1500 E15 ; purge
G92 E0
M83
;LAYER_CHANGE
;Z:0.2
;HEIGHT:0.2
G1 X10 Y10 F9000
G1 Z0.2
;TYPE:Outer wall
;WIDTH:0.42
G1 F1200
G1 X20 Y10 E0.5
G1 X20 Y20 E0.5
;WIPE_START
G1 X15 Y20 E-0.3
;WIPE_END
;TYPE:Sparse infill
;WIDTH:0.45
G1 X10 Y20 E0.4
;LAYER_CHANGE
;Z:0.4
;HEIGHT:0.2
G1 Z0.4
;TYPE:Outer wall
G1 X10 Y10 E0.5
G2 X20 Y10 I5 J0 E0.8
;TYPE:Top surface
G1 X10 Y10 E0.4
`

describe('parseGcode', () => {
  const p = parseGcode(sample)

  it('counts layers with their Z and height', () => {
    expect(p.layers.map((l) => l.z)).toEqual([0.2, 0.4])
    expect(p.layers.every((l) => l.height === 0.2)).toBe(true)
  })

  it('groups extrusions by feature type in file order', () => {
    expect(p.features.map((f) => f.type)).toEqual(['Custom', 'Outer wall', 'Sparse infill', 'Top surface'])
    const wall = p.features.find((f) => f.type === 'Outer wall')!
    // 2 straight on layer 0, then 1 straight + the arc pieces on layer 1
    expect(wall.layerEnd[0]).toBe(2)
    expect(wall.count).toBeGreaterThan(3)
    expect(wall.layerEnd[1]).toBe(wall.count)
    // ;WIDTH: is modal: the layer-1 wall inherits the infill's 0.45
    expect(wall.width).toBeGreaterThan(0.42)
    expect(wall.width).toBeLessThan(0.45)
    // first segment: (10,10,0.2) -> (20,10,0.2), layer 0, height 0.2
    expect(Array.from(wall.segments.slice(0, SEG_STRIDE)).map((v) => +v.toFixed(3))).toEqual([10, 10, 0.2, 0, 20, 10, 0.2, 0.2])
  })

  it('treats the absolute-E purge as extrusion and wipes (negative E) as travel', () => {
    const purge = p.features.find((f) => f.type === 'Custom')!
    expect(purge.count).toBe(1)
    expect(purge.filament).toBeCloseTo(15)
    const t = Array.from(p.travel.positions)
    let found = false
    for (let i = 0; i < t.length; i += 6) if (t[i] === 20 && t[i + 1] === 20 && t[i + 3] === 15) found = true
    expect(found).toBe(true)
  })

  it('flattens G2 arcs into pieces that stay on the circle', () => {
    const wall = p.features.find((f) => f.type === 'Outer wall')!
    const s = wall.segments
    for (let i = 3; i < wall.count; i++) {
      const x = s[i * SEG_STRIDE + 4]
      const y = s[i * SEG_STRIDE + 5]
      expect(Math.hypot(x - 15, y - 10)).toBeCloseTo(5, 3)
    }
    // clockwise from (10,10) around (15,10): the arc goes through +Y first
    expect(s[3 * SEG_STRIDE + 5]).toBeGreaterThan(10)
  })

  it('keeps the start block out of the part bounds', () => {
    expect(p.bounds!.min[0]).toBeGreaterThanOrEqual(10)
    expect(p.bounds!.max[2]).toBeCloseTo(0.4)
  })

  it('scales move times to the header estimate', () => {
    expect(p.estimateSeconds).toBe(100)
    const layerSum = p.layers.reduce((s, l) => s + l.time, 0)
    expect(layerSum).toBeGreaterThan(0)
    expect(layerSum).toBeLessThanOrEqual(100.001)
    expect(p.features.reduce((s, f) => s + f.time, 0)).toBeLessThanOrEqual(100.001)
  })

  it('lists every buffer for transfer', () => {
    expect(transferables(p).length).toBe(p.features.length * 2 + 3)
  })

  it('copes with G91 relative moves and an empty file', () => {
    const r = parseGcode('M83\nG91\n;LAYER_CHANGE\n;Z:0.2\n;HEIGHT:0.2\n;TYPE:Outer wall\nG1 X5 Y0 E0.2\nG1 X0 Y5 E0.2\n')
    const s = r.features[0].segments
    expect([s[4], s[5]]).toEqual([5, 0])
    expect([s[12], s[13]]).toEqual([5, 5])
    const empty = parseGcode('')
    expect(empty.features).toEqual([])
    expect(empty.layers.length).toBe(1)
  })
})
