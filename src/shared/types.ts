import type { MachineLimits, Nozzle } from './machine'

export type Material = 'PLA' | 'PLA-HS' | 'PETG' | 'TPU' | 'ABS' | 'ASA'

/** One spool type Fakhrul owns. Temperatures in °C, price per kg in RM. */
export interface Filament {
  id: string
  name: string
  brand: string
  material: Material
  color: string
  nozzleTemp: number
  nozzleTempFirstLayer: number
  bedTemp: number
  bedTempFirstLayer: number
  flowRatio: number
  /** mm³/s — caps print speed for this filament */
  maxVolumetricSpeed: number
  fanMin: number
  fanMax: number
  density: number
  diameter: number
  pricePerKg: number
  notes: string
}

export type QualityId = 'draft' | 'standard' | 'optimal' | 'fine'
export type StrengthId = 'light' | 'standard' | 'strong' | 'solid'
export type SupportMode = 'off' | 'tree' | 'grid'
export type AdhesionType = 'skirt' | 'brim' | 'none'

export interface PrintSettings {
  quality: QualityId
  strength: StrengthId
  /** Inline edits on top of the strength preset */
  walls: number
  topLayers: number
  bottomLayers: number
  infill: number
  infillPattern: string
  supports: SupportMode
  supportBuildPlateOnly: boolean
  supportAngle: number
  adhesion: AdhesionType
  brimWidth: number
  /** Advanced values by Orca key (string-encoded like Orca's own profiles). Wins over everything. */
  overrides: Record<string, string>
}

/** A named, saved PrintSettings ("Functional", "Miniatures"). */
export interface Setup {
  id: string
  name: string
  settings: PrintSettings
  updatedAt: string
}

export interface MachineSettings {
  nozzle: Nozzle
  startGcode: string
  endGcode: string
  /** Only used when firmwareModified is on; otherwise MACHINE.limits apply. */
  firmwareModified: boolean
  limits: MachineLimits
  /** Real time / estimated time, learned from history. 1 = trust the estimate. */
  timeFactor: number
}

export interface Prefs {
  theme: 'system' | 'light' | 'dark'
  currency: string
  lastFilamentId: string
  /** Last-used SD volume label/serial so the card is recognised next time */
  sdVolumeHint: string
  fileNamePattern: string
  recent: string[]
}

/** A mesh as sent to the engine: non-indexed triangles in model space (mm). */
export interface MeshPayload {
  id: string
  name: string
  positions: Float32Array
}

export interface ScenePayload {
  meshes: MeshPayload[]
  /** One per placed object: which mesh, and its 4x4 column-major world matrix (three.js order). */
  instances: { meshId: string; name: string; matrix: number[] }[]
}

export interface SliceRequest {
  scene: ScenePayload
  settings: PrintSettings
  filamentId: string
  /** Base name for the output file, usually the first object's name */
  jobName: string
}

export interface SliceStats {
  /** Engine estimate in seconds */
  estimateSeconds: number
  /** estimate x timeFactor */
  seconds: number
  filamentMm: number
  filamentCm3: number
  filamentG: number
  cost: number
  layers: number
  maxZ: number
}

export interface SliceResult {
  id: string
  gcodePath: string
  fileName: string
  stats: SliceStats
  settingsSummary: string
  durationMs: number
}

export interface Drive {
  /** e.g. "E:\\" */
  root: string
  label: string
  sizeBytes: number
  freeBytes: number
  /** Looks like the printer's card (FAT32, removable, has .gcode files or matches the hint) */
  likelyPrinterCard: boolean
}

export interface HistoryEntry {
  id: string
  createdAt: string
  jobName: string
  fileName: string
  savedTo: string
  stats: SliceStats
  settings: PrintSettings
  filamentId: string
  filamentName: string
  /** data URL PNG of the viewport at save time */
  thumbnail: string
  /** Project file kept for Reprint */
  projectPath: string
  /** Real print time in seconds, entered after the print */
  actualSeconds: number | null
}

/** What a .ffprint project holds besides the model files. */
export interface ProjectScene {
  version: 1
  objects: { name: string; file: string; matrix: number[]; color?: string }[]
  settings: PrintSettings
  filamentId: string
}

export interface LoadedFile {
  path: string
  name: string
  ext: 'stl' | 'obj' | '3mf' | 'ffprint'
  bytes: Uint8Array
}
