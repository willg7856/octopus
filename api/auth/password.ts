import { authenticate, hashPassword, requireUser } from '../_lib/auth.js'
import { getDb } from '../_lib/db.js'
import { body, HttpError, route } from '../_lib/http.js'

/** Change your own password. Requires the current one. */
export default route({
  async POST(req, res) {
    const user = await requireUser(req)
    const { current, next } = body<{ current?: string; next?: string }>(req)
    if (!next || next.length < 8) {
      throw new HttpError(400, 'New password must be at least 8 characters.')
    }
    await authenticate(user.email, String(current ?? ''))
    const db = await getDb()
    await db.query('update users set password_hash = $2 where email = $1', [
      user.email,
      hashPassword(next),
    ])
    res.status(200).json({ ok: true })
  },
})
