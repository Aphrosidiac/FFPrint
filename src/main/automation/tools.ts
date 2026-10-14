// Every automation tool FF Print exposes over MCP. Anything a person can do in the window is here.
// `where: 'renderer'` tools run in the window (scene, settings, preview, slice flow); `where: 'main'`
// tools run in the main process. The renderer side lives in src/renderer/src/automation.ts and must
// implement every renderer tool listed here (tests/automation.test.ts checks the two lists agree).

import { z } from 'zod'

export interface ToolSpec {
  name: string
  title: string
  description: string
  shape: Record<string, z.ZodType>
  readOnly?: boolean
  where: 'renderer' | 'main'
}

const id = z.string().describe('Object id from list_objects')
const ids = z.array(z.string()).describe('Object ids from list_objects')
const vec = (what: string) => z.object({ x: z.number().optional(), y: z.number().optional(), z: z.number().optional() }).describe(what)

export const SERVER_INSTRUCTIONS = `FF Print is Fakhrul's slicer for his Creality Ender-3 V3 SE (220 x 220 x 250 mm bed, printing from SD card).
Coordinates are printer coordinates in mm: X right, Y back, Z up; the bed spans (0,0)-(220,220); an object's position is the centre of its footprint.
Typical flow: open_models -> list_objects -> arrange_all / transform tools -> set_print_settings / set_setting -> select_filament -> slice -> get_preview_info / screenshot -> save_to_sd -> eject_sd.
Call get_state first to see what is on screen. Call screenshot to see the window. list_settings explains every setting in plain language.
Settings are clamped to the printer's firmware limits automatically.`

