// The learned time factor: median of actual / estimate over the last 10 jobs with a real time.
import { describe, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '@shared/types'

vi.mock('electron', () => ({ BrowserWindow: {}, dialog: {}, app: {}, shell: {} }))
const { learnTimeFactor } = await import('../src/main/history')

const job = (estimate: number, actual: number | null): HistoryEntry =>
  ({ stats: { estimateSeconds: estimate, seconds: estimate, filamentMm: 0, filamentCm3: 0, filamentG: 0, cost: 0, layers: 0, maxZ: 0 }, actualSeconds: actual }) as HistoryEntry

describe('learnTimeFactor', () => {
  it('is 1 with no real times', () => {
    expect(learnTimeFactor([])).toBe(1)
    expect(learnTimeFactor([job(3600, null)])).toBe(1)
  })
  it('takes the median ratio (odd and even counts)', () => {
    expect(learnTimeFactor([job(100, 110), job(100, 105), job(100, 120)])).toBe(1.1)
    expect(learnTimeFactor([job(100, 110), job(100, 120)])).toBe(1.15)
  })
  it('ignores absurd ratios (a forgotten timer) and jobs without an estimate', () => {
    expect(learnTimeFactor([job(100, 110), job(100, 900), job(0, 50), job(100, 108)])).toBe(1.09)
  })
  it('only looks at the 10 most recent jobs with a real time', () => {
    const recent = Array.from({ length: 10 }, () => job(100, 120))
    const old = Array.from({ length: 20 }, () => job(100, 90))
    expect(learnTimeFactor([...recent, ...old])).toBe(1.2)
  })
})
