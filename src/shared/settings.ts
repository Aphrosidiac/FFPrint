// FF Print's settings model: a few decisions on the main panel, a curated catalogue behind
// "More settings", and the mapping of both onto OrcaSlicer's config keys. Pure — used by the
// renderer (display) and main (resolving the configs handed to the engine).

import { MACHINE, type MachineLimits, type Nozzle } from './machine'
import ORCA_DEFAULTS_JSON from './orca-defaults.json'
import { CREALITY_TUNING } from './tuning'
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
  { id: 'tree', label: 'Tree', hint: 'Branches that touch the model only where needed. Easy to remove. Orange areas on the model get support.' },
  { id: 'grid', label: 'Grid', hint: 'Classic support under every overhang. Strongest, more cleanup. Orange areas on the model get support.' }
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
  /** Enum values never sliced on this printer: what is used instead, and why */
  refuse?: Record<string, { use: string; why: string }>
}

const accel = (l: MachineLimits): number => l.accelExtruding
const travelAccel = (l: MachineLimits): number => l.accelTravel
const xySpeed = (l: MachineLimits): number => Math.min(l.speedX, l.speedY)

export const GROUPS = ['Layers & walls', 'Infill', 'Speed', 'Acceleration', 'Retraction', 'Cooling', 'Supports', 'Adhesion', 'Special'] as const

