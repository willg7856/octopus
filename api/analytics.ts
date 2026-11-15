import { requireUser } from './_lib/auth.js'
import { getDb, type Db } from './_lib/db.js'
import { HttpError, q, route } from './_lib/http.js'

/**
 * GET /api/analytics?days=30 → website traffic (from the Vercel drain), Starship Tracker
 * traffic + its current flight, and hub usage. Money is worked out in the browser.
 *
 * Both sites feed the same drain; they are told apart by host. STARSHIP_HOST overrides
 * the tracker's host (default starship.beyondstagezero.com).
 */

const RANGES = new Set([7, 30, 90, 365])
const n = (v: unknown) => Number(v) || 0

const starshipHost = () => (process.env.STARSHIP_HOST || 'starship.beyondstagezero.com').toLowerCase()

type Row = Record<string, unknown>
const kv = (rows: Row[], f = 'views') => rows.map((r) => ({ key: String(r.key), value: n(r[f]) }))

/** Traffic stats for the events matching `where` (a SQL condition using $1 = host). */
async function siteStats(db: Db, days: number, bucket: string, where: string, host: string) {
  const since = `now() - interval '${days} days'`
  const p = [host]
  const [[totals], [live], series, pages, referrers, countries, devices, [ever], [peak], [busiest]] = await Promise.all([
    db.query(
      `select count(*) as views, count(distinct coalesce(visitor, session)) as visitors, count(distinct session) as sessions
       from web_events where at >= ${since} and ${where}`,
      p,
    ),
    db.query(
      `select count(distinct coalesce(session, visitor)) as visitors, count(*) as views
       from web_events where at >= now() - interval '5 minutes' and ${where}`,
      p,
    ),
    db.query(
      `select to_char(date_trunc('${bucket}', at), 'YYYY-MM-DD') as date,
              count(*) as views, count(distinct coalesce(visitor, session)) as visitors
       from web_events where at >= ${since} and ${where} group by 1 order by 1`,
      p,
    ),
    db.query(`select path as key, count(*) as views from web_events where at >= ${since} and ${where} group by 1 order by 2 desc limit 8`, p),
    db.query(
      `select coalesce(referrer, 'Direct') as key, count(*) as views from web_events where at >= ${since} and ${where}
       group by 1 order by 2 desc limit 8`,
      p,
    ),
    db.query(
      `select coalesce(country, '—') as key, count(*) as views from web_events where at >= ${since} and ${where}
       group by 1 order by 2 desc limit 8`,
      p,
    ),
    db.query(
      `select coalesce(device, 'unknown') as key, count(*) as views from web_events where at >= ${since} and ${where}
       group by 1 order by 2 desc`,
      p,
    ),
    db.query(`select count(*) as events, max(at) as last from web_events where ${where}`, p),
    // Most people on the site at once, in 5-minute windows
    db.query(
      `select b as at, c as viewers from (
         select to_timestamp(floor(extract(epoch from at) / 300) * 300) as b, count(distinct coalesce(session, visitor)) as c
         from web_events where at >= ${since} and ${where} group by 1
       ) w order by c desc, b desc limit 1`,
      p,
    ),
    db.query(
      `select to_char(date_trunc('day', at), 'YYYY-MM-DD') as date, count(*) as views
       from web_events where at >= ${since} and ${where} group by 1 order by 2 desc limit 1`,
      p,
    ),
  ])
  return {
    connected: n(ever!.events) > 0,
    lastEventAt: ever!.last ? new Date(ever!.last as string).toISOString() : null,
    live: { visitors: n(live!.visitors), views: n(live!.views) },
    views: n(totals!.views),
    visitors: n(totals!.visitors),
    sessions: n(totals!.sessions),
    peak: peak ? { viewers: n(peak.viewers), at: new Date(peak.at as string).toISOString() } : null,
    busiestDay: busiest ? { date: String(busiest.date), views: n(busiest.views) } : null,
    series: series.map((r) => ({ date: String(r.date), views: n(r.views), visitors: n(r.visitors) })),
    pages: kv(pages),
    referrers: kv(referrers),
    countries: kv(countries),
    devices: kv(devices),
  }
}

/* ---------- the tracker's current flight (its own public /api/flight) ---------- */

interface Flight {
  flight: number
  title: string
  ship: number | null
  plannedLiftoff: string | null
  paused: boolean
  landingKind: string | null
  webcastUrl: string | null
}

let flightCache: { at: number; data: Flight | null } | null = null

async function currentFlight(): Promise<Flight | null> {
  if (flightCache && Date.now() - flightCache.at < 60_000) return flightCache.data
  let data: Flight | null = null
  try {
    const url = process.env.STARSHIP_URL || `https://${starshipHost()}`
    const r = await fetch(`${url.replace(/\/$/, '')}/api/flight`, { signal: AbortSignal.timeout(5000) })
    if (r.ok) {
      const j = (await r.json()) as Record<string, unknown>
      if (typeof j.flight === 'number') {
        data = {
          flight: j.flight,
          title: String(j.title ?? `Flight ${j.flight}`),
          ship: typeof j.ship === 'number' ? j.ship : null,
          plannedLiftoff: typeof j.plannedLiftoff === 'string' ? j.plannedLiftoff : null,
          paused: !!j.paused,
          landingKind: typeof j.landingKind === 'string' ? j.landingKind : null,
          webcastUrl: typeof j.webcastUrl === 'string' ? j.webcastUrl : null,
        }
      }
    }
  } catch {
    /* tracker unreachable — show traffic without flight info */
  }
  flightCache = { at: Date.now(), data }
  return data
}

export default route({
  async GET(req, res) {
    await requireUser(req)
    const days = Number(q(req, 'days') ?? 30)
    if (!RANGES.has(days)) throw new HttpError(400, 'days must be 7, 30, 90 or 365')
    const db = await getDb()
    const since = `now() - interval '${days} days'`
    const bucket = days > 90 ? 'week' : 'day'
    const host = starshipHost()

    const [web, starship, flight, [everAny], hubDaily, hubPeople, hubTypes, [team]] = await Promise.all([
      siteStats(db, days, bucket, `(host is null or lower(host) <> $1)`, host),
      siteStats(db, days, bucket, `lower(host) = $1`, host),
      currentFlight(),
      db.query(`select count(*) as events from web_events`),
      db.query(
        `select to_char(date_trunc('${bucket}', at), 'YYYY-MM-DD') as date, count(*) as changes
         from history where at >= ${since} group by 1 order by 1`,
      ),
      db.query(
        `select by as key, count(*) as changes from history where at >= ${since} and by is not null
         group by 1 order by 2 desc limit 10`,
      ),
      db.query(`select type as key, count(*) as changes from history where at >= ${since} group by 1 order by 2 desc`),
      db.query(
        `select count(*) filter (where not disabled) as members,
                count(*) filter (where last_login_at >= ${since}) as signed_in
         from users`,
      ),
    ])

    res.status(200).json({
      days,
      bucket,
      generatedAt: new Date().toISOString(),
      drainConnected: n(everAny!.events) > 0,
      web,
      starship: { host, flight, ...starship },
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
