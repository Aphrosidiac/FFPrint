// Local automation server: MCP over Streamable HTTP on 127.0.0.1, guarded by a bearer token stored in
// userData/automation.json. Claude Code connects with:
//   claude mcp add --transport http ff-print http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
// Stateless: each POST gets a fresh McpServer + transport, so app restarts never strand a session.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { BrowserWindow } from 'electron'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ENGINE_VERSION } from '../engine/paths'
import { getHistory } from '../history'
import { getMachine, getPrefs } from '../library'
import { ejectDrive, listDrives, setVolumeHint } from '../sd'
import { readDoc, writeDoc } from '../store'
import { callRenderer } from './bridge'
import { SERVER_INSTRUCTIONS, TOOLS, type ToolSpec } from './tools'

export interface AutomationConfig {
  enabled: boolean
  port: number
  token: string
}

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

let server: Server | null = null
let activePort = 0

export function automationConfig(): AutomationConfig {
  const cfg = readDoc<Partial<AutomationConfig>>('automation', () => ({}))
  const full: AutomationConfig = { enabled: cfg.enabled ?? true, port: cfg.port ?? 7830, token: cfg.token ?? randomBytes(24).toString('base64url') }
  if (!cfg.token) writeDoc('automation', full)
  return full
}

export function automationStatus(): AutomationConfig & { running: boolean; url: string; command: string } {
  const cfg = automationConfig()
  const port = activePort || cfg.port
  const url = `http://127.0.0.1:${port}/mcp`
  return { ...cfg, port, running: !!server, url, command: `claude mcp add --transport http ff-print ${url} --header "Authorization: Bearer ${cfg.token}"` }
}

const text = (v: unknown): Content[] => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }]

async function runMain(name: string, args: Record<string, unknown>, win: BrowserWindow | null): Promise<Content[]> {
  switch (name) {
    case 'screenshot': {
      if (!win || win.isDestroyed()) throw new Error('The FF Print window is not open.')
      const img = await win.webContents.capturePage()
      return [{ type: 'image', data: img.toPNG().toString('base64'), mimeType: 'image/png' }]
    }
    case 'list_recent':
      return text(getPrefs().recent)
    case 'get_machine':
      return text(getMachine())
    case 'list_drives':
      setVolumeHint(getPrefs().sdVolumeHint)
      return text(await listDrives())
    case 'eject_sd':
      return text(await ejectDrive(String(args.driveRoot)))
    case 'list_history':
      return text(getHistory().map(({ thumbnail: _t, ...h }) => h))
    default:
      throw new Error(`No main-process handler for ${name}`)
  }
}

function buildMcp(win: () => BrowserWindow | null): McpServer {
  const mcp = new McpServer({ name: 'ff-print', title: 'FF Print', version: ENGINE_VERSION }, { instructions: SERVER_INSTRUCTIONS })
  const register = mcp.registerTool.bind(mcp) as unknown as (
    name: string,
    config: { title: string; description: string; inputSchema: ToolSpec['shape']; annotations: Record<string, boolean> },
    cb: (args: Record<string, unknown>) => Promise<{ content: Content[]; isError?: boolean }>
  ) => void
  for (const spec of TOOLS) {
    register(spec.name, { title: spec.title, description: spec.description, inputSchema: spec.shape, annotations: { readOnlyHint: !!spec.readOnly, openWorldHint: false } }, async (args) => {
      try {
        if (spec.where === 'main') return { content: await runMain(spec.name, args ?? {}, win()) }
        const result = await callRenderer(win(), spec.name, args ?? {})
        return { content: text(result ?? { ok: true }) }
      } catch (e) {
        return { isError: true, content: text((e as Error).message) }
      }
    })
  }
  return mcp
}

function authorised(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? ''
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : undefined
}

export function startAutomation(win: () => BrowserWindow | null): void {
  const cfg = automationConfig()
  if (!cfg.enabled || server) return
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Browsers on other sites must not drive the app: refuse any request carrying an Origin.
    if (req.headers.origin) {
      res.writeHead(403).end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, app: 'ff-print' }))
      return
    }
    if (url.pathname !== '/mcp') {
      res.writeHead(404).end()
      return
    }
    if (!authorised(req, cfg.token)) {
      res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Missing or wrong bearer token (see FF Print > Printer > Automation).' }))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end()
      return
    }
    try {
      const body = await readBody(req)
      const mcp = buildMcp(win)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => {
        transport.close()
        mcp.close()
      })
      await mcp.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }))
    }
  }

  const tryListen = (port: number, attempts: number): void => {
    const s = createServer((req, res) => void handler(req, res))
    s.once('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE' && attempts > 0) tryListen(port + 1, attempts - 1)
      else console.error('[automation] could not start:', e.message)
    })
    s.listen(port, '127.0.0.1', () => {
      server = s
      activePort = port
      console.log(`[automation] MCP on http://127.0.0.1:${port}/mcp`)
    })
  }
  tryListen(Number(process.env.FFPRINT_AUTOMATION_PORT) || cfg.port, 10)
}

export function stopAutomation(): void {
  server?.close()
  server = null
  activePort = 0
}
