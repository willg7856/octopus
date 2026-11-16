import { requireAdmin, requireUser } from '../_lib/auth.js'
import { getDb } from '../_lib/db.js'
import { route } from '../_lib/http.js'
import { newRangeKey, rangeKeyInfo, saveRangeKey } from '../_lib/telemetry.js'

/**
 * GET  /api/range/key → whether a range-laptop key exists (never the key itself).
 * POST /api/range/key → admins: make a new key (replacing the old one) and show it once.
 */
export default route({
  async GET(req, res) {
    await requireUser(req)
    res.status(200).json(await rangeKeyInfo(await getDb()))
  },
  async POST(req, res) {
    const user = await requireAdmin(req)
    const db = await getDb()
    const key = newRangeKey()
    await saveRangeKey(db, key, user.email)
    res.status(200).json({ key, ...(await rangeKeyInfo(db)) })
  },
})
