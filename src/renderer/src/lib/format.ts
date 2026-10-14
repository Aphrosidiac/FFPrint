export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m`
  return `${s}s`
}

export function grams(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g.toFixed(g < 10 ? 1 : 0)} g`
}

export function meters(mm: number): string {
  return `${(mm / 1000).toFixed(2)} m`
}

export function money(v: number, currency = 'RM'): string {
  return `${currency} ${v.toFixed(2)}`
}

export function mm(v: number, digits = 1): string {
  return `${v.toFixed(digits)} mm`
}

export function bytes(n: number): string {
  if (n >= 2 ** 30) return `${(n / 2 ** 30).toFixed(1)} GB`
  if (n >= 2 ** 20) return `${(n / 2 ** 20).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

export function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
