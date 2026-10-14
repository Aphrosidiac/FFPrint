// Every renderer tool the MCP server advertises must have a handler in the window, and vice versa.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RENDERER_TOOLS, TOOLS } from '../src/main/automation/tools'

const source = readFileSync('src/renderer/src/automation.ts', 'utf8')
const block = source.slice(source.indexOf('const handlers'), source.indexOf('export const AUTOMATION_COMMANDS'))
const handlerNames = [...block.matchAll(/^  ([a-z_]+): /gm)].map((m) => m[1])

describe('automation surface', () => {
  it('has a renderer handler for every renderer tool', () => {
    expect(RENDERER_TOOLS.filter((t) => !handlerNames.includes(t))).toEqual([])
  })
  it('advertises every renderer handler as a tool', () => {
    const names = TOOLS.map((t) => t.name)
    expect(handlerNames.filter((h) => !names.includes(h))).toEqual([])
  })
  it('has unique tool names and descriptions', () => {
    const names = TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const t of TOOLS) expect(t.description.length).toBeGreaterThan(10)
  })
})
