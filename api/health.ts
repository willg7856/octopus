import { getDb } from './_lib/db.js'
import { route } from './_lib/http.js'

export default route({
  async GET(_req, res) {
    const db = await getDb()
    await db.query('select 1')
    res.status(200).json({ ok: true, database: db.mode })
  },
})
