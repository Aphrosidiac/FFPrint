// Viewport colours come from the design tokens (styles/tokens.css) so the 3D view follows the theme.
// Object shades are mixes of existing tokens rather than new colours.

import { Color } from 'three'

export interface ViewColors {
  background: Color
  bed: Color
  grid: Color
  gridMajor: Color
  edge: Color
  accent: Color
  danger: Color
  success: Color
  object: Color
  objectSelected: Color
  objectDanger: Color
  /** the physical plate (rim, grip tab) and the PEI print surface */
  plateFrame: Color
  plateSurface: Color
  plateMarks: Color
  plateGrid: Color
  plateEdge: Color
  dark: boolean
}

/**
 * The only colours not taken from tokens.css: the build plate is a physical object (a dark textured
 * PEI sheet), so it keeps a dark grey in both themes, a step lighter in the light theme.
 */
const PLATE = {
  light: { surface: '#55585e', frame: '#74777d' },
  dark: { surface: '#2a2c30', frame: '#3b3e43' }
}

function token(name: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const c = new Color()
  try {
    c.setStyle(v || '#888888')
  } catch {
    c.set('#888888')
  }
  return c
}

const mix = (a: Color, b: Color, t: number): Color => a.clone().lerp(b, t)

/** Mix in sRGB (perceptual) space, for tints that should look evenly spaced. */
const mixSrgb = (a: Color, b: Color, t: number): Color =>
  a.clone().convertLinearToSRGB().lerp(b.clone().convertLinearToSRGB(), t).convertSRGBToLinear()

export function readColors(): ViewColors {
  const dark = document.documentElement.dataset.theme === 'dark'
  const bed = token('--bed')
  const grid = token('--bed-grid')
  const edge = token('--bed-edge')
  const accent = token('--accent')
  const danger = token('--danger')
  const surface = token('--surface')
  // A light grey-blue in both themes (the plate is dark in both): a light neutral token nudged
  // toward the accent.
  const object = dark ? mixSrgb(token('--text-2'), accent, 0.14) : mixSrgb(mixSrgb(edge, surface, 0.4), accent, 0.12)
  const plate = PLATE[dark ? 'dark' : 'light']
  const plateSurface = new Color(plate.surface)
  const white = new Color('#ffffff')
  return {
    plateFrame: new Color(plate.frame),
    plateSurface,
    plateMarks: mixSrgb(plateSurface, white, dark ? 0.62 : 0.72),
    plateGrid: mixSrgb(plateSurface, white, dark ? 0.1 : 0.12),
    plateEdge: mixSrgb(plateSurface, white, dark ? 0.3 : 0.38),
    background: token('--viewport-bg'),
    bed,
    grid,
    gridMajor: mix(grid, edge, 0.45),
    edge,
    accent,
    danger,
    success: token('--success'),
    object,
    objectSelected: mixSrgb(object, accent, 0.45),
    objectDanger: mixSrgb(object, danger, 0.55),
    dark
  }
}
