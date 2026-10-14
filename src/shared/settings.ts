// FF Print's settings model: a few decisions on the main panel, a curated catalogue behind
// "More settings", and the mapping of both onto OrcaSlicer's config keys. Pure — used by the
// renderer (display) and main (resolving the configs handed to the engine).

import { MACHINE, type MachineLimits, type Nozzle } from './machine'
import type { AdhesionType, Filament, Material, MachineSettings, PrintSettings, QualityId, StrengthId, SupportMode } from './types'

// ---------------------------------------------------------------- main-panel presets

export const QUALITIES: { id: QualityId; label: string; layerHeight: number; hint: string; orcaName: string }[] = [
  { id: 'draft', label: 'Draft', layerHeight: 0.24, hint: 'Fastest. Visible layers.', orcaName: '0.24mm Draft' },
  { id: 'standard', label: 'Standard', layerHeight: 0.2, hint: 'Balanced speed and finish.', orcaName: '0.20mm Standard' },
  { id: 'optimal', label: 'Optimal', layerHeight: 0.16, hint: 'Smoother curves, slower.', orcaName: '0.16mm Optimal' },
  { id: 'fine', label: 'Fine', layerHeight: 0.12, hint: 'Finest detail, slowest.', orcaName: '0.12mm Fine' }
]

/** Orca's system process preset this quality starts from, e.g. "0.20mm Standard @Creality Ender3V3SE 0.4". */
export function baseProcessName(quality: QualityId, nozzle: Nozzle): string {
  const q = QUALITIES.find((x) => x.id === quality) ?? QUALITIES[1]
  return `${q.orcaName} @Creality Ender3V3SE ${nozzle}`
}

export const BASE_MACHINE = (nozzle: Nozzle): string => `Creality Ender-3 V3 SE ${nozzle} nozzle`

export const STRENGTHS: { id: StrengthId; label: string; hint: string; walls: number; topLayers: number; bottomLayers: number; infill: number; infillPattern: string }[] = [
  { id: 'light', label: 'Light', hint: 'Display pieces. Saves time and filament.', walls: 2, topLayers: 4, bottomLayers: 3, infill: 10, infillPattern: 'grid' },
  { id: 'standard', label: 'Standard', hint: 'Everyday parts.', walls: 2, topLayers: 4, bottomLayers: 4, infill: 15, infillPattern: 'crosshatch' },
  { id: 'strong', label: 'Strong', hint: 'Functional parts that take load.', walls: 4, topLayers: 5, bottomLayers: 5, infill: 35, infillPattern: 'gyroid' },
  { id: 'solid', label: 'Solid', hint: 'Fully solid. Heavy and slow.', walls: 4, topLayers: 6, bottomLayers: 6, infill: 100, infillPattern: 'rectilinear' }
]

export const SUPPORT_MODES: { id: SupportMode; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'No supports.' },
  { id: 'tree', label: 'Tree', hint: 'Branches that touch the model only where needed. Easy to remove.' },
  { id: 'grid', label: 'Grid', hint: 'Classic support under every overhang. Strongest, more cleanup.' }
]

export const ADHESION_TYPES: { id: AdhesionType; label: string; hint: string }[] = [
  { id: 'skirt', label: 'Skirt', hint: 'One outline around the print to prime the nozzle.' },
  { id: 'brim', label: 'Brim', hint: 'Extra lines attached to the first layer. For small or tall parts that might lift.' },
  { id: 'none', label: 'None', hint: 'Straight to the part.' }
]

export const INFILL_PATTERNS: { value: string; label: string }[] = [
  { value: 'crosshatch', label: 'Crosshatch' },
  { value: 'grid', label: 'Grid' },
  { value: 'gyroid', label: 'Gyroid' },
  { value: 'cubic', label: 'Cubic' },
  { value: 'adaptivecubic', label: 'Adaptive cubic' },
  { value: 'triangles', label: 'Triangles' },
  { value: 'honeycomb', label: 'Honeycomb' },
  { value: 'rectilinear', label: 'Rectilinear' },
  { value: 'line', label: 'Line' },
  { value: 'lightning', label: 'Lightning' },
  { value: 'zig-zag', label: 'Zig-zag' }
]

