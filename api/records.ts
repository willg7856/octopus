import { requireUser } from './_lib/auth.js'
import { body, q, route } from './_lib/http.js'
import { applyOps, listRecords, type Op } from './_lib/records.js'

/**
 * GET  /api/records            → all live records + current rev
 * GET  /api/records?since=REV  → everything changed after REV (including deletions)
 * POST /api/records {ops:[…]}  → apply creates/updates/deletes/restores atomically
 */
export default route({
  async GET(req, res) {
    await requireUser(req)
    const since = q(req, 'since')
    const sinceRev = since != null && /^\d+$/.test(since) ? Number(since) : undefined
    res.status(200).json(await listRecords(sinceRev))
  },
  async POST(req, res) {
    const user = await requireUser(req)
    const { ops } = body<{ ops: Op[] }>(req)
    const records = await applyOps(ops, user.email)
    res.status(200).json({ records })
  },
})