export const TOOLS: ToolSpec[] = [
  // ---- app
  { name: 'get_state', title: 'Get app state', where: 'renderer', readOnly: true, description: 'Snapshot of what the app shows: page, mode, objects with positions/sizes/issues, current settings summary, filament, slice status and result, drives.', shape: {} },
  { name: 'screenshot', title: 'Screenshot the window', where: 'main', readOnly: true, description: 'PNG of the FF Print window as it is now (what Fakhrul sees).', shape: {} },
  { name: 'navigate', title: 'Navigate', where: 'renderer', description: 'Switch page (workspace, filaments, history, machine) and/or workspace mode (prepare = 3D bed, preview = sliced toolpaths).', shape: { page: z.enum(['workspace', 'filaments', 'history', 'machine']).optional(), mode: z.enum(['prepare', 'preview']).optional() } },
  { name: 'ui_eval', title: 'Run JavaScript in the window', where: 'renderer', description: 'Escape hatch: evaluate an async JS function body in the renderer with `ff` = { app, scene, meshes, actions } in scope; return a JSON-serialisable value. Use only when no dedicated tool exists.', shape: { code: z.string().describe('Function body, e.g. "return ff.app.settings"') } },

  // ---- files
  { name: 'open_models', title: 'Open models', where: 'renderer', description: 'Add STL / OBJ / 3MF files (absolute paths) to the bed, or open an .ffprint project. New objects are arranged around existing ones.', shape: { paths: z.array(z.string()).min(1) } },
  { name: 'save_project', title: 'Save project', where: 'renderer', description: 'Save the bed, settings and filament as an .ffprint project at an absolute path.', shape: { path: z.string() } },
  { name: 'list_recent', title: 'Recent files', where: 'main', readOnly: true, description: 'Recently opened files and projects.', shape: {} },

  // ---- objects
  { name: 'list_objects', title: 'List objects', where: 'renderer', readOnly: true, description: 'Objects on the bed: id, name, position, rotation (deg), scale, world size (mm), visible, issues.', shape: {} },
  { name: 'select_objects', title: 'Select objects', where: 'renderer', description: 'Select objects (replaces the selection unless additive).', shape: { ids, additive: z.boolean().optional() } },
  { name: 'move_object', title: 'Move object', where: 'renderer', description: 'Move an object: absolute bed position of its footprint centre, or relative offset with relative=true.', shape: { id, x: z.number().optional(), y: z.number().optional(), relative: z.boolean().optional() } },
  { name: 'rotate_object', title: 'Rotate object', where: 'renderer', description: 'Rotate an object in degrees about X/Y/Z (relative adds to the current rotation). The object is dropped back onto the bed.', shape: { id, rotation: vec('Degrees'), relative: z.boolean().optional() } },
  { name: 'scale_object', title: 'Scale object', where: 'renderer', description: 'Scale by percent (uniform or per axis) or to a target size in mm (sizeMm; one axis keeps proportions unless uniform=false).', shape: { id, percent: z.number().optional(), perAxisPercent: vec('Percent per axis').optional(), sizeMm: vec('Target world size in mm').optional(), uniform: z.boolean().optional() } },
  { name: 'lay_flat', title: 'Lay flat', where: 'renderer', description: 'Rotate the object so its largest flat face sits on the bed (or a given face index).', shape: { id, faceIndex: z.number().int().optional() } },
  { name: 'drop_to_bed', title: 'Drop to bed', where: 'renderer', description: 'Put the object\'s lowest point on the bed.', shape: { ids } },
  { name: 'centre_object', title: 'Centre on bed', where: 'renderer', description: 'Move the object to the middle of the bed.', shape: { id } },
  { name: 'duplicate_objects', title: 'Duplicate', where: 'renderer', description: 'Duplicate objects `count` times and arrange.', shape: { ids, count: z.number().int().min(1).max(50).optional() } },
  { name: 'remove_objects', title: 'Remove objects', where: 'renderer', description: 'Delete objects from the bed.', shape: { ids } },
  { name: 'clear_bed', title: 'Clear bed', where: 'renderer', description: 'Remove every object.', shape: {} },
  { name: 'rename_object', title: 'Rename object', where: 'renderer', description: 'Rename an object (also used for the G-code file name).', shape: { id, name: z.string().min(1) } },
  { name: 'set_object_visible', title: 'Show/hide object', where: 'renderer', description: 'Hidden objects stay on the bed but are not printed.', shape: { id, visible: z.boolean() } },
  { name: 'arrange_all', title: 'Arrange', where: 'renderer', description: 'Pack all objects on the bed. Returns whether everything fits.', shape: {} },
  { name: 'set_camera_view', title: 'Camera view', where: 'renderer', description: 'Point the 3D camera (prepare or preview mode).', shape: { view: z.enum(['iso', 'top', 'front', 'left', 'right', 'fit', 'fit-selection']) } },

  // ---- settings
  { name: 'list_settings', title: 'List settings', where: 'renderer', readOnly: true, description: 'Every setting with current value, default, unit, range and a plain-language explanation; plus the main-panel choices (quality, strength, supports, adhesion).', shape: {} },
  { name: 'set_print_settings', title: 'Set print settings', where: 'renderer', description: 'Change main-panel choices. quality: draft|standard|optimal|fine. strength: light|standard|strong|solid (sets walls/infill; then walls/infill/infillPattern/topLayers/bottomLayers override it). supports: off|tree|grid. adhesion: skirt|brim|none.', shape: { quality: z.enum(['draft', 'standard', 'optimal', 'fine']).optional(), strength: z.enum(['light', 'standard', 'strong', 'solid']).optional(), walls: z.number().int().optional(), infill: z.number().optional(), infillPattern: z.string().optional(), topLayers: z.number().int().optional(), bottomLayers: z.number().int().optional(), supports: z.enum(['off', 'tree', 'grid']).optional(), supportAngle: z.number().optional(), supportBuildPlateOnly: z.boolean().optional(), adhesion: z.enum(['skirt', 'brim', 'none']).optional(), brimWidth: z.number().optional() } },
  { name: 'set_setting', title: 'Set advanced setting', where: 'renderer', description: 'Set one advanced setting by key (see list_settings). Value as Orca writes it: numbers as strings, percents like "15%", booleans "1"/"0". value=null resets it.', shape: { key: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) } },
  { name: 'reset_settings', title: 'Reset settings', where: 'renderer', description: 'Reset advanced overrides (all, or the given keys).', shape: { keys: z.array(z.string()).optional() } },
  { name: 'list_setups', title: 'List saved setups', where: 'renderer', readOnly: true, description: 'Saved named setups.', shape: {} },
  { name: 'apply_setup', title: 'Apply setup', where: 'renderer', description: 'Load a saved setup into the current settings.', shape: { id: z.string() } },
  { name: 'save_setup', title: 'Save setup', where: 'renderer', description: 'Save the current settings as a named setup (updates it if id is given).', shape: { name: z.string(), id: z.string().optional() } },
  { name: 'delete_setup', title: 'Delete setup', where: 'renderer', description: 'Delete a saved setup.', shape: { id: z.string() } },

  // ---- filaments + printer
  { name: 'list_filaments', title: 'List filaments', where: 'renderer', readOnly: true, description: 'Filament library with temperatures, flow, speed limits, price; marks the selected one.', shape: {} },
  { name: 'select_filament', title: 'Select filament', where: 'renderer', description: 'Use this filament for the next slice.', shape: { id: z.string() } },
  { name: 'save_filament', title: 'Create or update filament', where: 'renderer', description: 'Create (no id) or update (id) a filament. Fields: name, brand, material (PLA|PLA-HS|PETG|TPU|ABS|ASA), color (#hex), nozzleTemp, nozzleTempFirstLayer, bedTemp, bedTempFirstLayer, flowRatio, maxVolumetricSpeed, fanMin, fanMax, density, diameter, pricePerKg, notes.', shape: { filament: z.record(z.string(), z.unknown()) } },
  { name: 'delete_filament', title: 'Delete filament', where: 'renderer', description: 'Remove a filament from the library.', shape: { id: z.string() } },
  { name: 'get_machine', title: 'Get printer settings', where: 'main', readOnly: true, description: 'Nozzle, firmware limits, start/end G-code, learned time factor.', shape: {} },
  { name: 'update_machine', title: 'Update printer settings', where: 'renderer', description: 'Patch printer settings: nozzle (0.2|0.4|0.6|0.8), startGcode, endGcode, firmwareModified, limits, timeFactor.', shape: { patch: z.record(z.string(), z.unknown()) } },
  { name: 'set_preferences', title: 'Set preferences', where: 'renderer', description: 'theme (system|light|dark), currency, fileNamePattern.', shape: { patch: z.record(z.string(), z.unknown()) } },

  // ---- slicing + preview
  { name: 'slice', title: 'Slice', where: 'renderer', description: 'Slice the bed with the current settings and wait for the result (time, filament, cost, layers). Switches to preview.', shape: {} },
  { name: 'cancel_slice', title: 'Cancel slice', where: 'renderer', description: 'Stop a running slice.', shape: {} },
  { name: 'get_slice_result', title: 'Slice result', where: 'renderer', readOnly: true, description: 'Status and statistics of the last slice, including the G-code path.', shape: {} },
  { name: 'read_gcode', title: 'Read G-code', where: 'renderer', readOnly: true, description: 'Read lines of the last sliced G-code (fromLine 1-based, count up to 2000) or grep it with `match` (regex, up to 500 hits).', shape: { fromLine: z.number().int().optional(), count: z.number().int().optional(), match: z.string().optional() } },
  { name: 'get_preview_info', title: 'Preview info', where: 'renderer', readOnly: true, description: 'Layer count, Z per layer, visible layer range, feature types with visibility.', shape: {} },
  { name: 'set_layer_range', title: 'Set layer range', where: 'renderer', description: 'Show layers min..max (1-based) in the preview.', shape: { min: z.number().int().optional(), max: z.number().int().optional() } },
  { name: 'set_feature_visible', title: 'Show/hide feature', where: 'renderer', description: 'Toggle a toolpath feature type in the preview (see get_preview_info).', shape: { feature: z.string(), visible: z.boolean() } },

  // ---- output
  { name: 'list_drives', title: 'List SD cards', where: 'main', readOnly: true, description: 'Removable drives; likelyPrinterCard marks the printer\'s card.', shape: {} },
  { name: 'save_to_sd', title: 'Save to SD card', where: 'renderer', description: 'Save the last slice to the printer\'s SD card (the likely card when driveRoot is omitted) and record it in history.', shape: { driveRoot: z.string().optional(), fileName: z.string().optional() } },
  { name: 'save_gcode', title: 'Save G-code to a path', where: 'renderer', description: 'Save the last slice as a .gcode file at an absolute path and record it in history.', shape: { path: z.string() } },
  { name: 'eject_sd', title: 'Eject SD card', where: 'main', description: 'Safely eject the card so it can go into the printer.', shape: { driveRoot: z.string() } },

  // ---- history
  { name: 'list_history', title: 'List history', where: 'main', readOnly: true, description: 'Saved jobs with stats, settings, filament, estimated vs actual time.', shape: {} },
  { name: 'reprint', title: 'Reprint', where: 'renderer', description: 'Reopen a past job (models + settings) on the bed.', shape: { id: z.string() } },
  { name: 'set_actual_time', title: 'Record actual print time', where: 'renderer', description: 'Enter how long the print really took (seconds); FF Print learns a correction for future estimates.', shape: { id: z.string(), seconds: z.number().nullable() } },
  { name: 'delete_job', title: 'Delete job', where: 'renderer', description: 'Remove a job from history.', shape: { id: z.string() } }
]

export const RENDERER_TOOLS = TOOLS.filter((t) => t.where === 'renderer').map((t) => t.name)
