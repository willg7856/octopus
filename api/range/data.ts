import { requireAdmin, requireUser } from '../_lib/auth.js'
import { getDb } from '../_lib/db.js'
import { HttpError, q, route } from '../_lib/http.js'
import type { Sample, Units } from '../_lib/telemetry.js'

/**
 * GET    /api/range/data?test=ID[&after=CURSOR] → the test's sensor readings (team only, no delay).
 *        Poll with the returned cursor to get only what's new.
 * DELETE /api/range/data?test=ID               → wipe a test's readings (admins; e.g. after a dry run).
 */
export default route({
  async GET(req, res) {
    await requireUser(req)
    const test = q(req, 'test')
    if (!test) throw new HttpError(400, 'test is required')
    const afterRaw = q(req, 'after')
    const after = afterRaw && /^\d+$/.test(afterRaw) ? afterRaw : '0'
    const db = await getDb()
    const rows = await db.query<{ id: string; samples: Sample[] | string; units: Units | string | null }>(
      'select id, samples, units from telemetry where test_id = $1 and id > $2 order by id limit 5000',
      [test, after],
    )
    const parse = <T>(v: T | string): T => (typeof v === 'string' ? (JSON.parse(v) as T) : v)
    const samples: Sample[] = []
    let units: Units | null = null
    for (const r of rows) {
      samples.push(...parse(r.samples))
      if (r.units) units = parse(r.units)
    }
    samples.sort((a, b) => a.t - b.t)
    res.status(200).json({
      cursor: rows.length ? String(rows[rows.length - 1].id) : after,
      more: rows.length === 5000,
      samples,
      units,
    })
  },
  async DELETE(req, res) {
    await requireAdmin(req)
    const test = q(req, 'test')
    if (!test) throw new HttpError(400, 'test is required')
    const db = await getDb()
    const gone = await db.query<{ id: string }>('delete from telemetry where test_id = $1 returning id', [test])
    res.status(200).json({ ok: true, deleted: gone.length })
  },
})
