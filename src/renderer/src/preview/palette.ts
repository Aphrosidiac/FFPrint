// The preview's feature palette: the only colours FF Print defines outside styles/tokens.css.
// Neutral and distinct, not loud: walls warm, infill muted, solid layers cool, supports grey,
// adhesion green, travel a thin light blue. Same values in light and dark themes (mid-tones that
// read on both viewport backgrounds).

export interface FeatureStyle {
  label: string
  color: string
  /** legend order */
  order: number
}

const STYLES: Record<string, FeatureStyle> = {
  'Outer wall': { label: 'Outer wall', color: '#e08a3c', order: 1 },
  'Inner wall': { label: 'Inner wall', color: '#e3bb5c', order: 2 },
  'Overhang wall': { label: 'Overhang wall', color: '#c2553f', order: 3 },
  'Sparse infill': { label: 'Sparse infill', color: '#a5625b', order: 4 },
  'Internal solid infill': { label: 'Solid infill', color: '#8a6ca8', order: 5 },
  'Top surface': { label: 'Top surface', color: '#d9675f', order: 6 },
  'Bottom surface': { label: 'Bottom surface', color: '#6e8fb0', order: 7 },
  Bridge: { label: 'Bridge', color: '#4f9c9a', order: 8 },
  'Internal Bridge': { label: 'Internal bridge', color: '#7cb3ab', order: 9 },
  'Gap infill': { label: 'Gap infill', color: '#cfc8b8', order: 10 },
  Ironing: { label: 'Ironing', color: '#c79abd', order: 11 },
  Support: { label: 'Support', color: '#9aa0a6', order: 12 },
  'Support interface': { label: 'Support interface', color: '#737b83', order: 13 },
  'Support transition': { label: 'Support transition', color: '#858c93', order: 14 },
  Skirt: { label: 'Skirt', color: '#8eab7b', order: 15 },
  Brim: { label: 'Brim', color: '#6f9877', order: 16 },
  'Prime tower': { label: 'Prime tower', color: '#a7a39a', order: 17 },
  Custom: { label: 'Start / end', color: '#8a8f99', order: 18 }
}

export const TRAVEL_COLOR = '#7eb6e8'
const FALLBACK = '#9a9a9a'

export function featureStyle(type: string): FeatureStyle {
  return STYLES[type] ?? { label: type, color: FALLBACK, order: 50 }
}
