import { clearSession } from '../_lib/auth.js'
import { route } from '../_lib/http.js'

export default route({
  async POST(_req, res) {
    clearSession(res)
    res.status(200).json({ ok: true })
  },
})
