import { getDb } from './_lib/db.js'
import { route } from './_lib/http.js'
import { checkStorage } from './_lib/images.js'

export default route({
  async GET(_req, res) {
    const db = await getDb()
    await db.query('select 1')
    // storage: whether gallery photos can be saved (Vercel Blob)
    res.status(200).json({ ok: true, database: db.mode, storage: await checkStorage() })
  },
})