export function defaultPrintSettings(): PrintSettings {
  const s = STRENGTHS[1]
  return {
    quality: 'standard',
    strength: 'standard',
    walls: s.walls,
    topLayers: s.topLayers,
    bottomLayers: s.bottomLayers,
    infill: s.infill,
    infillPattern: s.infillPattern,
    supports: 'off',
    supportBuildPlateOnly: true,
    supportAngle: 45,
    adhesion: 'skirt',
    brimWidth: 5,
    overrides: {}
  }
}

/** Apply a strength preset's numbers (inline edits are replaced). */
export function applyStrength(s: PrintSettings, id: StrengthId): PrintSettings {
  const p = STRENGTHS.find((x) => x.id === id) ?? STRENGTHS[1]
  return { ...s, strength: id, walls: p.walls, topLayers: p.topLayers, bottomLayers: p.bottomLayers, infill: p.infill, infillPattern: p.infillPattern }
}

/** True when the inline numbers no longer match the selected strength preset. */
export function strengthEdited(s: PrintSettings): boolean {
  const p = STRENGTHS.find((x) => x.id === s.strength)
  if (!p) return true
  return p.walls !== s.walls || p.topLayers !== s.topLayers || p.bottomLayers !== s.bottomLayers || p.infill !== s.infill || p.infillPattern !== s.infillPattern
}

// ---------------------------------------------------------------- "More settings" catalogue

export type Target = 'process' | 'filament' | 'machine'

export interface SettingDef {
  key: string
  target: Target
  group: string
  label: string
  help: string
  kind: 'number' | 'percent' | 'bool' | 'enum'
  unit?: string
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  /** Clamp a number to a machine/firmware limit at resolve time */
  limit?: (l: MachineLimits) => number
}

const accel = (l: MachineLimits): number => l.accelExtruding
const travelAccel = (l: MachineLimits): number => l.accelTravel
const xySpeed = (l: MachineLimits): number => Math.min(l.speedX, l.speedY)

export const GROUPS = ['Layers & walls', 'Infill', 'Speed', 'Acceleration', 'Retraction', 'Cooling', 'Supports', 'Adhesion', 'Special'] as const

