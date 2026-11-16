/**
 * Vercel's Web Analytics query API (api.vercel.com/v1/query/web-analytics/visits/…).
 *
 * Gives up to 366 days of history on Pro — far more than the drain, which only has views
 * from the day it was connected. Needs VERCEL_API_TOKEN (a Vercel access token scoped to the
 * team) and VERCEL_TEAM_ID. Limits learned from the API: ≤100 rows per call, ≤62 days per
 * call when grouped by day, ≤26 weeks when grouped by week.
 */

const API = `${(process.env.VERCEL_API_URL || 'https://api.vercel.com').replace(/\/$/, '')}/v1/query/web-analytics/visits`
const CACHE_MS = 5 * 60_000

export function vercelAnalyticsConfigured(): boolean {
  return !!process.env.VERCEL_API_TOKEN && !!process.env.VERCEL_TEAM_ID
}

type Row = Record<string, unknown> & { visitors?: number; pageviews?: number; timestamp?: string }

async function call(kind: 'count' | 'aggregate', projectId: string, params: Record<string, string>): Promise<{ data: unknown }> {
  const qs = new URLSearchParams({ projectId, teamId: process.env.VERCEL_TEAM_ID!, ...params })
  const res = await fetch(`${API}/${kind}?${qs}`, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } }
  if (!res.ok) throw new Error(body.error?.message ?? `Vercel analytics ${res.status}`)
  return { data: body.data }
}

const iso = (t: number) => new Date(t).toISOString()
const n = (v: unknown) => Number(v) || 0

export interface VercelTraffic {
  views: number
  visitors: number
  series: { date: string; views: number; visitors: number }[]
  pages: { key: string; value: number }[]
  referrers: { key: string; value: number }[]
  countries: { key: string; value: number }[]
  devices: { key: string; value: number }[]
  historySince: string
  visitorsApprox: boolean
}

const cache = new Map<string, { at: number; data: VercelTraffic }>()

/** Traffic for one Vercel project over the last `days` days, in the same shape the page uses. */
export async function vercelTraffic(projectId: string, days: number): Promise<VercelTraffic> {
  const key = `${projectId}:${days}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data

  const now = Date.now()
  const hour = 3_600_000
  const day = 24 * hour
  // Vercel's count endpoint works in whole UTC days and excludes the day `until` falls on,
  // so windows end at the start of tomorrow (UTC) to include today.
  const tomorrow = Math.floor(now / day) * day + day
  let unit: 'hour' | 'day' | 'week'
  let since: number
  let until: number
  let chunk: number
  if (days <= 1) {
    unit = 'hour'
    until = Math.ceil(now / hour) * hour
    since = until - 24 * hour
    chunk = 99 * hour
  } else if (days <= 90) {
    unit = 'day'
    until = tomorrow
    since = until - days * day
    chunk = 60 * day // the API rejects 62-day spans that touch a 63rd day
  } else {
    unit = 'week'
    until = tomorrow
    const start = new Date(until - days * day)
    since = start.getTime() - ((start.getUTCDay() + 6) % 7) * day // Vercel weeks start on Monday
    chunk = 25 * 7 * day
  }
  const chunks: [number, number][] = []
  for (let s = since; s < until; s += chunk) chunks.push([s, Math.min(until, s + chunk)])

  const [count, ...rest] = await Promise.all([
    unit === 'hour' ? Promise.resolve({ data: null }) : call('count', projectId, { since: iso(since), until: iso(until) }),
    ...chunks.map(([s, u]) => call('aggregate', projectId, { by: unit, since: iso(s), until: iso(u), limit: '100' })),
    ...(['requestPath', 'referrerHostname', 'country', 'deviceType'] as const).map((by) =>
      call('aggregate', projectId, { by, since: iso(unit === 'hour' ? Math.floor(since / day) * day : since), until: iso(until), limit: '9' }),
    ),
  ])
  const seriesParts = rest.slice(0, chunks.length)
  const [pages, refs, countries, devices] = rest.slice(chunks.length) as { data: Row[] }[]

  const seen = new Map<string, { date: string; views: number; visitors: number }>()
  for (const part of seriesParts) {
    for (const r of (part.data as Row[]) ?? []) {
      const ts = String(r.timestamp ?? '')
      const k = unit === 'hour' ? ts.slice(0, 13) : ts.slice(0, 10)
      if (!k) continue
      const prev = seen.get(k)
      // Chunk edges can repeat a bucket; keep the larger reading.
      if (!prev || n(r.pageviews) > prev.views) seen.set(k, { date: k, views: n(r.pageviews), visitors: n(r.visitors) })
    }
  }

  const kv = (rows: Row[] | undefined, field: string, rename?: (v: string) => string) =>
    (rows ?? [])
      .filter((r) => String(r[field] ?? '') !== 'Others')
      .map((r) => {
        const raw = String(r[field] ?? '')
        return { key: rename ? rename(raw) : raw || '—', value: n(r.pageviews) }
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value) // Vercel ranks by visitors; we show page views
      .slice(0, 8)

  const series = [...seen.values()].sort((a, b) => a.date.localeCompare(b.date))
  const c = (count.data ?? null) as Row | null
  const data: VercelTraffic = {
    // Hourly: no exact unique count for a part-day window, so views are summed and visitors are
    // the sum of each hour's visitors (an upper bound). The page prefers the drain for 24 hours.
    views: c ? n(c.pageviews) : series.reduce((t, p) => t + p.views, 0),
    visitors: c ? n(c.visitors) : series.reduce((t, p) => t + p.visitors, 0),
    visitorsApprox: !c,
    series,
    pages: kv(pages?.data as Row[], 'requestPath'),
    referrers: kv(refs?.data as Row[], 'referrerHostname', (v) => (v ? v.replace(/^www\./, '') : 'Direct')),
    countries: kv(countries?.data as Row[], 'country'),
    devices: kv(devices?.data as Row[], 'deviceType', (v) => v || 'unknown'),
    historySince: iso(since),
  }
  cache.set(key, { at: Date.now(), data })
  return data
}
