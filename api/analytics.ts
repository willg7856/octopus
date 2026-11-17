import { requireUser } from './_lib/auth.js'
import { getDb, type Db } from './_lib/db.js'
import { HttpError, q, route } from './_lib/http.js'
import { vercelAnalyticsConfigured, vercelTraffic } from './_lib/vercelAnalytics.js'

/**
 * GET /api/analytics?days=30 → website traffic (from the Vercel drain), Starship Tracker
 * traffic + its current flight, beyondstagezero.space traffic, and hub usage. Money is worked out in the browser.
 *
 * Both sites feed the same drain; they are told apart by host. STARSHIP_HOST overrides
 * the tracker's host (default starship.beyondstagezero.com).
 */

const RANGES = new Set([1, 7, 30, 90, 182, 365])
const n = (v: unknown) => Number(v) || 0

const starshipHost = () => (process.env.STARSHIP_HOST || 'starship.beyondstagezero.com').toLowerCase()

/** beyondstagezero.space, the live test page: its host (and www.), or its own Vercel project. */
const spaceHost = () => {
  const h = (process.env.SPACE_HOST || 'beyondstagezero.space').toLowerCase()
  return /^[a-z0-9.-]+$/.test(h) ? h : 'beyondstagezero.space'
}
const spaceProject = () => {
  const id = process.env.SPACE_PROJECT_ID || 'prj_oTxxGr463qRoNBuHdp7HEPEAHnkP'
  return /^prj_[A-Za-z0-9]+$/.test(id) ? id : ''
}
// Inlined (both values are checked above) so it works alongside either site's $1/$2 parameters.
const spaceWhere = () =>
  `(lower(coalesce(host, '')) in ('${spaceHost()}', 'www.${spaceHost()}')${spaceProject() ? ` or coalesce(project_id, '') = '${spaceProject()}'` : ''})`

type Row = Record<string, unknown>

/** Bucket keys: "YYYY-MM-DD" for days/weeks, "YYYY-MM-DDTHH" (UTC) for hours. */
const keyFmt = (bucket: string) => (bucket === 'hour' ? `'YYYY-MM-DD"T"HH24'` : `'YYYY-MM-DD'`)
const kv = (rows: Row[], f = 'views') => rows.map((r) => ({ key: String(r.key), value: n(r[f]) }))

/**
 * Which events are the Starship Tracker's: its host, or (when an event has no usable host)
 * the same Vercel project as events that do carry the tracker's host, or STARSHIP_PROJECT_ID.
 * $1 = tracker host, $2 = extra project ids.
 */
const STARSHIP_WHERE = `(lower(coalesce(host, '')) = $1 or (project_id is not null and project_id = any(
  array(select distinct project_id from web_events where lower(host) = $1 and project_id is not null) || $2::text[])))`