export const CATALOGUE: SettingDef[] = [
  // Layers & walls
  { key: 'initial_layer_print_height', target: 'process', group: 'Layers & walls', label: 'First layer height', help: 'Thicker first layers stick better and hide small bed unevenness.', kind: 'number', unit: 'mm', min: 0.1, max: 0.4, step: 0.02 },
  { key: 'wall_generator', target: 'process', group: 'Layers & walls', label: 'Wall generator', help: 'Arachne varies line width to fill thin features; Classic keeps every line the same width.', kind: 'enum', options: [{ value: 'arachne', label: 'Arachne' }, { value: 'classic', label: 'Classic' }] },
  { key: 'wall_sequence', target: 'process', group: 'Layers & walls', label: 'Wall order', help: 'Inner first gives cleaner outer surfaces; outer first gives more accurate dimensions.', kind: 'enum', options: [{ value: 'inner wall/outer wall', label: 'Inner, then outer' }, { value: 'outer wall/inner wall', label: 'Outer, then inner' }, { value: 'inner-outer-inner wall', label: 'Inner, outer, inner' }] },
  { key: 'seam_position', target: 'process', group: 'Layers & walls', label: 'Seam position', help: 'Where each layer starts and ends its outer wall.', kind: 'enum', options: [{ value: 'aligned', label: 'Aligned' }, { value: 'nearest', label: 'Nearest' }, { value: 'back', label: 'Back' }, { value: 'random', label: 'Random' }] },
  { key: 'only_one_wall_top', target: 'process', group: 'Layers & walls', label: 'Single wall on top surfaces', help: 'Leaves more room for top infill so flat tops look smoother.', kind: 'bool' },
  { key: 'detect_thin_wall', target: 'process', group: 'Layers & walls', label: 'Detect thin walls', help: 'Prints walls too thin for two lines as a single line instead of skipping them.', kind: 'bool' },
  { key: 'elefant_foot_compensation', target: 'process', group: 'Layers & walls', label: "Elephant's foot compensation", help: 'Shrinks the first layer to cancel the squish that makes the base flare out.', kind: 'number', unit: 'mm', min: 0, max: 1, step: 0.05 },
  { key: 'xy_hole_compensation', target: 'process', group: 'Layers & walls', label: 'Hole size compensation', help: 'Grows holes by this much. Holes usually print slightly small.', kind: 'number', unit: 'mm', min: -1, max: 1, step: 0.05 },
  { key: 'xy_contour_compensation', target: 'process', group: 'Layers & walls', label: 'Outer size compensation', help: 'Grows or shrinks outer contours by this much.', kind: 'number', unit: 'mm', min: -1, max: 1, step: 0.05 },

  // Infill
  { key: 'top_surface_pattern', target: 'process', group: 'Infill', label: 'Top surface pattern', help: 'Pattern of the visible top layer.', kind: 'enum', options: [{ value: 'monotonicline', label: 'Monotonic line' }, { value: 'monotonic', label: 'Monotonic' }, { value: 'concentric', label: 'Concentric' }, { value: 'zig-zag', label: 'Rectilinear' }] },
  { key: 'bottom_surface_pattern', target: 'process', group: 'Infill', label: 'Bottom surface pattern', help: 'Pattern of the first layer that touches the bed.', kind: 'enum', options: [{ value: 'monotonic', label: 'Monotonic' }, { value: 'monotonicline', label: 'Monotonic line' }, { value: 'concentric', label: 'Concentric' }, { value: 'zig-zag', label: 'Rectilinear' }] },
  { key: 'infill_wall_overlap', target: 'process', group: 'Infill', label: 'Infill / wall overlap', help: 'How far infill reaches into the walls. Higher bonds better.', kind: 'percent', unit: '%', min: 0, max: 50, step: 1 },
  { key: 'infill_direction', target: 'process', group: 'Infill', label: 'Infill angle', help: 'Direction of the infill lines.', kind: 'number', unit: '°', min: 0, max: 360, step: 5 },

  // Speed
  { key: 'outer_wall_speed', target: 'process', group: 'Speed', label: 'Outer wall', help: 'The visible surface. Slower looks better.', kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'inner_wall_speed', target: 'process', group: 'Speed', label: 'Inner walls', help: '', kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'sparse_infill_speed', target: 'process', group: 'Speed', label: 'Infill', help: '', kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'internal_solid_infill_speed', target: 'process', group: 'Speed', label: 'Solid infill', help: '', kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'top_surface_speed', target: 'process', group: 'Speed', label: 'Top surface', help: 'Slower gives a smoother top.', kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'initial_layer_speed', target: 'process', group: 'Speed', label: 'First layer walls', help: 'Slow first layers stick better.', kind: 'number', unit: 'mm/s', min: 5, max: 100, step: 5, limit: xySpeed },
  { key: 'initial_layer_infill_speed', target: 'process', group: 'Speed', label: 'First layer infill', help: '', kind: 'number', unit: 'mm/s', min: 5, max: 150, step: 5, limit: xySpeed },
  { key: 'bridge_speed', target: 'process', group: 'Speed', label: 'Bridges', help: 'Lines printed over air.', kind: 'number', unit: 'mm/s', min: 5, max: 150, step: 5, limit: xySpeed },
  { key: 'gap_infill_speed', target: 'process', group: 'Speed', label: 'Gap fill', help: '', kind: 'number', unit: 'mm/s', min: 5, max: 250, step: 5, limit: xySpeed },
  { key: 'support_speed', target: 'process', group: 'Speed', label: 'Supports', help: '', kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'travel_speed', target: 'process', group: 'Speed', label: 'Travel', help: 'Moves without extruding.', kind: 'number', unit: 'mm/s', min: 50, max: 250, step: 10, limit: xySpeed },

  // Acceleration
  { key: 'default_acceleration', target: 'process', group: 'Acceleration', label: 'Default', help: `Firmware maximum is ${MACHINE.limits.accelExtruding} mm/s².`, kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'outer_wall_acceleration', target: 'process', group: 'Acceleration', label: 'Outer wall', help: 'Lower reduces ringing on the visible surface.', kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'inner_wall_acceleration', target: 'process', group: 'Acceleration', label: 'Inner walls', help: '', kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'top_surface_acceleration', target: 'process', group: 'Acceleration', label: 'Top surface', help: '', kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'initial_layer_acceleration', target: 'process', group: 'Acceleration', label: 'First layer', help: '', kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'travel_acceleration', target: 'process', group: 'Acceleration', label: 'Travel', help: '', kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: travelAccel },

  // Retraction (machine-level in Orca)
  { key: 'retraction_length', target: 'machine', group: 'Retraction', label: 'Length', help: 'Pulls filament back before travel to stop stringing. Direct drive needs little.', kind: 'number', unit: 'mm', min: 0, max: 5, step: 0.1 },
  { key: 'retraction_speed', target: 'machine', group: 'Retraction', label: 'Speed', help: '', kind: 'number', unit: 'mm/s', min: 10, max: 40, step: 5 },
  { key: 'z_hop', target: 'machine', group: 'Retraction', label: 'Z hop', help: 'Lifts the nozzle on travel so it does not drag across the print.', kind: 'number', unit: 'mm', min: 0, max: 2, step: 0.1 },
  { key: 'retraction_minimum_travel', target: 'machine', group: 'Retraction', label: 'Minimum travel', help: 'Shorter moves do not retract.', kind: 'number', unit: 'mm', min: 0, max: 10, step: 0.5 },
  { key: 'wipe', target: 'machine', group: 'Retraction', label: 'Wipe while retracting', help: 'Moves along the last line while retracting to clean the nozzle.', kind: 'bool' },

  // Cooling (filament-level in Orca)
  { key: 'close_fan_the_first_x_layers', target: 'filament', group: 'Cooling', label: 'Fan off for first layers', help: 'Layers printed without the part fan for better bed adhesion.', kind: 'number', unit: 'layers', min: 0, max: 10, step: 1 },
  { key: 'slow_down_layer_time', target: 'filament', group: 'Cooling', label: 'Minimum layer time', help: 'Small layers are slowed down so they can cool.', kind: 'number', unit: 's', min: 0, max: 30, step: 1 },
  { key: 'overhang_fan_speed', target: 'filament', group: 'Cooling', label: 'Overhang fan', help: 'Fan speed on overhangs and bridges.', kind: 'number', unit: '%', min: 0, max: 100, step: 5 },

  // Supports
  { key: 'support_top_z_distance', target: 'process', group: 'Supports', label: 'Top gap', help: 'Gap between support and the part above it. Larger is easier to remove, rougher underside.', kind: 'number', unit: 'mm', min: 0, max: 0.5, step: 0.02 },
  { key: 'support_object_xy_distance', target: 'process', group: 'Supports', label: 'Side gap', help: 'Gap between support and the part beside it.', kind: 'number', unit: 'mm', min: 0, max: 2, step: 0.05 },
  { key: 'support_interface_top_layers', target: 'process', group: 'Supports', label: 'Interface layers', help: 'Dense layers under the part for a smoother underside.', kind: 'number', unit: 'layers', min: 0, max: 5, step: 1 },
  { key: 'tree_support_branch_angle', target: 'process', group: 'Supports', label: 'Tree branch angle', help: 'Steeper branches reach further but are weaker.', kind: 'number', unit: '°', min: 10, max: 60, step: 5 },

  // Adhesion
  { key: 'brim_object_gap', target: 'process', group: 'Adhesion', label: 'Brim gap', help: 'Space between brim and part. A small gap makes the brim peel off cleanly.', kind: 'number', unit: 'mm', min: 0, max: 1, step: 0.05 },
  { key: 'skirt_loops', target: 'process', group: 'Adhesion', label: 'Skirt loops', help: '', kind: 'number', unit: 'loops', min: 0, max: 5, step: 1 },
  { key: 'skirt_distance', target: 'process', group: 'Adhesion', label: 'Skirt distance', help: '', kind: 'number', unit: 'mm', min: 0, max: 20, step: 1 },
  { key: 'raft_layers', target: 'process', group: 'Adhesion', label: 'Raft layers', help: 'Prints a raft under the part. Rarely needed on a PEI bed.', kind: 'number', unit: 'layers', min: 0, max: 5, step: 1 },

  // Special
  { key: 'ironing_type', target: 'process', group: 'Special', label: 'Ironing', help: 'Passes the hot nozzle over top surfaces to smooth them. Adds time.', kind: 'enum', options: [{ value: 'no ironing', label: 'Off' }, { value: 'top', label: 'All top surfaces' }, { value: 'topmost', label: 'Topmost surface only' }] },
  { key: 'fuzzy_skin', target: 'process', group: 'Special', label: 'Fuzzy skin', help: 'Textured outer surface that hides layer lines.', kind: 'enum', options: [{ value: 'none', label: 'Off' }, { value: 'external', label: 'Outside walls' }, { value: 'all', label: 'All walls' }] },
  { key: 'spiral_mode', target: 'process', group: 'Special', label: 'Spiral vase', help: 'One continuous wall, no top, no infill. For vases and lampshades.', kind: 'bool' },
  { key: 'print_sequence', target: 'process', group: 'Special', label: 'Print order', help: 'By object finishes each part before the next; needs space around parts for the print head.', kind: 'enum', options: [{ value: 'by layer', label: 'By layer' }, { value: 'by object', label: 'By object' }] },
  { key: 'enable_arc_fitting', target: 'process', group: 'Special', label: 'Arc fitting', help: 'Turns curves into G2/G3 arcs for smaller files. The firmware supports arcs.', kind: 'bool' },
  { key: 'reduce_crossing_wall', target: 'process', group: 'Special', label: 'Avoid crossing walls', help: 'Travels around walls instead of over them to reduce marks.', kind: 'bool' }
]

