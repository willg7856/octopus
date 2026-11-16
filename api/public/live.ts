import { getDb } from '../_lib/db.js'
import { HttpError, route } from '../_lib/http.js'
import { melbourneInstant } from '../_lib/melbourne.js'

/**
 * GET /api/public/live — the feed behind beyondstagezero.space.
 *
 * Public, cached for only a few seconds so live updates reach viewers fast. Contains only
 * test and launch countdowns marked "Shown publicly", their status, stream link, public result
 * and the live updates posted against them in Octopus's Test day page — never team notes.
 */

interface Row {
  id: string
  type: string
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

const H = 3_600_000

export default route({
  async GET(_req, res) {
    if ((process.env.PUBLIC_STATS || '').toLowerCase() === 'off') throw new HttpError(404, 'Not found')
    const db = await getDb()
    const rows = await db.query<Row>(
      `select id, type, data, created_at, updated_at from records
       where deleted_at is null and (type = 'liveupdate' or (type = 'countdown'
         and data->>'public' = 'shown' and data->>'category' in ('test', 'launch')))`,
    )
    const now = Date.now()
    const tests = rows
      .filter((r) => r.type === 'countdown' && r.data.name && r.data.date)
      .map((r) => {
        const at = melbourneInstant(String(r.data.date), r.data.time)
        return {
          id: r.id,
          name: String(r.data.name),
          kind: String(r.data.category),
          date: String(r.data.date),
          time: r.data.time ? String(r.data.time) : null,
          at: new Date(at).toISOString(),
          atMs: at,
          status: String(r.data.status || 'scheduled'),
          stream: r.data.stream ? String(r.data.stream) : null,
          result: r.data.result ? String(r.data.result) : null,
          updatedMs: new Date(r.updated_at).getTime(),
        }
      })

    // What's "on": a test marked Live or Hold; otherwise the next scheduled one (or one that
    // just passed T-0 in the last 6 hours); otherwise one completed or scrubbed in the last day.
    const active = tests.filter((t) => t.status === 'live' || t.status === 'hold').sort((a, b) => b.updatedMs - a.updatedMs)[0]
    const upcoming = tests
      .filter((t) => t.status === 'scheduled' && t.atMs > now - 6 * H)
      .sort((a, b) => a.atMs - b.atMs)
    const finished = tests
      .filter((t) => t.status === 'done' || t.status === 'scrubbed')
      .sort((a, b) => b.atMs - a.atMs)
    const current = active ?? upcoming[0] ?? finished.find((t) => now - Math.max(t.atMs, t.updatedMs) < 24 * H) ?? null

    const updates = current
      ? rows
          .filter((r) => r.type === 'liveupdate' && r.data.test === current.id && r.data.text)
          .map((r) => ({
            at: new Date(r.created_at).toISOString(),
            text: String(r.data.text),
            kind: String(r.data.kind || 'update'),
          }))
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 200)
      : []

    const clean = (t: (typeof tests)[number]) => {
      const { atMs: _a, updatedMs: _u, ...rest } = t
      void _a
      void _u
      return rest
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10')
    res.status(200).json({
      updatedAt: new Date(now).toISOString(),
      current: current ? { ...clean(current), updates } : null,
      next: upcoming.filter((t) => t.id !== current?.id).slice(0, 3).map(clean),
      recent: finished.filter((t) => t.id !== current?.id).slice(0, 5).map(clean),
    })
  },
})
