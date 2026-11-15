import type { IncomingMessage, ServerResponse } from 'node:http'
import { DbUnavailableError } from './db.js'

/** Minimal request/response shape shared by Vercel functions and the local dev server. */
export interface Req extends IncomingMessage {
  query: Record<string, string | string[] | undefined>
  body?: unknown
  cookies?: Record<string, string>
}

export interface Res extends ServerResponse {
  status(code: number): Res
  json(body: unknown): Res
}

export class HttpError extends Error {
  status: number
  extra?: Record<string, unknown>
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export function q(req: Req, key: string): string | undefined {
  const v = req.query?.[key]
  return Array.isArray(v) ? v[0] : v
}

export function body<T = Record<string, unknown>>(req: Req): T {
  let b = req.body
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b)
    } catch {
      throw new HttpError(400, 'Invalid JSON body')
    }
  }
  if (!b || typeof b !== 'object') throw new HttpError(400, 'Expected a JSON body')
  return b as T
}

type Handler = (req: Req, res: Res) => Promise<unknown>

/** Wraps a handler with JSON error handling and method routing. */
export function route(methods: Partial<Record<string, Handler>>) {
  return async (req: Req, res: Res) => {
    res.setHeader('Cache-Control', 'no-store')
    const fn = methods[req.method ?? 'GET']
    try {
      if (!fn) throw new HttpError(405, `Method ${req.method} not allowed`)
      await fn(req, res)
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message, ...err.extra })
      } else if (err instanceof DbUnavailableError) {
        res.status(503).json({ error: err.message, code: 'db_unavailable' })
      } else {
        console.error(err)
        res.status(500).json({ error: 'Server error. Nothing was saved — try again.' })
      }
    }
  }
}
