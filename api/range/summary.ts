import { requireUser } from '../_lib/auth.js'
import { getDb } from '../_lib/db.js'
import { HttpError, q, route } from '../_lib/http.js'
import { summarize, testSamples } from '../_lib/telemetry.js'

/** GET /api/range/summary?test=ID → burn time, thrust, impulse and chamber pressure worked out from the readings. */
export default route({
  async GET(req, res) {
    await requireUser(req)
    const test = q(req, 'test')
    if (!test) throw new HttpError(400, 'test is required')
    const { samples, units } = await testSamples(await getDb(), test)
    res.status(200).json({ summary: summarize(samples, units) })
  },
})
