import { requireUser } from '../_lib/auth.js'
import { route } from '../_lib/http.js'

export default route({
  async GET(req, res) {
    res.status(200).json({ user: await requireUser(req) })
  },
})
