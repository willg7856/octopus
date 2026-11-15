import { requireUser } from './_lib/auth.js'
import { getDb } from './_lib/db.js'
import { HttpError, q, route } from './_lib/http.js'

/**
 * GET /api/analytics?days=30 → website traffic (from the Vercel drain) and hub usage.
 * Money is worked out in the browser from orders and income, which the app already has.
 */

const RANGES = new Set([7, 30, 90, 365])
const n = (v: unknown) => Number(v) || 0

export default route({
  async GET(req, res) {
    await requireUser(req)
    const days = Number(q(req, 'days') ?? 30)
    if (!RANGES.has(days)) throw new HttpError(400, 'days must be 7, 30, 90 or 365')
    const db = await getDb()
    const since = `now() - interval '${days} days'`
    const bucket = days > 90 ? 'week' : 'day'

    const [
      [totals],
      [live],
      daily,
      pages,
      referrers,
      countries,
      devices,
      [ever],
      hubDaily,
      hubPeople,
      hubTypes,
      [team],
    ] = await Promise.all([
      db.query(
        `select count(*) as views,
                count(distinct coalesce(visitor, session)) as visitors,
                count(distinct session) as sessions
         from web_events where at >= ${since}`,
      ),
      db.query(
        `select count(distinct coalesce(session, visitor)) as visitors, count(*) as views
         from web_events where at >= now() - interval '5 minutes'`,
      ),
      db.query(
        `select to_char(date_trunc('${bucket}', at), 'YYYY-MM-DD') as date,
                count(*) as views, count(distinct coalesce(visitor, session)) as visitors
         from web_events where at >= ${since} group by 1 order by 1`,
      ),
      db.query(`select path as key, count(*) as views from web_events where at >= ${since} group by 1 order by 2 desc limit 8`),
      db.query(
        `select coalesce(referrer, 'Direct') as key, count(*) as views from web_events where at >= ${since}
         group by 1 order by 2 desc limit 8`,
      ),
      db.query(
        `select coalesce(country, '—') as key, count(*) as views from web_events where at >= ${since}
         group by 1 order by 2 desc limit 8`,
      ),
      db.query(
        `select coalesce(device, 'unknown') as key, count(*) as views from web_events where at >= ${since}
         group by 1 order by 2 desc`,
      ),
      db.query(`select count(*) as events, max(at) as last from web_events`),
      db.query(
        `select to_char(date_trunc('${bucket}', at), 'YYYY-MM-DD') as date, count(*) as changes
         from history where at >= ${since} group by 1 order by 1`,
      ),
      db.query(
        `select by as key, count(*) as changes from history where at >= ${since} and by is not null
         group by 1 order by 2 desc limit 10`,
      ),
      db.query(
        `select type as key, count(*) as changes from history where at >= ${since} group by 1 order by 2 desc`,
      ),
      db.query(
        `select count(*) filter (where not disabled) as members,
                count(*) filter (where last_login_at >= ${since}) as signed_in
         from users`,
      ),
    ])

    const kv = (rows: Record<string, unknown>[], f = 'views') => rows.map((r) => ({ key: String(r.key), value: n(r[f]) }))

    res.status(200).json({
      days,
      bucket,
      generatedAt: new Date().toISOString(),
      web: {
        connected: n(ever!.events) > 0,
        lastEventAt: ever!.last ? new Date(ever!.last as string).toISOString() : null,
        live: { visitors: n(live!.visitors), views: n(live!.views) },
        views: n(totals!.views),
        visitors: n(totals!.visitors),
        sessions: n(totals!.sessions),
        series: daily.map((r) => ({ date: String(r.date), views: n(r.views), visitors: n(r.visitors) })),
        pages: kv(pages),
        referrers: kv(referrers),
        countries: kv(countries),
        devices: kv(devices),
      },
      hub: {
        changes: hubDaily.reduce((t, r) => t + n(r.changes), 0),
        series: hubDaily.map((r) => ({ date: String(r.date), changes: n(r.changes) })),
        people: kv(hubPeople, 'changes'),
        types: kv(hubTypes, 'changes'),
        members: n(team!.members),
        signedIn: n(team!.signed_in),
      },
    })
  },
})
