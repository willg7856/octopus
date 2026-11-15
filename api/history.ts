import { requireUser } from './_lib/auth.js'
import { getDb } from './_lib/db.js'
import { q, route } from './_lib/http.js'

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString())

/**
 * GET /api/history?record=ID   → every saved version of one record (newest first)
 * GET /api/history             → recent changes across the hub
 * GET /api/history?deleted=1   → deleted records that can be restored
 */
export default route({
  async GET(req, res) {
    await requireUser(req)
    const db = await getDb()
    const record = q(req, 'record')
    const limit = Math.min(Number(q(req, 'limit')) || 100, 500)
    const rows = q(req, 'deleted')
      ? await db.query(
          `select id as record_id, type, 'delete' as action, data, version, deleted_at as at, updated_by as by
           from records where deleted_at is not null order by deleted_at desc limit $1`,
          [limit],
        )
      : record
        ? await db.query(
            `select seq::text as seq, record_id, type, action, data, version, at, by
             from history where record_id = $1 order by seq desc limit $2`,
            [record, limit],
          )
        : await db.query(
            `select seq::text as seq, record_id, type, action, data, version, at, by
             from history order by seq desc limit $1`,
            [limit],
          )
    res.status(200).json({
      entries: rows.map((r) => ({
        seq: r.seq ?? null,
        recordId: r.record_id,
        type: r.type,
        action: r.action,
        data: r.data,
        version: Number(r.version),
        at: iso(r.at),
        by: r.by ?? null,
      })),
    })
  },
})
