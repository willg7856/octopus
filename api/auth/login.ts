import { authenticate, setSession } from '../_lib/auth.js'
import { body, route } from '../_lib/http.js'

export default route({
  async POST(req, res) {
    const { email, password } = body<{ email?: string; password?: string }>(req)
    const user = await authenticate(String(email ?? ''), String(password ?? ''))
    setSession(res, user)
    res.status(200).json({ user })
  },
})
