// Real-engine tests: run the OrcaSlicer CLI exactly as the app does.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_START_GCODE, MACHINE } from '@shared/machine'
import { applyStrength, defaultPrintSettings } from '@shared/settings'
import type { Filament, MachineSettings, ScenePayload } from '@shared/types'
import { initEngineDir, engine } from '../src/main/engine/paths'
import { slice } from '../src/main/engine/slice'
import { initStore } from '../src/main/store'

const cube = (s: number): Float32Array => {
  const v = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]]
  const t = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
  return new Float32Array(t.flatMap((tri) => tri.flatMap((i) => v[i])))
}
const translate = (x: number, y: number, z = 0): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]

const filament: Filament = {
  id: 'pla', name: 'Test PLA', brand: 'Generic', material: 'PLA', color: '#ffffff', nozzleTemp: 205, nozzleTempFirstLayer: 210,
  bedTemp: 60, bedTempFirstLayer: 65, flowRatio: 0.98, maxVolumetricSpeed: 15, fanMin: 100, fanMax: 100, density: 1.24, diameter: 1.75, pricePerKg: 80, notes: ''
}
const machine: MachineSettings = { nozzle: '0.4', startGcode: DEFAULT_START_GCODE, endGcode: 'M84', firmwareModified: false, limits: { ...MACHINE.limits }, timeFactor: 1.1 }

/** extrusion moves at one Z height -> bounding box */
function boxAt(gcode: string, z: number): { x0: number; x1: number; y0: number; y1: number } {
  let cz = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
  for (const l of gcode.split('\n')) {
    const zz = l.match(/^;Z:([\d.]+)/)
    if (zz) cz = +zz[1]
    const m = l.match(/^G1 .*X([\d.]+) Y([\d.]+).*E[\d.]/)
    if (m && Math.abs(cz - z) < 0.11) {
      x0 = Math.min(x0, +m[1]); x1 = Math.max(x1, +m[1]); y0 = Math.min(y0, +m[2]); y1 = Math.max(y1, +m[2])
    }
  }
  return { x0, x1, y0, y1 }
}

describe('engine', () => {
  beforeAll(() => {
    initStore(mkdtempSync(join(tmpdir(), 'ffprint-')))
    initEngineDir(process.cwd(), '', false)
    if (!engine.present) throw new Error('engine missing — run pnpm fetch-engine')
  })

  it('slices a placed cube where it was placed, with our header, start code and filament', async () => {
    const scene: ScenePayload = { meshes: [{ id: 'c', name: 'cube', positions: cube(20) }], instances: [{ meshId: 'c', name: 'cube', matrix: translate(30, 40) }] }
    const r = await slice({ scene, settings: defaultPrintSettings(), filamentId: 'pla', jobName: 'Test cube (v2)' }, filament, machine)
    const g = readFileSync(r.gcodePath, 'utf8')
    expect(g.split('\n').slice(0, 4)).toEqual([';FLAVOR:Marlin', expect.stringMatching(/^;TIME:\d/), expect.stringMatching(/^;Filament used:/), ';Layer height:0.2'])
    expect(g).toContain('M82 ; absolute extrusion for the purge line')
    expect(g).toMatch(/^M104 S210/m)
    expect(g).toMatch(/^M190 S65/m)
    expect(g).not.toMatch(/^M8015|^G29/m)
    const b = boxAt(g, 10)
    expect(b.x0).toBeGreaterThan(29.9); expect(b.x1).toBeLessThan(50.1)
    expect(b.y0).toBeGreaterThan(39.9); expect(b.y1).toBeLessThan(60.1)
    expect(r.fileName).toBe('Test_cube_v2.gcode')
    expect(r.stats.layers).toBe(100)
    expect(r.stats.filamentG).toBeGreaterThan(1)
    expect(r.stats.seconds).toBe(Math.round(r.stats.estimateSeconds * 1.1))
    expect(r.stats.cost).toBeCloseTo((r.stats.filamentG / 1000) * 80, 1)
  })

  it('applies strength, supports and brim settings', async () => {
    const s = { ...applyStrength(defaultPrintSettings(), 'strong'), adhesion: 'brim' as const, supports: 'tree' as const }
    const scene: ScenePayload = { meshes: [{ id: 'c', name: 'cube', positions: cube(15) }], instances: [{ meshId: 'c', name: 'a', matrix: translate(100, 100) }] }
    const r = await slice({ scene, settings: s, filamentId: 'pla', jobName: 'strong' }, filament, machine)
    const g = readFileSync(r.gcodePath, 'utf8')
    expect(g).toMatch(/^; wall_loops = 4$/m)
    expect(g).toMatch(/^; sparse_infill_density = 35%$/m)
    expect(g).toMatch(/^; sparse_infill_pattern = gyroid$/m)
    expect(g).toMatch(/^; brim_type = outer_only$/m)
    expect(g).toMatch(/^; enable_support = 1$/m)
    expect(g).toMatch(/^; support_type = tree\(auto\)$/m)
  })

  it('clamps advanced overrides to firmware limits', async () => {
    const s = { ...defaultPrintSettings(), overrides: { outer_wall_acceleration: '9000', travel_speed: '600', fuzzy_skin: 'external' } }
    const scene: ScenePayload = { meshes: [{ id: 'c', name: 'cube', positions: cube(10) }], instances: [{ meshId: 'c', name: 'a', matrix: translate(100, 100) }] }
    const r = await slice({ scene, settings: s, filamentId: 'pla', jobName: 'x' }, filament, machine)
    const g = readFileSync(r.gcodePath, 'utf8')
    expect(g).toMatch(/^; outer_wall_acceleration = 2500$/m)
    expect(g).toMatch(/^; travel_speed = 250$/m)
    expect(g).toMatch(/^; fuzzy_skin = external$/m)
  })

  it('reports an object off the bed as a readable error', async () => {
    const scene: ScenePayload = { meshes: [{ id: 'c', name: 'cube', positions: cube(20) }], instances: [{ meshId: 'c', name: 'a', matrix: translate(210, 100) }] }
    await expect(slice({ scene, settings: defaultPrintSettings(), filamentId: 'pla', jobName: 'x' }, filament, machine)).rejects.toThrow(/bed|object/i)
  })
})
