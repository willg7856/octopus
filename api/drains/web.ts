import { createHmac, timingSafeEqual } from 'node:crypto'
import { DbUnavailableError, getDb } from '../_lib/db.js'

/**
 * POST /api/drains/web — receives Vercel Web Analytics events (a Vercel "Drain").
 *
 * Set up in Vercel → Team Settings → Drains → Add Drain:
 *   data: Web Analytics · project: the public website · format: JSON
 *   endpoint: https://ops.beyondstagezero.com/api/drains/web
 * Copy the drain's signing secret into VERCEL_DRAIN_SECRET on the Octopus project.
 * If Vercel asks you to verify the endpoint, put the value it shows in VERCEL_DRAIN_VERIFY.
 *
 * Only page views are stored: time, host, path, referrer host, country, device type and the
 * anonymous session/device ids Vercel provides. No IPs, no personal data.
 */

function verify(body: string, signature: string | undefined): boolean {
  const secret = process.env.VERCEL_DRAIN_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production' // allow unsigned only in local dev
  if (!signature) return false
  const expected = createHmac('sha1', secret).update(body).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

type Ev = Record<string, unknown>

function parse(body: string): Ev[] {
  const t = body.trim()
  if (!t) return []
  if (t.startsWith('[')) return JSON.parse(t) as Ev[]
  // NDJSON
  return t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Ev)
}

const str = (v: unknown, max = 300) => (typeof v === 'string' && v ? v.slice(0, max) : null)

function refHost(r: unknown): string | null {
  const s = str(r, 500)
  if (!s) return null
  try {
    return new URL(s).host.replace(/^www\./, '')
  } catch {
    return s.slice(0, 120)
  }
}

function reply(status: number, body: unknown): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  if (process.env.VERCEL_DRAIN_VERIFY) headers.set('x-vercel-verify', process.env.VERCEL_DRAIN_VERIFY)
  return new Response(JSON.stringify(body), { status, headers })
}

// Web-standard handlers (not the (req, res) style) so the exact raw body is available for the signature check.

/** Vercel may ping the endpoint to verify ownership. */
export function GET(): Response {
  return reply(200, { ok: true })
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text()
    if (!verify(body, request.headers.get('x-vercel-signature') ?? undefined)) return reply(403, { error: 'Bad signature' })

    let events: Ev[]
    try {
      events = parse(body)
    } catch {
      return reply(400, { error: 'Expected JSON or NDJSON' })
    }
    const views = events.filter((e) => (e.eventType ?? 'pageview') === 'pageview' && (e.path || e.route))
    if (!views.length) return reply(200, { ok: true, stored: 0 })

    const cols: unknown[][] = [[], [], [], [], [], [], [], [], []]
    for (const e of views.slice(0, 5000)) {
      const ts = Number(e.timestamp)
      cols[0]!.push(new Date(Number.isFinite(ts) && ts > 0 ? ts : Date.now()).toISOString())
      cols[1]!.push(refHost(e.origin) ?? str(e.host))
      cols[2]!.push(str(e.path) ?? str(e.route))
      cols[3]!.push(refHost(e.referrer))
      cols[4]!.push(str(e.country, 8))
      cols[5]!.push(str(e.deviceType, 20))
      cols[6]!.push(e.sessionId != null ? String(e.sessionId).slice(0, 64) : null)
      cols[7]!.push(e.deviceId != null ? String(e.deviceId).slice(0, 64) : null)
      cols[8]!.push(str(e.projectId, 64))
    }
    const db = await getDb()
    await db.query(
      `insert into web_events (at, host, path, referrer, country, device, session, visitor, project_id)
       select * from unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])`,
      cols,
    )
    // Keep about 13 months.
    if (Math.random() < 0.02) await db.query(`delete from web_events where at < now() - interval '400 days'`)
    return reply(200, { ok: true, stored: cols[0]!.length })
  } catch (err) {
    if (err instanceof DbUnavailableError) return reply(503, { error: err.message })
    console.error(err)
    return reply(500, { error: 'Server error' })
  }
}
