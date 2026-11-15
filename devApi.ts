import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Serves the Vercel functions in /api from the Vite dev server, so `npm run dev`
 * gives you the full app (with an embedded local database) and no Vercel CLI.
 */
export function devApi(): Plugin {
  return {
    name: 'octopus-dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()
        const file = path.join(server.config.root, `${url.pathname.replace(/\/$/, '')}.ts`)
        if (url.pathname.includes('/_lib') || !fs.existsSync(file)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Not found' }))
          return
        }
        try {
          const mod = await server.ssrLoadModule(file)
          const body = await readBody(req)
          const r = req as IncomingMessage & { query: Record<string, string>; body?: unknown }
          r.query = Object.fromEntries(url.searchParams)
          if (body) {
            try {
              r.body = JSON.parse(body)
            } catch {
              r.body = body
            }
          }
          const s = res as ServerResponse & {
            status: (c: number) => typeof s
            json: (b: unknown) => typeof s
          }
          s.status = (c) => {
            s.statusCode = c
            return s
          }
          s.json = (b) => {
            s.setHeader('Content-Type', 'application/json')
            s.end(JSON.stringify(b))
            return s
          }
          await mod.default(r, s)
        } catch (err) {
          server.ssrFixStacktrace(err as Error)
          console.error(err)
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}
