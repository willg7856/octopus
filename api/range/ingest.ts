import { getDb } from '../_lib/db.js'
import { body, HttpError, route, type Res } from '../_lib/http.js'
import { activeTest, checkRangeKey, cleanSamples, cleanUnits, testRows } from '../_lib/telemetry.js'

/**
 * POST /api/range/ingest — the range laptop sends sensor readings here.
 *
 *   Authorization: Bearer <range key from Octopus → .space → Range laptop>
 *   { "samples": [{ "t": 1763350000123, "chamber": 98.4 }, …], "units": { "chamber": "psi" }, "test": "<optional id>" }
 *
 * Without "test", readings go to the test that's In progress or on Hold in Octopus (or one that finished in
 * the last 15 minutes, so the tail-off isn't lost). If there's none, it answers 409 and the sender
 * keeps the readings on the laptop.
 */

let testCache: { at: number; rows: Awaited<ReturnType<typeof testRows>> } | null = null

// The thrust logger page runs from a file on the range laptop (or a local relay), so the browser
// needs CORS to send here. Safe to allow any origin: the range key is the only credential, never cookies.
const cors = (res: Res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
}

export default route({
  async OPTIONS(_req, res) {
    cors(res)
    res.status(204).end()
  },
  async POST(req, res) {
    cors(res)
    const db = await getDb()
    const auth = String(req.headers.authorization ?? '')
    const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : undefined
    if (!(await checkRangeKey(db, key))) throw new HttpError(401, 'Wrong or missing range key. Make a new one in Octopus → .space.')

    const b = body<{ samples?: unknown; units?: unknown; test?: unknown }>(req)
    const { samples, error } = cleanSamples(b.samples)
    if (error) throw new HttpError(400, error)

    if (!testCache || Date.now() - testCache.at > 3000) testCache = { at: Date.now(), rows: await testRows(db) }
    const wanted = typeof b.test === 'string' && b.test ? b.test : null
    const test = wanted ? testCache.rows.find((t) => t.id === wanted) : activeTest(testCache.rows)
    if (!test) {
      testCache = null
      throw new HttpError(
        409,
        wanted ? 'That test isn’t in Octopus.' : 'No test is In progress or on Hold in Octopus. Set the test to In progress (or Hold) and data will start flowing.',
        { code: 'no_active_test' },
      )
    }
    if (samples.length) {
      await db.query('insert into telemetry (test_id, t0, t1, samples, units) values ($1, $2, $3, $4, $5)', [
        test.id,
        samples[0].t,
        samples[samples.length - 1].t,
        JSON.stringify(samples),
        cleanUnits(b.units) ? JSON.stringify(cleanUnits(b.units)) : null,
      ])
    }
    res.status(200).json({ ok: true, stored: samples.length, test: { id: test.id, name: String(test.data.name ?? '') } })
  },
})
