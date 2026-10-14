// Reading the engine's output: print statistics from the G-code footer, and file names that the
// printer's SD menu shows cleanly.

export interface GcodeFooterStats {
  estimateSeconds: number
  filamentMm: number
  filamentCm3: number
  filamentG: number
  filamentCost: number
  layers: number
  maxZ: number
}

/** "1d 2h 3m 4s" / "16m 9s" -> seconds */
export function parseDuration(text: string): number {
  let total = 0
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) {
    const v = parseFloat(m[1])
    total += m[2] === 'd' ? v * 86400 : m[2] === 'h' ? v * 3600 : m[2] === 'm' ? v * 60 : v
  }
  return total
}

/** Stats live in the header (;TIME:) and in the footer comments; only the ends of the file are scanned. */
export function parseStats(gcode: string): GcodeFooterStats {
  const head = gcode.slice(0, 4000)
  const tail = gcode.slice(Math.max(0, gcode.length - 400_000))
  const pick = (re: RegExp, src = tail): number => {
    const m = src.match(re)
    return m ? parseFloat(m[1]) : 0
  }
  const timeHeader = pick(/^;TIME:([\d.]+)/m, head)
  const normal = tail.match(/^; estimated printing time \(normal mode\) = (.+)$/m)
  const layers = pick(/^; total layer number: (\d+)/m, head) || pick(/^; total layers count = (\d+)/m)
  return {
    estimateSeconds: timeHeader || (normal ? parseDuration(normal[1]) : 0),
    filamentMm: pick(/^; filament used \[mm\] = ([\d.]+)/m),
    filamentCm3: pick(/^; filament used \[cm3\] = ([\d.]+)/m),
    filamentG: pick(/^; (?:total )?filament used \[g\] = ([\d.]+)/m),
    filamentCost: pick(/^; (?:total )?filament cost = ([\d.]+)/m),
    layers,
    maxZ: pick(/^; max_z_height: ([\d.]+)/m, head)
  }
}

/**
 * Printer-friendly file name: ASCII letters, digits, dash and underscore, no spaces, <= 48 chars
 * before ".gcode". Avoids anything the stock SD browser renders badly. Never ends in .bin (a .bin
 * in the card root is flashed as firmware on boot).
 */
export function safeFileName(base: string): string {
  const cleaned = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.(gcode|stl|obj|3mf|bin)$/i, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 48)
  return `${cleaned || 'print'}.gcode`
}

/** foo.gcode -> foo_2.gcode, foo_3.gcode ... until `exists` says no. */
export function dedupeName(fileName: string, exists: (name: string) => boolean): string {
  if (!exists(fileName)) return fileName
  const stem = fileName.replace(/\.gcode$/i, '')
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem}_${i}.gcode`
    if (!exists(candidate)) return candidate
  }
  return `${stem}_${Date.now()}.gcode`
}

/** Fills `{name}` `{quality}` `{material}` `{date}` in the user's file-name pattern. */
export function applyPattern(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '')
}