export const CATALOGUE: SettingDef[] = [
  // Layers & walls
  { key: 'initial_layer_print_height', target: 'process', group: 'Layers & walls', label: 'First layer height', help: "How thick the very first layer is. Thicker sticks better and forgives a slightly uneven bed; too thick and the bottom looks rough.", kind: 'number', unit: 'mm', min: 0.1, max: 0.4, step: 0.02 },
  { key: 'wall_generator', target: 'process', group: 'Layers & walls', label: 'Wall generator', help: "How walls are laid out. Arachne varies the line width so thin parts and lettering come out complete; Classic keeps every line the same width.", kind: 'enum', options: [{ value: 'arachne', label: 'Arachne' }, { value: 'classic', label: 'Classic' }] },
  { key: 'wall_sequence', target: 'process', group: 'Layers & walls', label: 'Wall order', help: "Which wall is printed first on each layer. Inner first gives a cleaner outside; outer first gives more exact sizes but can sag on overhangs.", kind: 'enum', options: [{ value: 'inner wall/outer wall', label: 'Inner, then outer' }, { value: 'outer wall/inner wall', label: 'Outer, then inner' }, { value: 'inner-outer-inner wall', label: 'Inner, outer, inner' }] },
  { key: 'seam_position', target: 'process', group: 'Layers & walls', label: 'Seam position', help: "Where each layer starts and ends, which leaves a small bump. Aligned or Back stacks the bumps into one neat line, in a corner where it can. Random is not offered: without pressure advance the V3 SE leaves a bump at every start, so Random covers tall walls in them.", kind: 'enum', options: [{ value: 'aligned', label: 'Aligned' }, { value: 'nearest', label: 'Nearest' }, { value: 'back', label: 'Back' }], refuse: { random: { use: 'aligned', why: 'without pressure advance the V3 SE leaves a bump at every layer start, so a random seam scatters them all over the walls' } } },
  { key: 'only_one_wall_top', target: 'process', group: 'Layers & walls', label: 'Single wall on top surfaces', help: "Uses a single wall on the topmost layer so the flat top gets more smooth fill. Usually improves flat tops; turn off if top edges look weak.", kind: 'bool' },
  { key: 'detect_thin_wall', target: 'process', group: 'Layers & walls', label: 'Detect thin walls', help: "Prints walls too thin for two lines as one line instead of leaving them out. Turn on if thin fins or text go missing.", kind: 'bool' },
  { key: 'elefant_foot_compensation', target: 'process', group: 'Layers & walls', label: "Elephant's foot compensation", help: "Pulls the first layer in slightly to cancel the outward bulge at the base (\"elephant's foot\"). Raise it if the bottom edge flares; too much leaves a groove at the base.", kind: 'number', unit: 'mm', min: 0, max: 1, step: 0.05 },
  { key: 'xy_hole_compensation', target: 'process', group: 'Layers & walls', label: 'Hole size compensation', help: "Makes holes bigger by this much. Holes usually print a little small; raise it if screws or pins do not fit.", kind: 'number', unit: 'mm', min: -1, max: 1, step: 0.05 },
  { key: 'xy_contour_compensation', target: 'process', group: 'Layers & walls', label: 'Outer size compensation', help: "Makes the outside of the part bigger (positive) or smaller (negative) by this much. Use it when parts come out slightly too big or too small to fit together.", kind: 'number', unit: 'mm', min: -1, max: 1, step: 0.05 },

  // Infill
  { key: 'top_surface_pattern', target: 'process', group: 'Infill', label: 'Top surface pattern', help: "The line pattern on the visible top layer. Monotonic gives the smoothest, most even top; Concentric follows the outline.", kind: 'enum', options: [{ value: 'monotonicline', label: 'Monotonic line' }, { value: 'monotonic', label: 'Monotonic' }, { value: 'concentric', label: 'Concentric' }, { value: 'zig-zag', label: 'Rectilinear' }] },
  { key: 'bottom_surface_pattern', target: 'process', group: 'Infill', label: 'Bottom surface pattern', help: "The line pattern on the layer touching the bed. It only changes how the underside looks.", kind: 'enum', options: [{ value: 'monotonic', label: 'Monotonic' }, { value: 'monotonicline', label: 'Monotonic line' }, { value: 'concentric', label: 'Concentric' }, { value: 'zig-zag', label: 'Rectilinear' }] },
  { key: 'infill_wall_overlap', target: 'process', group: 'Infill', label: 'Infill / wall overlap', help: "How far the infill reaches into the walls. Higher joins them more firmly; too high can make the walls bulge outward.", kind: 'percent', unit: '%', min: 0, max: 50, step: 1 },
  { key: 'infill_direction', target: 'process', group: 'Infill', label: 'Infill angle', help: "The angle of the infill lines. Rarely needs changing; rotate it if lines run along a thin part and leave it weak.", kind: 'number', unit: '°', min: 0, max: 360, step: 5 },

  // Speed
  { key: 'outer_wall_speed', target: 'process', group: 'Speed', label: 'Outer wall', help: "Speed of the outside surface you see. Slower looks cleaner; faster saves time but shows more ripples.", kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'inner_wall_speed', target: 'process', group: 'Speed', label: 'Inner walls', help: "Speed of the hidden walls inside the outer one. Can be faster than the outer wall without changing how the part looks.", kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'sparse_infill_speed', target: 'process', group: 'Speed', label: 'Infill', help: "Speed of the fill inside the part, where most of the time goes. Too fast and the hot end cannot melt plastic quickly enough, giving weak, gappy infill.", kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'internal_solid_infill_speed', target: 'process', group: 'Speed', label: 'Solid infill', help: "Speed of the solid layers inside the part, under top surfaces. Too fast can leave gaps that show through the top.", kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'top_surface_speed', target: 'process', group: 'Speed', label: 'Top surface', help: "Speed of the visible top layer. Slower gives a smoother, more even top.", kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'initial_layer_speed', target: 'process', group: 'Speed', label: 'First layer walls', help: "Speed of the walls on the first layer. Slow gives the best bed grip; raise it only once your first layers stick reliably.", kind: 'number', unit: 'mm/s', min: 5, max: 100, step: 5, limit: xySpeed },
  { key: 'initial_layer_infill_speed', target: 'process', group: 'Speed', label: 'First layer infill', help: "Speed of the fill on the first layer. Slower sticks better; too fast can make lines lift or not join.", kind: 'number', unit: 'mm/s', min: 5, max: 150, step: 5, limit: xySpeed },
  { key: 'bridge_speed', target: 'process', group: 'Speed', label: 'Bridges', help: "Speed of lines printed across open air between two points. Slower lets them cool and stay straight; too fast and bridges sag.", kind: 'number', unit: 'mm/s', min: 5, max: 150, step: 5, limit: xySpeed },
  { key: 'gap_infill_speed', target: 'process', group: 'Speed', label: 'Gap fill', help: "Speed of the small fills in narrow gaps between walls. Slower keeps these tiny lines accurate.", kind: 'number', unit: 'mm/s', min: 5, max: 250, step: 5, limit: xySpeed },
  { key: 'support_speed', target: 'process', group: 'Speed', label: 'Supports', help: "Speed of support structures. Faster saves time since supports are thrown away; too fast and they can fail or topple.", kind: 'number', unit: 'mm/s', min: 10, max: 250, step: 5, limit: xySpeed },
  { key: 'travel_speed', target: 'process', group: 'Speed', label: 'Travel', help: "Speed of moves where nothing is printed. Faster means less oozing and stringing between parts.", kind: 'number', unit: 'mm/s', min: 50, max: 250, step: 10, limit: xySpeed },

  // Acceleration
  { key: 'default_acceleration', target: 'process', group: 'Acceleration', label: 'Default', help: "How quickly the print head speeds up and slows down, for every move without its own value below. Lower is gentler and shows less ringing; higher finishes sooner.", kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'outer_wall_acceleration', target: 'process', group: 'Acceleration', label: 'Outer wall', help: "Acceleration on the visible outer wall. Lower reduces the ripples (\"ringing\") that appear next to corners and edges.", kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'inner_wall_acceleration', target: 'process', group: 'Acceleration', label: 'Inner walls', help: "Acceleration on hidden walls. Can be higher than the outer wall to save time.", kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'top_surface_acceleration', target: 'process', group: 'Acceleration', label: 'Top surface', help: "Acceleration on the visible top layer. Lower gives a smoother top.", kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'initial_layer_acceleration', target: 'process', group: 'Acceleration', label: 'First layer', help: "Acceleration on the first layer. Low keeps the head from tugging fresh lines off the bed.", kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: accel },
  { key: 'travel_acceleration', target: 'process', group: 'Acceleration', label: 'Travel', help: "Acceleration on moves where nothing is printed. Higher saves time; too high can shake the printer or make it skip.", kind: 'number', unit: 'mm/s²', min: 100, max: 2500, step: 100, limit: travelAccel },

  // Retraction (machine-level in Orca)
  { key: 'retraction_length', target: 'machine', group: 'Retraction', label: 'Length', help: "How far filament is pulled back before the head moves across a gap, to stop strings. Raise it if you see stringing; too much can clog or leave gaps at line starts.", kind: 'number', unit: 'mm', min: 0, max: 5, step: 0.1 },
  { key: 'retraction_speed', target: 'machine', group: 'Retraction', label: 'Speed', help: "How fast the filament is pulled back and pushed in again. Faster stops oozing sooner; too fast can grind the filament.", kind: 'number', unit: 'mm/s', min: 10, max: 40, step: 5, limit: (l) => l.speedE },
  { key: 'z_hop', target: 'machine', group: 'Retraction', label: 'Z hop', help: "Lifts the nozzle a little before each move so it does not scrape the print. Helps if the nozzle bumps tall parts; adds strings and time.", kind: 'number', unit: 'mm', min: 0, max: 2, step: 0.1 },
  { key: 'retraction_minimum_travel', target: 'machine', group: 'Retraction', label: 'Minimum travel', help: "Moves shorter than this skip the pull-back. Lower it if you see short strings; higher saves time.", kind: 'number', unit: 'mm', min: 0, max: 10, step: 0.5 },
  { key: 'wipe', target: 'machine', group: 'Retraction', label: 'Wipe while retracting', help: "Drags the nozzle along the last line while pulling back, cleaning off the drip. Usually means fewer blobs; turn off if you see marks on walls.", kind: 'bool' },

  // Cooling (filament-level in Orca)
  { key: 'close_fan_the_first_x_layers', target: 'filament', group: 'Cooling', label: 'Fan off for first layers', help: "How many first layers print without the cooling fan. Warm first layers stick better; PETG and ABS like more.", kind: 'number', unit: 'layers', min: 0, max: 10, step: 1 },
  { key: 'slow_down_layer_time', target: 'filament', group: 'Cooling', label: 'Minimum layer time', help: "Every layer takes at least this long; small layers are slowed so they can cool. Raise it if small tips melt or droop.", kind: 'number', unit: 's', min: 0, max: 30, step: 1 },
  { key: 'overhang_fan_speed', target: 'filament', group: 'Cooling', label: 'Overhang fan', help: "Fan speed while printing overhangs and bridges. More cooling keeps them from drooping; lower it for ABS or ASA if layers split.", kind: 'number', unit: '%', min: 0, max: 100, step: 5 },

  // Supports
  { key: 'support_top_z_distance', target: 'process', group: 'Supports', label: 'Top gap', help: "Gap between the top of a support and the part above it. Bigger snaps off easier but leaves a rougher underside; smaller looks better but can fuse to the part.", kind: 'number', unit: 'mm', min: 0, max: 0.5, step: 0.02 },
  { key: 'support_object_xy_distance', target: 'process', group: 'Supports', label: 'Side gap', help: "Gap between supports and the side of the part. Bigger is easier to remove; too big and edges are left unsupported.", kind: 'number', unit: 'mm', min: 0, max: 2, step: 0.05 },
  { key: 'support_interface_top_layers', target: 'process', group: 'Supports', label: 'Interface layers', help: "Dense layers at the top of the support, right under the part. More gives a smoother underside but can be harder to peel off.", kind: 'number', unit: 'layers', min: 0, max: 5, step: 1 },
  { key: 'tree_support_branch_angle', target: 'process', group: 'Supports', label: 'Tree branch angle', help: "How far tree branches may lean to reach an overhang. Higher reaches further with fewer trunks, but branches are weaker.", kind: 'number', unit: '°', min: 10, max: 60, step: 5 },

  // Adhesion
  { key: 'brim_object_gap', target: 'process', group: 'Adhesion', label: 'Brim gap', help: "A small gap between brim and part so the brim peels off cleanly. Zero holds hardest but is harder to remove.", kind: 'number', unit: 'mm', min: 0, max: 1, step: 0.05 },
  { key: 'skirt_loops', target: 'process', group: 'Adhesion', label: 'Skirt loops', help: "How many outlines are drawn around the print to get plastic flowing. Adhesion: Skirt uses one; more helps after changing filament.", kind: 'number', unit: 'loops', min: 0, max: 5, step: 1 },
  { key: 'skirt_distance', target: 'process', group: 'Adhesion', label: 'Skirt distance', help: "How far the skirt sits from the part. Too close and it may fuse to the part.", kind: 'number', unit: 'mm', min: 0, max: 20, step: 1 },
  { key: 'raft_layers', target: 'process', group: 'Adhesion', label: 'Raft layers', help: "Prints a throwaway platform under the part. Rarely needed on the V3 SE's PEI bed; it costs time and leaves a rough underside.", kind: 'number', unit: 'layers', min: 0, max: 5, step: 1 },

  // Special
  { key: 'ironing_type', target: 'process', group: 'Special', label: 'Ironing', help: "After the top layer, the hot nozzle passes over it again with very little plastic to smooth it. Looks great on flat tops; adds a lot of time.", kind: 'enum', options: [{ value: 'no ironing', label: 'Off' }, { value: 'top', label: 'All top surfaces' }, { value: 'topmost', label: 'Topmost surface only' }] },
  { key: 'fuzzy_skin', target: 'process', group: 'Special', label: 'Fuzzy skin', help: "Adds a deliberate rough texture to the outside that hides layer lines. Use for grips or a matte look; slows printing a little.", kind: 'enum', options: [{ value: 'disabled_fuzzy', label: 'Off' }, { value: 'external', label: 'Outer contour' }, { value: 'all', label: 'Contour and holes' }, { value: 'allwalls', label: 'All walls' }] },
  { key: 'spiral_mode', target: 'process', group: 'Special', label: 'Spiral vase', help: "Prints one continuous outer wall with no top and no infill, for vases and lamp shades. Needs one wall, no top layers and no supports.", kind: 'bool' },
  { key: 'print_sequence', target: 'process', group: 'Special', label: 'Print order', help: "By layer prints all parts together. By object finishes each part before starting the next, so one failure does not ruin all, but parts need room around them for the print head.", kind: 'enum', options: [{ value: 'by layer', label: 'By layer' }, { value: 'by object', label: 'By object' }] },
  { key: 'enable_arc_fitting', target: 'process', group: 'Special', label: 'Arc fitting', help: "Turns smooth curves into arc commands, making files smaller and curves smoother. The V3 SE firmware supports arcs.", kind: 'bool' },
  { key: 'reduce_crossing_wall', target: 'process', group: 'Special', label: 'Avoid crossing walls', help: "Routes moves around walls instead of over them, avoiding small marks on the surface. Takes a little longer.", kind: 'bool' }
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
    // Older projects and history jobs can still carry a refused value (seam: random).
    const value = def?.refuse?.[raw]?.use ?? clamp(def, raw, limits)
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

// ---------------------------------------------------------------- display helpers (renderer)


interface OrcaDefaults {
  process: Record<string, Record<string, Record<string, string>>>
  machine: Record<string, Record<string, string>>
  filament: Record<string, Record<string, string>>
  materials: Record<string, Omit<Filament, 'id' | 'name' | 'brand' | 'material' | 'color' | 'pricePerKg' | 'notes'>>
}
/** Effective values of Orca's V3 SE presets, generated by scripts/gen-defaults.mjs. */
export const ORCA_DEFAULTS = ORCA_DEFAULTS_JSON as unknown as OrcaDefaults

/** Thickest layer each nozzle can print (Orca's V3 SE machine presets: 0.8 x nozzle). */
export const NOZZLE_MAX_LAYER: Record<Nozzle, number> = { '0.2': 0.16, '0.4': 0.32, '0.6': 0.48, '0.8': 0.64 }

/** Draft and Standard are too thick for a 0.2 mm nozzle; the engine refuses them. */
export function qualityFits(quality: QualityId, nozzle: Nozzle): boolean {
  const q = QUALITIES.find((x) => x.id === quality)
  return !q || q.layerHeight <= NOZZLE_MAX_LAYER[nozzle] + 1e-9
}

/** Value Orca's own V3 SE preset uses for a catalogue key (no FF Print changes). */
export function orcaDefault(def: SettingDef, quality: QualityId, nozzle: Nozzle, material: Material): string | undefined {
  if (def.target === 'machine') return ORCA_DEFAULTS.machine[nozzle]?.[def.key] ?? ORCA_DEFAULTS.machine['0.4']?.[def.key]
  if (def.target === 'filament') return ORCA_DEFAULTS.filament[material]?.[def.key] ?? ORCA_DEFAULTS.filament.PLA?.[def.key]
  return ORCA_DEFAULTS.process[nozzle]?.[quality]?.[def.key] ?? ORCA_DEFAULTS.process['0.4']?.[quality]?.[def.key] ?? ORCA_DEFAULTS.process['0.4']?.standard?.[def.key]
}

/**
 * What the engine receives for this key when it is not overridden. Same layering as slicing
 * (src/main/engine/slice.ts): Orca's V3 SE preset <- Creality Print's V3 SE tuning <- FF Print's own
 * values (strength, supports, adhesion, firmware clamps).
 */
export function effectiveDefault(def: SettingDef, s: PrintSettings, f: Filament, m: MachineSettings): string | undefined {
  const base = resolveOverrides({ ...s, overrides: {} }, f, m)
  const own = base[def.target][def.key]
  if (own !== undefined) return own
  const tuned = def.target === 'process' ? CREALITY_TUNING[def.key] : undefined
  const raw = tuned ?? orcaDefault(def, s.quality, m.nozzle, f.material)
  return raw === undefined ? undefined : clamp(def, raw, effectiveLimits(m))
}

/** Highest value the field accepts: the firmware limit when it has one, else its range. */
export function effectiveMax(def: SettingDef, limits: MachineLimits): number | undefined {
  return def.limit ? def.limit(limits) : def.max
}

export function decodeNumber(raw: string | undefined): number {
  const v = parseFloat(raw ?? '')
  return Number.isFinite(v) ? v : 0
}

export function decodeBool(raw: string | undefined): boolean {
  return raw === '1' || raw === 'true'
}

/** Orca's string encoding: numbers as plain strings, percents with "%", bools "1"/"0". */
export function encodeValue(def: SettingDef, v: number | boolean | string): string {
  if (def.kind === 'bool') return v ? '1' : '0'
  if (def.kind === 'enum') return String(v)
  const num = typeof v === 'number' ? v : parseFloat(String(v))
  return def.kind === 'percent' ? `${n(num)}%` : n(num)
}

/** "60 mm/s", "On", "Arachne", "15%" */
export function formatValue(def: SettingDef, raw: string | undefined): string {
  if (raw === undefined || raw === '') return '—'
  if (def.kind === 'bool') return decodeBool(raw) ? 'On' : 'Off'
  if (def.kind === 'enum') return def.options?.find((o) => o.value === raw)?.label ?? raw
  if (def.kind === 'percent') return `${n(decodeNumber(raw))}%`
  if (raw.trim().endsWith('%')) return raw.trim()
  return def.unit ? `${n(decodeNumber(raw))} ${def.unit}` : n(decodeNumber(raw))
}

/** Same value once both are decoded ("60" == "60.0", "15%" == "15"). */
export function sameValue(def: SettingDef, a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  if (def.kind === 'number' || def.kind === 'percent') return Math.abs(decodeNumber(a) - decodeNumber(b)) < 1e-6
  if (def.kind === 'bool') return decodeBool(a) === decodeBool(b)
  return a === b
}

export function overrideCount(s: PrintSettings): number {
  return Object.keys(s.overrides).length
}

/** Catalogue entries whose label, help or group match every word of the query. */
export function searchCatalogue(query: string): SettingDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return CATALOGUE.filter((d) => {
    const hay = `${d.label} ${d.help} ${d.group} ${d.key.replace(/_/g, ' ')}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** Equal print settings, ignoring key order in overrides. */
export function sameSettings(a: PrintSettings, b: PrintSettings): boolean {
  const norm = (s: PrintSettings): string => {
    const { overrides, ...rest } = s
    const keys = Object.keys(rest).sort() as (keyof typeof rest)[]
    return JSON.stringify([keys.map((k) => [k, rest[k]]), Object.entries(overrides).sort(([x], [y]) => (x < y ? -1 : 1))])
  }
  return norm({ ...defaultPrintSettings(), ...a }) === norm({ ...defaultPrintSettings(), ...b })
}

/** Starting values for a new library entry of this material (Orca's Creality generic profile). */
export function filamentDefaults(material: Material): OrcaDefaults['materials'][string] {
  return ORCA_DEFAULTS.materials[material] ?? ORCA_DEFAULTS.materials.PLA
}

export interface SettingDescription {
  key: string
  target: Target
  group: string
  label: string
  help: string
  kind: SettingDef['kind']
  unit?: string
  min?: number
  /** Includes the firmware limit when the setting has one */
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  /** Orca-encoded value the engine will get */
  value: string | undefined
  /** Value without an override (Orca preset <- Creality tuning <- FF Print) */
  default: string | undefined
  overridden: boolean
  /** Human-readable, e.g. "60 mm/s" */
  display: string
  firmwareMax?: number
}

/** Every catalogue setting with its current and default value — the "list settings" view. */
export function describeSettings(s: PrintSettings, f: Filament, m: MachineSettings): SettingDescription[] {
  const limits = effectiveLimits(m)
  return CATALOGUE.map((def) => {
    const dflt = effectiveDefault(def, s, f, m)
    const override = s.overrides[def.key]
    const value = override !== undefined ? clamp(def, override, limits) : dflt
    return {
      key: def.key,
      target: def.target,
      group: def.group,
      label: def.label,
      help: def.help,
      kind: def.kind,
      unit: def.unit,
      min: def.min,
      max: effectiveMax(def, limits),
      step: def.step,
      options: def.options,
      value,
      default: dflt,
      overridden: override !== undefined,
      display: formatValue(def, value),
      firmwareMax: def.limit ? def.limit(limits) : undefined
    }
  })
}

/** Field -> problem, empty when the filament can be saved. Temperatures stay inside the V3 SE's limits. */
export function validateFilament(f: Filament): Record<string, string> {
  const e: Record<string, string> = {}
  if (!f.name.trim()) e.name = 'Give it a name.'
  if (!MATERIALS.some((m) => m.id === f.material)) e.material = `Material must be one of ${MATERIALS.map((m) => m.id).join(', ')}.`
  if (!/^#[0-9a-f]{6}$/i.test(f.color)) e.color = 'Use a hex colour like #2f6fdb.'
  const nozzle = (t: number): string | undefined =>
    !Number.isFinite(t) ? 'Enter a temperature.' : t > MACHINE.maxNozzleTemp ? `The V3 SE hot end stops at ${MACHINE.maxNozzleTemp} °C.` : t < 150 ? 'Below 150 °C nothing melts.' : undefined
  const bed = (t: number): string | undefined =>
    !Number.isFinite(t) ? 'Enter a temperature.' : t > MACHINE.maxBedTemp ? `The bed stops at ${MACHINE.maxBedTemp} °C.` : t < 0 ? 'Use 0 for an unheated bed.' : undefined
  const n1 = nozzle(f.nozzleTemp) ?? nozzle(f.nozzleTempFirstLayer)
  if (n1) e.nozzle = n1
  const b1 = bed(f.bedTemp) ?? bed(f.bedTempFirstLayer)
  if (b1) e.bed = b1
  if (!(f.flowRatio >= 0.5 && f.flowRatio <= 1.5)) e.flowRatio = 'Flow ratio is usually between 0.9 and 1.05.'
  if (!(f.maxVolumetricSpeed > 0 && f.maxVolumetricSpeed <= 40)) e.maxVolumetricSpeed = 'Use 1 to 40 mm³/s.'
  if (!(f.fanMin >= 0 && f.fanMax <= 100)) e.fan = 'Fan speeds are 0 to 100%.'
  else if (f.fanMin > f.fanMax) e.fan = 'Minimum fan is above maximum.'
  if (!(f.density > 0)) e.density = 'Density must be above 0.'
  if (!(f.diameter > 0)) e.diameter = 'Diameter must be above 0.'
  if (!(f.pricePerKg >= 0)) e.pricePerKg = 'Price cannot be negative.'
  return e
}

export const MATERIAL_COLORS: Record<Material, string> = { PLA: '#f2f2f0', 'PLA-HS': '#3a3a3c', PETG: '#2f6fdb', TPU: '#e0533d', ABS: '#e8b931', ASA: '#6b7280' }

/**
 * A new library entry (no id yet). Numbers come from a spool of the same material already in the
 * library, else from Orca's Creality generic profile for the material; `partial` wins over both.
 */
export function newFilament(library: Filament[], partial: Partial<Filament> = {}): Filament {
  const material: Material = partial.material ?? 'PLA'
  const label = MATERIALS.find((m) => m.id === material)?.label ?? material
  const like = library.find((x) => x.material === material)
  const base: Filament = like
    ? { ...like }
    : { id: '', name: '', brand: 'Generic', material, color: MATERIAL_COLORS[material], ...filamentDefaults(material), pricePerKg: 75, notes: '' }
  return { ...base, id: '', name: `New ${label}`, notes: '', ...partial, material }
}
