import { getDb } from '../_lib/db.js'
import { HttpError, route } from '../_lib/http.js'
import { melbourneInstant } from '../_lib/melbourne.js'
import { publicMode, thin, type Sample, type Units } from '../_lib/telemetry.js'

/**
 * GET /api/public/live — the feed behind beyondstagezero.space.
 *
 * Public, cached for only 2 seconds so live updates reach viewers fast. Contains only
 * test and launch countdowns marked "Shown publicly", their status, stream link, public result
 * and the live updates posted against them in Octopus's .space page — never team notes.
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
          telemetryMode: publicMode(r.data.telemetry),
          result: r.data.result ? String(r.data.result) : null,
          updatedMs: new Date(r.updated_at).getTime(),
        }
      })

    // What's "on": a test marked Live or Hold; otherwise one that finished in the last 12 hours
    // (so people see the result); otherwise the next scheduled one (or one that passed T-0 in the
    // last 6 hours); otherwise one that finished in the last day.
    const active = tests.filter((t) => t.status === 'live' || t.status === 'hold').sort((a, b) => b.updatedMs - a.updatedMs)[0]
    const upcoming = tests
      .filter((t) => t.status === 'scheduled' && t.atMs > now - 6 * H)
      .sort((a, b) => a.atMs - b.atMs)
    const finished = tests
      .filter((t) => t.status === 'done' || t.status === 'scrubbed')
      .sort((a, b) => b.atMs - a.atMs)
    const finishedWithin = (hours: number) => finished.find((t) => now - t.updatedMs < hours * H)
    const current = active ?? finishedWithin(12) ?? upcoming[0] ?? finishedWithin(24) ?? null

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
      const { atMs: _a, updatedMs: _u, telemetryMode: _m, ...rest } = t
      void _a
      void _u
      void _m
      return rest
    }

    // Sensor data (e.g. chamber pressure) for the current test, held back by the chosen delay.
    let telemetry: Record<string, unknown> | null = null
    const mode = current?.telemetryMode
    const over = current?.status === 'done' || current?.status === 'scrubbed'
    if (current && mode !== undefined && mode !== 'off' && (mode !== 'after' || over)) {
      const cutoff = over || mode === 'after' ? Infinity : now - (mode as number) * 1000
      const tRows = await db.query<{ samples: Sample[] | string; units: Units | string | null }>(
        'select samples, units from telemetry where test_id = $1 and t0 <= $2 order by id',
        [current.id, Number.isFinite(cutoff) ? cutoff : Number.MAX_SAFE_INTEGER],
      )
      const parse = <T,>(v: T | string): T => (typeof v === 'string' ? (JSON.parse(v) as T) : v)
      const samples: Sample[] = []
      let units: Units = {}
      for (const r of tRows) {
        for (const smp of parse(r.samples)) if (smp.t <= cutoff) samples.push(smp)
        if (r.units) units = { ...units, ...parse(r.units) }
      }
      samples.sort((a, b) => a.t - b.t)
      if (samples.length) {
        const channels = [...new Set(samples.flatMap((smp) => Object.keys(smp).filter((k) => k !== 't')))].sort((a, b) =>
          a === 'chamber' ? -1 : b === 'chamber' ? 1 : a.localeCompare(b),
        )
        const peak: Record<string, number> = {}
        for (const smp of samples) for (const c of channels) if (c in smp && (peak[c] === undefined || smp[c] > peak[c])) peak[c] = smp[c]
        const last = samples[samples.length - 1]
        telemetry = {
          channels,
          units,
          delay: over ? 0 : mode,
          receiving: !over && Number.isFinite(cutoff) && cutoff - last.t < 10_000,
          points: thin(samples, channels),
          latest: [last.t, ...channels.map((c) => (c in last ? last[c] : null))],
          peak,
        }
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    // Cached at the edge for 2 seconds at most, so however many people watch, the database sees ~1 query every
    // 2 seconds per region and updates reach viewers within a couple of seconds.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=2')
    res.status(200).json({
      updatedAt: new Date(now).toISOString(),
      current: current ? { ...clean(current), updates, telemetry } : null,
      next: upcoming.filter((t) => t.id !== current?.id).slice(0, 3).map(clean),
      recent: finished.filter((t) => t.id !== current?.id).slice(0, 5).map(clean),
    })
  },
})
