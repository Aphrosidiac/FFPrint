// One-off import: Creality Print 7.3's Ender-3 V3 SE filament presets -> src/shared/filament-seeds.json.
// Resolves each preset's inheritance chain and keeps the values FF Print's Filament model uses.
// Run: node scripts/import-creality-filaments.mjs ["C:/Program Files/Creality/Creality Print 7.3"]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? 'C:/Program Files/Creality/Creality Print 7.3'
const dir = join(root, 'resources/profiles/Creality/filament')
const byName = new Map()
for (const f of readdirSync(dir, { recursive: true })) {
  if (!String(f).endsWith('.json')) continue
  try {
    const j = JSON.parse(readFileSync(join(dir, String(f)), 'utf8'))
    if (j.name) byName.set(j.name, j)
  } catch {}
}
const resolve = (name) => {
  const j = byName.get(name)
  if (!j) return {}
  return { ...(j.inherits ? resolve(j.inherits) : {}), ...j }
}
const first = (v, d) => {
  const n = parseFloat(Array.isArray(v) ? v[0] : v)
  return Number.isFinite(n) ? n : d
}
const str = (v) => (Array.isArray(v) ? v[0] : v) ?? ''
const material = (type, name) => {
  const t = String(type).toUpperCase()
  if (/HYPER PLA|HIGH SPEED|FAST/i.test(name) && t === 'PLA') return 'PLA-HS'
  if (['PLA', 'PETG', 'TPU', 'ABS', 'ASA'].includes(t)) return t
  if (t.startsWith('PLA')) return 'PLA'
  if (t.startsWith('PET')) return 'PETG'
  return 'PLA'
}
const COLORS = { 'Hyper PLA': '#2B2B2E', 'CR-PLA': '#F2F2F0', 'Generic PETG': '#2F6FDB', 'Generic TPU': '#E0533D', 'Soleyin Ultra PLA': '#C9CDD2', 'Soleyin Basic PETG': '#4A7C59', 'Hyper Marble': '#B8B3AA', 'Hyper Stardust': '#3B3F5C', 'Hyper Luminous': '#C8E86B', 'Hyper L-W PLA': '#E9E4DA' }

const seeds = []
for (const [name] of byName) {
  const m = name.match(/^(.+) @Creality Ender-3 V3 SE 0\.4 nozzle$/)
  if (!m) continue
  const p = resolve(name)
  const label = m[1]
  const nozzle = Math.min(first(p.nozzle_temperature, 220), 260)
  const bed = Math.min(first(p.hot_plate_temp ?? p.textured_plate_temp ?? p.cool_plate_temp, 60), 100)
  seeds.push({
    name: label,
    brand: label.startsWith('Soleyin') ? 'Soleyin' : label.startsWith('Generic') ? 'Generic' : 'Creality',
    material: material(str(p.filament_type), label),
    color: COLORS[label] ?? '#9CA3AF',
    nozzleTemp: nozzle,
    nozzleTempFirstLayer: Math.min(first(p.nozzle_temperature_initial_layer, nozzle), 260),
    bedTemp: bed,
    bedTempFirstLayer: Math.min(first(p.hot_plate_temp_initial_layer ?? p.textured_plate_temp_initial_layer ?? p.cool_plate_temp_initial_layer, bed), 100),
    flowRatio: first(p.filament_flow_ratio, 0.98),
    maxVolumetricSpeed: first(p.filament_max_volumetric_speed, 12),
    fanMin: first(p.fan_min_speed, 100),
    fanMax: first(p.fan_max_speed, 100),
    density: first(p.filament_density, 1.24),
    diameter: first(p.filament_diameter, 1.75),
    pricePerKg: 75,
    notes: `From Creality Print 7.3 preset "${name}".`,
    source: { preset: name, filament_type: str(p.filament_type), pressure_advance: str(p.pressure_advance), filament_cost: str(p.filament_cost) }
  })
}
const order = ['Hyper PLA', 'CR-PLA', 'Soleyin Ultra PLA', 'Generic PETG', 'Soleyin Basic PETG', 'Generic TPU']
seeds.sort((a, b) => ((order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99)) || a.name.localeCompare(b.name))
writeFileSync('src/shared/filament-seeds.json', JSON.stringify(seeds, null, 2) + '\n')
console.table(seeds.map((s) => ({ name: s.name, mat: s.material, noz: `${s.nozzleTempFirstLayer}/${s.nozzleTemp}`, bed: `${s.bedTempFirstLayer}/${s.bedTemp}`, flow: s.flowRatio, mvs: s.maxVolumetricSpeed, fan: `${s.fanMin}-${s.fanMax}`, dens: s.density })))
