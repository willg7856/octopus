import { requireUser } from '../_lib/auth.js'
import { getDb } from '../_lib/db.js'
import { HttpError, q, route } from '../_lib/http.js'
import { testSamples } from '../_lib/telemetry.js'

/**
 * GET /api/range/csv?test=ID[&name=SF-05] → the test's readings as a CSV file (as received by
 * Octopus, up to 25 a second; the laptop's own CSV has every reading).
 */
export default route({
  async GET(req, res) {
    await requireUser(req)
    const test = q(req, 'test')
    if (!test) throw new HttpError(400, 'test is required')
    const { samples, units } = await testSamples(await getDb(), test)
    const channels = [...new Set(samples.flatMap((s) => Object.keys(s).filter((k) => k !== 't')))].sort((a, b) =>
      a === 'thrust' ? -1 : b === 'thrust' ? 1 : a === 'chamber' ? -1 : b === 'chamber' ? 1 : a.localeCompare(b),
    )
    const t0 = samples[0]?.t ?? 0
    const head = ['time_utc', 'seconds', ...channels.map((c) => (units[c] ? `${c}_${units[c].replace(/[^\w]/g, '')}` : c))]
    const lines = [head.join(',')]
    for (const s of samples) {
      lines.push([new Date(s.t).toISOString(), ((s.t - t0) / 1000).toFixed(3), ...channels.map((c) => (c in s ? String(s[c]) : ''))].join(','))
    }
    const name = (q(req, 'name') || 'test').replace(/[^\w.-]+/g, '-').slice(0, 40)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${name}-sensor-data.csv"`)
    res.end(lines.join('\n') + '\n')
  },
})
