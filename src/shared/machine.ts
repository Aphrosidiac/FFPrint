// The one machine FF Print serves. Values come from Creality's published V3 SE firmware source
// (V1.0.6, CR4NS200320C13) and OrcaSlicer's official V3 SE profile — see docs/PLAN.md §2.

export const MACHINE = {
  name: 'Creality Ender-3 V3 SE',
  bed: { x: 220, y: 220 },
  maxZ: 250,
  /** Purge lines run at X -2.1/-2.4; objects must stay clear of them. */
  purgeKeepout: { xMax: 3 },
  nozzles: ['0.2', '0.4', '0.6', '0.8'] as const,
  /** Firmware limits (M201/M203/M204/M205) — slicing never asks for more than this. */
  limits: {
    accelX: 2500,
    accelY: 2500,
    accelZ: 500,
    accelE: 5000,
    accelExtruding: 2500,
    accelRetracting: 500,
    accelTravel: 2500,
    speedX: 250,
    speedY: 250,
    speedZ: 5,
    speedE: 40,
    junctionDeviation: 0.1
  },
  maxNozzleTemp: 260,
  maxBedTemp: 100
} as const

export type Nozzle = (typeof MACHINE.nozzles)[number]
export type MachineLimits = { -readonly [K in keyof typeof MACHINE.limits]: number }

/**
 * Start G-code. Differs from Creality/Orca's in two places:
 * - `M82` before the purge: the purge uses absolute E values, and a cancelled print can leave the
 *   printer in relative mode, which turns the 15+15 mm purge into 15+30 mm.
 * - Z moves at F300: the firmware caps Z at 5 mm/s anyway.
 * No G29/M420 (the firmware re-enables the saved mesh after G28) and no M8015 (auto Z-offset is a
 * screen routine, never part of a print). Orca appends G90 + M83 after this block.
 */
export const DEFAULT_START_GCODE = `; FF Print start — Ender-3 V3 SE
M220 S100 ; reset speed factor
M221 S100 ; reset flow factor
M104 S[nozzle_temperature_initial_layer] ; start heating the nozzle
M190 S[bed_temperature_initial_layer_single] ; wait for the bed
G28 ; home (firmware restores the saved bed mesh)
G90 ; absolute positioning
M82 ; absolute extrusion for the purge line
G92 E0
G1 Z2.0 F300
G1 X-2.1 Y20 Z0.28 F5000
M109 S[nozzle_temperature_initial_layer] ; wait for the nozzle
G1 X-2.1 Y145.0 Z0.28 F1500 E15 ; purge line 1
G1 X-2.4 Y145.0 Z0.28 F5000
G1 X-2.4 Y20 Z0.28 F1500 E30 ; purge line 2
G92 E0
G1 E-1.0 F1800 ; retract
G1 Z2.0 F300
G1 E0 F1800`

export const DEFAULT_END_GCODE = `; FF Print end
G91 ; relative positioning
G1 E-2 F2700 ; retract
G1 E-2 Z0.2 F2400 ; retract and lift
G1 X5 Y5 F3000 ; wipe
G1 Z10 F300 ; lift clear of the print
G90 ; absolute positioning
G1 X0 Y220 F3000 ; present the print
M106 S0 ; part fan off
M104 S0 ; nozzle off
M140 S0 ; bed off
M84 X Y E ; motors off except Z`
