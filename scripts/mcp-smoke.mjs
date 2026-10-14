// Drives the BUILT app through its MCP server exactly like Claude Code would.
// Run: pnpm build && node scripts/mcp-smoke.mjs
import { _electron as electron } from 'playwright-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = mkdtempSync(join(tmpdir(), 'ffprint-mcp-'))
const port = 7931
const app = await electron.launch({ args: [resolve('out/main/index.js')], env: { ...process.env, FFPRINT_DATA_DIR: dataDir, FFPRINT_AUTOMATION_PORT: String(port) } })
const page = await app.firstWindow()
await page.waitForFunction(() => window.__ff?.app?.ready, null, { timeout: 20000 })
const { token } = JSON.parse(readFileSync(join(dataDir, 'automation.json'), 'utf8'))

const call = async (client, name, args = {}) => {
  const r = await client.callTool({ name, arguments: args })
  if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`)
  const c = r.content?.[0]
  return c?.type === 'text' ? JSON.parse(c.text) : c
}

try {
  // wrong token is refused
  const bad = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { authorization: 'Bearer nope', 'content-type': 'application/json' }, body: '{}' })
  assert.equal(bad.status, 401)

  const client = new Client({ name: 'smoke', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }))
  const { tools } = await client.listTools()
  console.log(`- ${tools.length} tools`)
  assert.ok(tools.length >= 45)

  const opened = await call(client, 'open_models', { paths: [resolve('tests/fixtures/cube20.stl')] })
  const id = opened.added[0].id
  console.log('- opened', opened.added[0].name, opened.added[0].size)
  await call(client, 'move_object', { id, x: 60, y: 70 })
  const rot = await call(client, 'rotate_object', { id, rotation: { z: 45 } })
  assert.equal(rot.rotation.z, 45)
  const sc = await call(client, 'scale_object', { id, sizeMm: { z: 30 } })
  assert.ok(Math.abs(sc.size.z - 30) < 0.05)
  await call(client, 'duplicate_objects', { ids: [id], count: 2 })
  const objs = await call(client, 'list_objects')
  assert.equal(objs.length, 3)
  await call(client, 'set_print_settings', { quality: 'draft', strength: 'strong', supports: 'off', adhesion: 'brim' })
  await call(client, 'set_setting', { key: 'outer_wall_speed', value: 40 })
  const fil = (await call(client, 'list_filaments')).find((f) => f.name === 'Hyper PLA')
  await call(client, 'select_filament', { id: fil.id })
  const sliced = await call(client, 'slice')
  console.log('- sliced', sliced.result.stats)
  assert.equal(sliced.status, 'done')
  const grep = await call(client, 'read_gcode', { match: '^; (outer_wall_speed|wall_loops|brim_type|layer_height) =' })
  console.log('- config', grep.hits.map((h) => h.text).join(' | '))
  assert.ok(grep.hits.some((h) => h.text === '; outer_wall_speed = 40'))
  assert.ok(grep.hits.some((h) => h.text === '; wall_loops = 4'))
  const out = join(dataDir, 'smoke.gcode')
  await call(client, 'save_gcode', { path: out })
  assert.ok(existsSync(out))
  const hist = await call(client, 'list_history')
  assert.equal(hist.length, 1)
  const shot = await client.callTool({ name: 'screenshot', arguments: {} })
  assert.equal(shot.content[0].type, 'image')
  writeFileSync(join(dataDir, 'shot.png'), Buffer.from(shot.content[0].data, 'base64'))
  const state = await call(client, 'get_state')
  console.log('- state', state.page, state.mode, state.settings.summary)
  console.log('MCP SMOKE PASS', join(dataDir, 'shot.png'))
} catch (e) {
  console.error('MCP SMOKE FAIL:', e.message)
  process.exitCode = 1
} finally {
  await app.close()
}