export const CATALOGUE_BY_KEY = new Map(CATALOGUE.map((d) => [d.key, d]))

// ---------------------------------------------------------------- filaments

export const MATERIALS: { id: Material; label: string; orcaBase: string; orcaType: string }[] = [
  { id: 'PLA', label: 'PLA', orcaBase: 'Creality Generic PLA @Ender-3V3-all', orcaType: 'PLA' },
  { id: 'PLA-HS', label: 'PLA High Speed', orcaBase: 'Creality Generic PLA High Speed @Ender-3V3-all', orcaType: 'PLA' },
  { id: 'PETG', label: 'PETG', orcaBase: 'Creality Generic PETG @Ender-3V3-all', orcaType: 'PETG' },
  { id: 'TPU', label: 'TPU', orcaBase: 'Creality Generic TPU @Ender-3V3-all', orcaType: 'TPU' },
  { id: 'ABS', label: 'ABS', orcaBase: 'Creality Generic ABS @Ender-3V3-all', orcaType: 'ABS' },
  { id: 'ASA', label: 'ASA', orcaBase: 'Creality Generic ASA @Ender-3V3-all', orcaType: 'ASA' }
]

const PLATE_KEYS = ['cool_plate_temp', 'eng_plate_temp', 'hot_plate_temp', 'textured_plate_temp']