/** Traffic stats for the events matching `where` (a SQL condition using $1 / $2 as above). */
async function siteStats(db: Db, days: number, bucket: string, where: string, p: unknown[]) {
  const since = `now() - interval '${days} days'`
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
      `select to_char(date_trunc('${bucket}', at at time zone 'UTC'), ${keyFmt(bucket)}) as date,
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
    db.query(`select count(*) as events, max(at) as last, min(at) as first from web_events where ${where}`, p),
    // Most people on the site at once, in 5-minute windows
    db.query(
      `select b as at, c as viewers from (
         select to_timestamp(floor(extract(epoch from at) / 300) * 300) as b, count(distinct coalesce(session, visitor)) as c
         from web_events where at >= ${since} and ${where} group by 1
       ) w order by c desc, b desc limit 1`,
      p,
    ),
    db.query(
      `select to_char(date_trunc('day', at at time zone 'UTC'), 'YYYY-MM-DD') as date, count(*) as views
       from web_events where at >= ${since} and ${where} group by 1 order by 2 desc limit 1`,
      p,
    ),
  ])
  return {
    connected: n(ever!.events) > 0,
    lastEventAt: ever!.last ? new Date(ever!.last as string).toISOString() : null,
    /** The oldest view Octopus has — the drain doesn't send anything from before it was set up. */
    firstEventAt: ever!.first ? new Date(ever!.first as string).toISOString() : null,
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
    if (!RANGES.has(days)) throw new HttpError(400, 'days must be 1, 7, 30, 90, 182 or 365')
    const db = await getDb()
    const since = `now() - interval '${days} days'`
    const bucket = days <= 1 ? 'hour' : days > 90 ? 'week' : 'day'
    const host = starshipHost()

    const extraIds = (process.env.STARSHIP_PROJECT_ID || '').split(',').map((x) => x.trim()).filter(Boolean)
    const sp = [host, extraIds]
    const [web, starship, space, flight, [everAny], hubDaily, hubPeople, hubTypes, [team]] = await Promise.all([
      siteStats(db, days, bucket, `not ${STARSHIP_WHERE} and not ${spaceWhere()}`, sp),
      siteStats(db, days, bucket, `${STARSHIP_WHERE} and not ${spaceWhere()}`, sp),
      siteStats(db, days, bucket, spaceWhere(), []),
      currentFlight(),
      db.query(`select count(*) as events from web_events`),
      db.query(
        `select to_char(date_trunc('${bucket}', at at time zone 'UTC'), ${keyFmt(bucket)}) as date, count(*) as changes
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

    // Prefer Vercel's own Web Analytics history (up to a year) for totals, charts and breakdowns.
    // The drain still supplies what that API can't: who's on the site right now and peak viewers.
    const websiteProject = process.env.WEBSITE_PROJECT_ID
    const starshipProject = (process.env.STARSHIP_PROJECT_ID || '').split(',')[0]?.trim()
    const errors: string[] = []
    const fromVercel = async (projectId: string | undefined) => {
      if (!projectId || !vercelAnalyticsConfigured()) return null
      try {
        return await vercelTraffic(projectId, days)
      } catch (err) {
        errors.push((err as Error).message)
        return null
      }
    }
    const [vWeb, vStar, vSpace] = await Promise.all([fromVercel(websiteProject), fromVercel(starshipProject), fromVercel(spaceProject() || undefined)])
    // For 24 hours the drain is exact (real visitors, live) once it has been running a full day.
    const drainCoversRange = (drain: { firstEventAt?: unknown }) =>
      typeof drain.firstEventAt === 'string' && new Date(drain.firstEventAt).getTime() <= Date.now() - days * 86_400_000
    const merge = <T extends Record<string, unknown>>(drain: T, v: Awaited<ReturnType<typeof vercelTraffic>> | null) =>
      v && !(days <= 1 && drainCoversRange(drain))
        ? {
            ...drain,
            source: 'vercel' as const,
            connected: true,
            views: v.views,
            visitors: v.visitors,
            visitorsApprox: v.visitorsApprox,
            sessions: v.visitors,
            series: v.series,
            pages: v.pages,
            referrers: v.referrers,
            countries: v.countries,
            devices: v.devices,
            // Busiest day (or week, for 6 months / 1 year) from Vercel's figures
            busiestDay: v.series.reduce<{ date: string; views: number } | null>(
              (b, p) => (p.views > (b?.views ?? 0) ? { date: p.date, views: p.views } : b),
              null,
            ),
            firstEventAt: null,
          }
        : { ...drain, source: 'drain' as const }

    res.status(200).json({
      vercelApi: !vercelAnalyticsConfigured() ? 'missing-token' : errors.length ? 'error' : 'ok',
      vercelErrors: errors.length ? errors : undefined,
      days,
      bucket,
      generatedAt: new Date().toISOString(),
      drainConnected: n(everAny!.events) > 0 || !!vWeb || !!vStar || !!vSpace,
      web: merge(web, vWeb),
      starship: { host, flight, ...merge(starship, vStar) },
      space: { host: spaceHost(), ...merge(space, vSpace) },
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
