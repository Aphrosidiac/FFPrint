// Checks the INSTALLED, running FF Print through its MCP server, exactly as Claude Code connects.
// Leaves the user's data alone: no settings changes, no saves, history untouched; clears the bed at the end.
// Run: node scripts/installed-check.mjs [model]
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const cfg = JSON.parse(readFileSync(join(process.env.APPDATA, 'FF Print', 'automation.json'), 'utf8'))
const client = new Client({ name: 'installed-check', version: '1' })
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${cfg.port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${cfg.token}` } } }))
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args })
  if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`)
  const c = r.content?.[0]
  return c?.type === 'text' ? JSON.parse(c.text) : c
}
const model = resolve(process.argv[2] ?? 'tests/fixtures/cube20.stl')
const shot = process.env.SHOT ?? join(process.env.TEMP, 'ffprint-installed.png')

const { tools } = await client.listTools()
console.log(`- ${tools.length} tools`)
const before = await call('get_state')
console.log(`- state: page=${before.page} objects=${before.objects.length} filament=${before.filament?.name} settings="${before.settings.summary}"`)
if (before.objects.length) throw new Error('The bed is not empty; not touching the user\'s work.')

await call('navigate', { page: 'workspace', mode: 'prepare' })
const opened = await call('open_models', { paths: [model] })
const id = opened.added[0].id
console.log(`- opened ${opened.added[0].name} ${JSON.stringify(opened.added[0].size)}`)
await call('move_object', { id, x: 80, y: 90 })
await call('rotate_object', { id, rotation: { z: 30 } })
const dup = await call('duplicate_objects', { ids: [id], count: 1 })
assert.equal(dup.total, 2)
await new Promise((r) => setTimeout(r, 400))
const u = await call('undo')
assert.equal(u.objects.length, 1, 'undo removes the duplicate')
const sliced = await call('slice')
assert.equal(sliced.status, 'done')
console.log(`- sliced: ${Math.round(sliced.result.stats.seconds / 60)} min, ${sliced.result.stats.filamentG} g, ${sliced.result.stats.layers} layers, ${(sliced.result.durationMs / 1000).toFixed(1)} s`)
const info = await call('get_preview_info')
console.log(`- preview: ${info.layerCount} layers, ${info.features?.length} feature types`)
assert.ok(info.layerCount > 0, 'preview loaded')
const half = Math.ceil(info.layerCount / 2)
const range = await call('set_layer_range', { max: half })
assert.equal(range.max, half)
await new Promise((r) => setTimeout(r, 600))
const img = await client.callTool({ name: 'screenshot', arguments: {} })
writeFileSync(shot, Buffer.from(img.content[0].data, 'base64'))
console.log(`- screenshot ${shot}`)
const drives = await call('list_drives')
console.log(`- drives: ${drives.map((d) => `${d.root} ${d.label} card=${d.likelyPrinterCard}`).join(', ') || 'none'}`)
await call('clear_bed')
await call('navigate', { mode: 'prepare' })
const after = await call('get_state')
assert.equal(after.objects.length, 0)
assert.equal(after.settings.summary, before.settings.summary, 'settings untouched')
console.log('INSTALLED CHECK PASS')
await client.close()