// ---------------------------------------------------------------- resolving

export interface ResolvedOverrides {
  process: Record<string, string>
  filament: Record<string, string>
  machine: Record<string, string>
}

const n = (v: number): string => String(Math.round(v * 1000) / 1000)

function clamp(def: SettingDef | undefined, value: string, limits: MachineLimits): string {
  if (!def || (def.kind !== 'number' && def.kind !== 'percent')) return value
  const num = parseFloat(value)
  if (!Number.isFinite(num)) return value
  let v = num
  if (def.min !== undefined) v = Math.max(def.min, v)
  if (def.limit) v = Math.min(def.limit(limits), v)
  else if (def.max !== undefined) v = Math.min(def.max, v)
  return def.kind === 'percent' ? `${n(v)}%` : n(v)
}

export function effectiveLimits(m: MachineSettings): MachineLimits {
  return m.firmwareModified ? m.limits : { ...MACHINE.limits }
}

/** Everything FF Print changes relative to Orca's V3 SE system presets. */
export function resolveOverrides(s: PrintSettings, f: Filament, m: MachineSettings): ResolvedOverrides {
  const limits = effectiveLimits(m)
  const process: Record<string, string> = {
    wall_loops: n(s.walls),
    top_shell_layers: n(s.topLayers),
    bottom_shell_layers: n(s.bottomLayers),
    sparse_infill_density: `${n(s.infill)}%`,
    sparse_infill_pattern: s.infillPattern,
    enable_support: s.supports === 'off' ? '0' : '1',
    support_type: s.supports === 'grid' ? 'normal(auto)' : 'tree(auto)',
    support_style: 'default',
    support_on_build_plate_only: s.supportBuildPlateOnly ? '1' : '0',
    support_threshold_angle: n(s.supportAngle),
    brim_type: s.adhesion === 'brim' ? 'outer_only' : 'no_brim',
    brim_width: n(s.brimWidth),
    skirt_loops: s.adhesion === 'skirt' ? '1' : '0',
    // No thumbnails: the stock screen never draws them.
    adaptive_layer_height: '0',
    // Orca's V3 SE preset already sits at the firmware limits; stated here so a modified-firmware
    // limit change cannot be exceeded by the preset.
    default_acceleration: n(Math.min(2500, limits.accelExtruding)),
    travel_acceleration: n(Math.min(2500, limits.accelTravel))
  }
  if (s.adhesion === 'skirt') process.skirt_distance ??= '3'

  const material = MATERIALS.find((x) => x.id === f.material) ?? MATERIALS[0]
  const filament: Record<string, string> = {
    filament_type: material.orcaType,
    filament_vendor: f.brand || 'Generic',
    filament_colour: f.color,
    nozzle_temperature: n(Math.min(f.nozzleTemp, MACHINE.maxNozzleTemp)),
    nozzle_temperature_initial_layer: n(Math.min(f.nozzleTempFirstLayer, MACHINE.maxNozzleTemp)),
    filament_flow_ratio: n(f.flowRatio),
    filament_max_volumetric_speed: n(f.maxVolumetricSpeed),
    fan_min_speed: n(f.fanMin),
    fan_max_speed: n(f.fanMax),
    filament_density: n(f.density),
    filament_diameter: n(f.diameter),
    filament_cost: n(f.pricePerKg)
  }
  for (const k of PLATE_KEYS) {
    filament[k] = n(Math.min(f.bedTemp, MACHINE.maxBedTemp))
    filament[`${k}_initial_layer`] = n(Math.min(f.bedTempFirstLayer, MACHINE.maxBedTemp))
  }

  const machine: Record<string, string> = {
    machine_start_gcode: m.startGcode,
    machine_end_gcode: m.endGcode,
    machine_max_acceleration_x: n(limits.accelX),
    machine_max_acceleration_y: n(limits.accelY),
    machine_max_acceleration_z: n(limits.accelZ),
    machine_max_acceleration_e: n(limits.accelE),
    machine_max_acceleration_extruding: n(limits.accelExtruding),
    machine_max_acceleration_retracting: n(limits.accelRetracting),
    machine_max_acceleration_travel: n(limits.accelTravel),
    machine_max_speed_x: n(limits.speedX),
    machine_max_speed_y: n(limits.speedY),
    machine_max_speed_z: n(limits.speedZ),
    machine_max_speed_e: n(limits.speedE),
    machine_max_junction_deviation: n(limits.junctionDeviation),
    thumbnails: ''
  }

  for (const [key, raw] of Object.entries(s.overrides)) {
    const def = CATALOGUE_BY_KEY.get(key)
    const value = clamp(def, raw, limits)
    const target = def?.target ?? 'process'
    if (target === 'process') process[key] = value
    else if (target === 'filament') filament[key] = value
    else machine[key] = value
  }
  // Clamp every acceleration/speed key that came from presets or overrides.
  for (const def of CATALOGUE) if (def.limit && process[def.key] !== undefined) process[def.key] = clamp(def, process[def.key], limits)
  return { process, filament, machine }
}

export function settingsSummary(s: PrintSettings): string {
  const q = QUALITIES.find((x) => x.id === s.quality)
  const parts = [
    `${(q?.layerHeight ?? 0.2).toFixed(2)} mm`,
    `${s.walls} walls`,
    `${s.infill}% ${INFILL_PATTERNS.find((p) => p.value === s.infillPattern)?.label.toLowerCase() ?? s.infillPattern}`,
    s.supports === 'off' ? 'no supports' : `${s.supports} supports`,
    s.adhesion === 'none' ? 'no adhesion' : s.adhesion
  ]
  const extra = Object.keys(s.overrides).length
  if (extra) parts.push(`${extra} custom`)
  return parts.join(' · ')
}
