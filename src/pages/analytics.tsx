import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { TClock, useNow } from './countdowns'
import { CollectionPage, type Column, type Filter } from '../components/CollectionPage'
import { FieldValue, RefLink } from '../components/fields'
import { GitHubPanel } from '../components/GitHubPanel'
import { Icon } from '../components/Icon'
import { copyText, Stat, useToast } from '../components/ui'
import { COMMITTED_STATUSES, fmtDate, fmtMoney, movementDelta, orderTotal, personName, useBudgetSummary } from '../lib/derive'
import { href } from '../lib/router'
import { byType } from '../lib/schema'
import { useRecords, useStore } from '../lib/store'
import type { Movement, Order } from '../lib/types'

/* ======================= Income list ======================= */

type Income = {
  title: string
  amount: number
  date: string
  category?: string
  status: 'expected' | 'received'
  from?: string
  reference?: string
}

const INCOME = byType.get('income')!
const f = (k: string) => INCOME.fields.find((x) => x.key === k)!

export function IncomeList() {
  const columns: Column<Income>[] = [
    { key: 'amount', label: 'Amount', className: 'num', sort: (r) => r.data.amount, render: (r) => <span className="num strong">{fmtMoney(r.data.amount)}</span> },
    { key: 'category', label: 'Type', className: 'hide-s', sort: (r) => r.data.category ?? '', render: (r) => <FieldValue field={f('category')} value={r.data.category} /> },
    { key: 'from', label: 'From', className: 'hide-s', render: (r) => <RefLink id={r.data.from} /> },
    { key: 'date', label: 'Date', sort: (r) => r.data.date, render: (r) => <span className="nowrap">{fmtDate(r.data.date)}</span> },
    { key: 'status', label: 'Status', sort: (r) => r.data.status, render: (r) => <FieldValue field={f('status')} value={r.data.status} /> },
  ]
  const filters: Filter<Income>[] = [
    { key: 'all', label: 'All', test: () => true },
    { key: 'received', label: 'Received', test: (r) => r.data.status === 'received' },
    { key: 'expected', label: 'Expected', test: (r) => r.data.status === 'expected' },
  ]
  return <CollectionPage c={INCOME} columns={columns} filters={filters} detail={false} defaultSort={{ key: 'date', dir: -1 }} />
}

/* ======================= Analytics page ======================= */

const RANGES = [
  { days: 1, label: '24 hours' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 182, label: '6 months' },
  { days: 365, label: '1 year' },
]

type Bucket = 'hour' | 'day' | 'week'

/** Label for a series key: hours are UTC keys shown in local time. */
function bucketLabel(key: string | undefined, bucket: Bucket): string {
  if (!key) return ''
  if (bucket === 'hour') {
    const d = new Date(`${key}:00:00Z`)
    const h = d.getHours()
    return `${fmtDate(d.toISOString())} ${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`
  }
  return `${bucket === 'week' ? 'Week of ' : ''}${fmtDate(key)}`
}

const bucketNoun = (b: Bucket) => b

interface KV {
  key: string
  value: number
}

interface SiteTraffic {
  connected: boolean
  lastEventAt: string | null
  firstEventAt: string | null
  live: { visitors: number; views: number }
  views: number
  visitors: number
  sessions: number
  peak: { viewers: number; at: string } | null
  busiestDay: { date: string; views: number } | null
  series: { date: string; views: number; visitors: number }[]
  pages: KV[]
  referrers: KV[]
  countries: KV[]
  devices: KV[]
}

interface Flight {
  flight: number
  title: string
  ship: number | null
  plannedLiftoff: string | null
  paused: boolean
  landingKind: string | null
  webcastUrl: string | null
}

interface ServerAnalytics {
  days: number
  bucket: Bucket
  drainConnected: boolean
  web: SiteTraffic
  starship: SiteTraffic & { host: string; flight: Flight | null }
  hub: {
    changes: number
    series: { date: string; changes: number }[]
    people: KV[]
    types: KV[]
    members: number
    signedIn: number
  }
}

const nf = (n: number) => Math.round(n).toLocaleString('en-AU')
const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function readRange(): number {
  try {
    const v = Number(localStorage.getItem('octopus-analytics-range'))
    return RANGES.some((r) => r.days === v) ? v : 30
  } catch {
    return 30
  }
}

/**
 * Fills the gaps in a sparse server series so every day/week in the range has a point.
 * The server buckets by UTC date, so the keys here are UTC dates too.
 */
function fillSeries<T extends { date: string }>(rows: T[], days: number, bucket: Bucket, zero: Omit<T, 'date'>): T[] {
  const byDate = new Map(rows.map((r) => [r.date, r]))
  const out: T[] = []
  const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10)
  const now = Date.now()
  if (bucket === 'hour') {
    for (let i = 24 * days; i >= 0; i--) {
      const k = new Date(now - i * 3600000).toISOString().slice(0, 13)
      out.push(byDate.get(k) ?? ({ date: k, ...zero } as T))
    }
  } else if (bucket === 'day') {
    // One extra day either side covers the UTC/local offset.
    for (let i = days; i >= 0; i--) {
      const k = utcDay(now - i * 86400000)
      out.push(byDate.get(k) ?? ({ date: k, ...zero } as T))
    }
    while (out.length > 1 && !byDate.has(out[0]!.date) && out.length > days) out.shift()
  } else {
    // Postgres weeks start on Monday (UTC)
    const start = new Date(now - days * 86400000)
    const dow = (start.getUTCDay() + 6) % 7
    for (let t = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - dow); t <= now; t += 7 * 86400000) {
      const k = utcDay(t)
      out.push(byDate.get(k) ?? ({ date: k, ...zero } as T))
    }
  }
  // Anything the server returned that fell outside the generated keys still counts.
  const keys = new Set(out.map((o) => o.date))
  for (const r of rows) if (!keys.has(r.date)) out.push(r)
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export function AnalyticsPage() {
  const [days, setDays] = useState(readRange)
  const [data, setData] = useState<ServerAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    fetch(`/api/analytics?days=${days}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!live) return
        if (r.ok) {
          setData(body)
          setError(null)
        } else setError(body.error ?? 'Couldn’t load analytics')
      })
      .catch(() => live && setError('Couldn’t reach Octopus'))
    return () => {
      live = false
    }
  }, [days, tick])

  // Live numbers: refresh every 30 seconds while the page is open.
  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === 'visible' && setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="page analytics">
      <header className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="muted">Money, the website and how the team is using Octopus — one place.</p>
        </div>
        <div className="chips" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              role="tab"
              aria-selected={r.days === days}
              className={`chip${r.days === days ? ' on' : ''}`}
              onClick={() => {
                setDays(r.days)
                try {
                  localStorage.setItem('octopus-analytics-range', String(r.days))
                } catch {
                  /* ignore */
                }
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <MoneySection days={days} />
      {error && <p className="form-error">{error}</p>}
      <WebsiteSection data={data} days={days} />
      <StarshipSection data={data} days={days} />
      <HubSection data={data} days={days} />
      <GitHubPanel days={days} />
    </div>
  )
}

function Section({ title, sub, icon, right, children }: { title: string; sub?: ReactNode; icon: 'wallet' | 'monitor' | 'chart'; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="an-section">
      <header className="an-head">
        <div>
          <h2>
            <Icon name={icon} size={17} /> {title}
          </h2>
          {sub && <p className="muted small">{sub}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

/* ---------------- money ---------------- */

function MoneySection({ days }: { days: number }) {
  const orders = useRecords<Order>('order')
  const incomes = useRecords<Income>('income')
  const budgets = useBudgetSummary()

  const m = useMemo(() => {
    const now = new Date()
    const monthKey = localDay(now).slice(0, 7)
    const since = localDay(new Date(now.getTime() - (days - 1) * 86400000))
    const spentDate = (o: (typeof orders)[number]) => o.data.receivedAt ?? localDay(new Date(o.updatedAt))

    const received = orders.filter((o) => o.data.status === 'received')
    const gotIncome = incomes.filter((i) => i.data.status === 'received')
    const sum = <T,>(xs: T[], v: (x: T) => number) => xs.reduce((t, x) => t + v(x), 0)

    const spentMonth = sum(received.filter((o) => spentDate(o).startsWith(monthKey)), (o) => orderTotal(o.data))
    const incomeMonth = sum(gotIncome.filter((i) => i.data.date?.startsWith(monthKey)), (i) => Number(i.data.amount) || 0)
    const committed = sum(orders.filter((o) => COMMITTED_STATUSES.has(o.data.status)), (o) => orderTotal(o.data))
    const expected = sum(incomes.filter((i) => i.data.status === 'expected'), (i) => Number(i.data.amount) || 0)
    const spentRange = sum(received.filter((o) => spentDate(o) >= since), (o) => orderTotal(o.data))
    const incomeRange = sum(gotIncome.filter((i) => (i.data.date ?? '') >= since), (i) => Number(i.data.amount) || 0)

    // Last 12 months
    const months: { key: string; label: string; income: number; spent: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: d.toLocaleDateString('en-AU', { month: 'short' }), income: 0, spent: 0 })
    }
    const idx = new Map(months.map((x, i) => [x.key, i]))
    for (const o of received) {
      const i = idx.get(spentDate(o).slice(0, 7))
      if (i != null) months[i]!.spent += orderTotal(o.data)
    }
    for (const x of gotIncome) {
      const i = idx.get((x.data.date ?? '').slice(0, 7))
      if (i != null) months[i]!.income += Number(x.data.amount) || 0
    }

    // Spend by budget line in range
    const byBudget = budgets
      .map((b) => ({
        key: b.rec ? String(b.rec.data.name) : 'No budget',
        value: sum(b.orders.filter((o) => o.data.status === 'received' && spentDate(o) >= since), (o) => orderTotal(o.data)),
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)

    // Income by type in range
    const types = new Map<string, number>()
    for (const x of gotIncome.filter((i) => (i.data.date ?? '') >= since)) {
      const k = f('category').options!.find((o) => o.value === x.data.category)?.label ?? 'Other'
      types.set(k, (types.get(k) ?? 0) + (Number(x.data.amount) || 0))
    }
    const byType = [...types.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value)

    return { spentMonth, incomeMonth, committed, expected, spentRange, incomeRange, months, byBudget, byType }
  }, [orders, incomes, budgets, days])

  const net = m.incomeMonth - m.spentMonth
  const monthName = new Date().toLocaleDateString('en-AU', { month: 'long' })
  const rangeLabel = RANGES.find((r) => r.days === days)!.label

  return (
    <Section
      title="Money"
      icon="wallet"
      sub={
        <>
          Spent = orders received. Made = <a href={href('income')}>income</a> received.
        </>
      }
    >
      <div className="stats">
        <Stat label={`Made in ${monthName}`} value={fmtMoney(m.incomeMonth, true)} sub={m.expected ? `${fmtMoney(m.expected, true)} more expected` : 'income received'} href={href('income')} />
        <Stat label={`Spent in ${monthName}`} value={fmtMoney(m.spentMonth, true)} sub={`${fmtMoney(m.committed, true)} committed on open orders`} href={`${href('orders')}?f=received`} />
        <Stat label={`Net ${monthName}`} value={`${net < 0 ? '−' : '+'}${fmtMoney(Math.abs(net), true)}`} tone={net < 0 ? 'bad' : net > 0 ? 'good' : undefined} sub="made minus spent" />
        <Stat label={`Last ${rangeLabel}`} value={`${fmtMoney(m.incomeRange, true)} in`} sub={`${fmtMoney(m.spentRange, true)} out`} />
      </div>
      <div className="an-grid">
        <div className="card an-chart-card">
          <h3 className="an-card-title">Made vs spent · last 12 months</h3>
          <GroupedBars months={m.months} />
        </div>
        <div className="card">
          <h3 className="an-card-title">Spend by budget · last {rangeLabel}</h3>
          <RankList rows={m.byBudget} format={(v) => fmtMoney(v, true)} empty="No orders received in this period." tone="s2" />
          {m.byType.length > 0 && (
            <>
              <h3 className="an-card-title an-gap">Income by type · last {rangeLabel}</h3>
              <RankList rows={m.byType} format={(v) => fmtMoney(v, true)} tone="s1" />
            </>
          )}
        </div>
      </div>
    </Section>
  )
}

function GroupedBars({ months }: { months: { key: string; label: string; income: number; spent: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...months.flatMap((x) => [x.income, x.spent]))
  const W = 600
  const H = 160
  const slot = W / months.length
  const bw = Math.min(16, (slot - 10) / 2)
  const h = hover != null ? months[hover]! : null
  const empty = months.every((x) => !x.income && !x.spent)
  const bar = (x: number, v: number, cls: string, on: boolean) => {
    if (v <= 0) return null
    const bh = Math.max(3, (v / max) * (H - 8))
    const r = Math.min(3, bw / 2)
    return <path className={`${cls}${on ? ' on' : ''}`} d={`M${x},${H} V${H - bh + r} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} V${H} Z`} />
  }
  return (
    <figure className="an-fig">
      <div className="an-legend">
        <span><i className="an-key s1" /> Made</span>
        <span><i className="an-key s2" /> Spent</span>
        <span className="an-readout" aria-live="polite">
          {h ? (
            <>
              {h.label}: <strong>{fmtMoney(h.income, true)}</strong> made · <strong>{fmtMoney(h.spent, true)}</strong> spent
            </>
          ) : empty ? (
            'Nothing recorded yet'
          ) : (
            'Hover a month'
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Income and spending per month for the last 12 months" onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map((t) => (
          <line key={t} x1="0" x2={W} y1={H - (H - 8) * t} y2={H - (H - 8) * t} className="an-grid-line" />
        ))}
        <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} className="an-axis" />
        {months.map((x, i) => {
          const cx = i * slot + slot / 2
          return (
            <g key={x.key} onMouseEnter={() => setHover(i)}>
              <rect x={i * slot} y={0} width={slot} height={H + 18} fill="transparent" />
              {bar(cx - bw - 1, x.income, 'an-bar s1', hover === i)}
              {bar(cx + 1, x.spent, 'an-bar s2', hover === i)}
              <text x={cx} y={H + 14} textAnchor="middle" className="an-tick">{x.label}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

/* ---------------- website ---------------- */

function WebsiteSection({ data, days }: { data: ServerAnalytics | null; days: number }) {
  if (!data) {
    return (
      <Section title="Website" icon="monitor">
        <p className="muted">Loading…</p>
      </Section>
    )
  }
  if (!data.drainConnected) return <WebsiteSetup />
  const w = data.web
  return (
    <Section
      title="Website"
      icon="monitor"
      sub={`beyondstagezero.com · from Vercel Web Analytics · last view ${w.lastEventAt ? fmtDateTime(w.lastEventAt) : '—'}`}
      right={<LivePill n={w.live.visitors} label="on the site now" />}
    >
      <TrafficBody w={w} days={days} bucket={data.bucket} />
    </Section>
  )
}

function LivePill({ n, label }: { n: number; label: string }) {
  return (
    <div className="an-live" title="People in the last 5 minutes">
      <span className="live-dot" aria-hidden="true" />
      <strong>{nf(n)}</strong> {label}
    </div>
  )
}

function TrafficBody({ w, days, bucket, starship }: { w: SiteTraffic; days: number; bucket: Bucket; starship?: boolean }) {
  const series = fillSeries(w.series, days, bucket, { views: 0, visitors: 0 })
  const rangeLabel = RANGES.find((r) => r.days === days)!.label
  const rangeStart = Date.now() - days * 86400000
  const startsLate = w.firstEventAt && new Date(w.firstEventAt).getTime() > rangeStart + 86400000
  return (
    <>
      {startsLate && (
        <p className="an-note small">
          <Icon name="clock" size={13} /> Octopus has views from <strong>{fmtDate(w.firstEventAt)}</strong> onwards — when the Vercel drain was
          connected. Earlier traffic is only in Vercel’s own dashboard, so the start of this {rangeLabel} view is empty, not quiet.
        </p>
      )}
      <div className="stats">
        <Stat label="Page views" value={nf(w.views)} sub={`last ${rangeLabel}`} />
        <Stat label="Visitors" value={nf(w.visitors)} sub="unique devices" />
        {starship ? (
          <>
            <Stat
              label="Peak viewers"
              value={w.peak ? nf(w.peak.viewers) : '—'}
              sub={w.peak ? `at once · ${fmtDateTime(w.peak.at)}` : 'most watching at once'}
            />
            <Stat
              label="Busiest day"
              value={w.busiestDay ? nf(w.busiestDay.views) : '—'}
              sub={w.busiestDay ? `views on ${fmtDate(w.busiestDay.date)}` : 'views in one day'}
            />
          </>
        ) : (
          <>
            <Stat label="Views per visit" value={w.sessions ? (w.views / w.sessions).toFixed(1) : '—'} sub={`${nf(w.sessions)} visits`} />
            <Stat
              label="Top page"
              value={<span className="an-top-page">{w.pages[0]?.key ?? '—'}</span>}
              sub={w.pages[0] ? `${nf(w.pages[0].value)} views` : undefined}
            />
          </>
        )}
      </div>
      <div className="card an-chart-card">
        <h3 className="an-card-title">Views per {bucketNoun(bucket)}</h3>
        <AreaChart points={series.map((p) => ({ date: p.date, value: p.views, extra: p.visitors }))} bucket={bucket} />
      </div>
      <div className="an-grid three">
        <div className="card">
          <h3 className="an-card-title">{starship ? 'Devices & pages' : 'Top pages'}</h3>
          {starship ? (
            <>
              <RankList rows={w.devices.map((d) => ({ key: d.key[0]!.toUpperCase() + d.key.slice(1), value: d.value }))} format={nf} tone="s1" />
              {w.pages.length > 1 && (
                <>
                  <h3 className="an-card-title an-gap">Pages</h3>
                  <RankList rows={w.pages} format={nf} tone="s1" />
                </>
              )}
            </>
          ) : (
            <RankList rows={w.pages} format={nf} tone="s1" />
          )}
        </div>
        <div className="card">
          <h3 className="an-card-title">Where visitors came from</h3>
          <RankList rows={w.referrers} format={nf} tone="s1" />
        </div>
        <div className="card">
          <h3 className="an-card-title">Countries</h3>
          <RankList rows={w.countries.map((c) => ({ key: countryName(c.key), value: c.value }))} format={nf} tone="s1" />
          {!starship && w.devices.length > 0 && (
            <p className="muted small an-devices">
              {w.devices.map((d) => `${d.key} ${Math.round((d.value / Math.max(1, w.views)) * 100)}%`).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

/* ---------------- starship tracker ---------------- */

function StarshipSection({ data, days }: { data: ServerAnalytics | null; days: number }) {
  const now = useNow()
  if (!data) return null
  const s = data.starship
  const f = s.flight
  const liftoff = f?.plannedLiftoff ? new Date(f.plannedLiftoff).getTime() : null
  const site = `https://${s.host}`
  return (
    <Section
      title="Starship Tracker"
      icon="chart"
      sub={
        <>
          <a href={site} target="_blank" rel="noreferrer">{s.host}</a> · from Vercel Web Analytics
          {s.lastEventAt ? ` · last view ${fmtDateTime(s.lastEventAt)}` : ''}
        </>
      }
      right={s.connected ? <LivePill n={s.live.visitors} label="watching now" /> : undefined}
    >
      <div className="card an-flight">
        {f ? (
          <>
            <div className="an-flight-main">
              <span className="an-card-title">Tracking now</span>
              <span className="an-flight-title">
                {f.title}
                {f.ship != null && <span className="muted"> · Ship {f.ship}</span>}
              </span>
              <span className="muted small">
                {liftoff
                  ? `${f.paused ? 'Countdown paused · ' : ''}Planned liftoff ${fmtDateTime(new Date(liftoff).toISOString())}`
                  : 'No liftoff time published yet'}
                {f.landingKind ? ` · ship ${f.landingKind === 'catch' ? 'catch' : f.landingKind}` : ''}
              </span>
            </div>
            {liftoff && <TClock target={liftoff} now={now} />}
            <div className="row gap-s wrap">
              <a className="btn btn-sm" href={site} target="_blank" rel="noreferrer">
                <Icon name="external" size={14} /> Open tracker
              </a>
              {f.webcastUrl && (
                <a className="btn btn-sm" href={f.webcastUrl} target="_blank" rel="noreferrer">
                  <Icon name="play" size={14} /> Webcast
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="muted small">Couldn’t reach the tracker’s flight feed right now — traffic below still updates.</p>
        )}
      </div>
      {s.connected ? (
        <TrafficBody w={s} days={days} bucket={data.bucket} starship />
      ) : (
        <div className="card an-setup">
          <p className="strong">No tracker views yet.</p>
          <p className="muted small">
            The tracker already loads Vercel Web Analytics. Add its Vercel project to the Web Analytics drain
            {data.drainConnected ? ' (the drain is working for the main site)' : ' when you set the drain up (see Website above)'} — Vercel
            → Team Settings → Drains → edit the drain → include the <strong>starship tracker</strong> project.
          </p>
        </div>
      )}
    </Section>
  )
}

function WebsiteSetup() {
  const toast = useToast()
  const { user } = useStore()
  const endpoint = `${window.location.origin}/api/drains/web`
  return (
    <Section title="Website" icon="monitor" sub="Page views from Vercel Web Analytics will show here once it’s connected.">
      <div className="card an-setup">
        <p className="strong">Not connected yet.</p>
        <p className="muted small">One drain covers both beyondstagezero.com and the Starship Tracker — include both Vercel projects in it.</p>
        <p className="muted small">
          Vercel doesn’t offer an API for reading Web Analytics, so it pushes each page view to Octopus instead (a “Drain”, on Vercel Pro).
          {user.role === 'admin' ? ' One-time setup:' : ' Ask an admin to set it up.'}
        </p>
        {user.role === 'admin' && (
          <ol className="an-steps">
            <li>Make sure Web Analytics is turned on for the website’s and the Starship Tracker’s Vercel projects.</li>
            <li>
              Vercel → <strong>Team Settings → Drains → Add Drain</strong>. Choose <strong>Web Analytics</strong>, both projects, and{' '}
              <strong>JSON</strong>.
            </li>
            <li>
              Endpoint:{' '}
              <button className="mono copyable" onClick={() => copyText(endpoint).then(() => toast('Endpoint copied'))}>
                {endpoint} <Icon name="copy" size={12} />
              </button>
            </li>
            <li>
              Copy the drain’s <strong>signing secret</strong> into <code>VERCEL_DRAIN_SECRET</code> on the Octopus project. If Vercel asks to verify the
              endpoint, put the value it shows into <code>VERCEL_DRAIN_VERIFY</code>. Redeploy Octopus.
            </li>
          </ol>
        )}
      </div>
    </Section>
  )
}

function AreaChart({
  points,
  bucket,
  unit = 'views',
  extraUnit = 'visitors',
}: {
  points: { date: string; value: number; extra: number }[]
  bucket: Bucket
  unit?: string
  extraUnit?: string | null
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 600
  const H = 150
  const max = Math.max(1, ...points.map((p) => p.value))
  const step = points.length > 1 ? W / (points.length - 1) : W
  const xy = points.map((p, i) => [i * step, H - (p.value / max) * (H - 10)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const h = hover != null ? points[hover] : null
  const total = points.reduce((t, p) => t + p.value, 0)
  return (
    <figure className="an-fig">
      <div className="an-legend">
        <span className="an-readout" aria-live="polite">
          {h ? (
            <>
              {bucketLabel(h.date, bucket)}: <strong>{nf(h.value)}</strong> {unit}
              {extraUnit && (
                <>
                  {' '}· <strong>{nf(h.extra)}</strong> {extraUnit}
                </>
              )}
            </>
          ) : (
            <>
              <strong>{nf(total)}</strong> {unit} in total
            </>
          )}
        </span>
      </div>
      <div className="an-plot">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${unit} per ${bucket}, ${total} in total`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))
          setHover(Math.max(0, Math.min(points.length - 1, i)))
        }}
      >
        {[0.5, 1].map((t) => (
          <line key={t} x1="0" x2={W} y1={H - (H - 10) * t} y2={H - (H - 10) * t} className="an-grid-line" />
        ))}
        <path d={area} className="an-area" />
        <path d={line} className="an-line" vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <>
            <line x1={xy[hover]![0]} x2={xy[hover]![0]} y1="0" y2={H} className="an-cross" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {hover != null && (
        <span className="an-dot" style={{ left: `${(xy[hover]![0] / W) * 100}%`, top: `${(xy[hover]![1] / H) * 100}%` }} aria-hidden="true" />
      )}
      </div>
      <div className="live-chart-axis an-axis-labels" aria-hidden="true">
        <span>{bucketLabel(points[0]?.date, bucket).replace('Week of ', '')}</span>
        <span>now</span>
      </div>
    </figure>
  )
}

/* ---------------- hub ---------------- */

const TYPE_LABEL = (t: string) => byType.get(t)?.label ?? t

function HubSection({ data, days }: { data: ServerAnalytics | null; days: number }) {
  const movements = useRecords<Movement>('movement')
  const since = localDay(new Date(Date.now() - (days - 1) * 86400000))
  const builds = movements.filter((m) => m.data.kind === 'made' && (m.data.date ?? m.createdAt.slice(0, 10)) >= since)
  const parts = builds.reduce((t, m) => t + movementDelta(m.data), 0)
  if (!data) return null
  const h = data.hub
  const series = fillSeries(h.series, days, data.bucket, { changes: 0 })
  return (
    <Section title="Octopus" icon="chart" sub="How the team is using the hub.">
      <div className="stats">
        <Stat label="Changes made" value={nf(h.changes)} sub="adds, edits & deletes" href={href('activity')} />
        <Stat label="Active people" value={h.people.length} sub={`of ${h.members} on the team`} href={href('team')} />
        <Stat label="Signed in" value={h.signedIn} sub="people this period" />
        <Stat label="Parts built" value={nf(parts)} sub={`${builds.length} build${builds.length === 1 ? '' : 's'} logged`} href={`${href('log')}?f=made`} />
      </div>
      <div className="an-grid">
        <div className="card an-chart-card">
          <h3 className="an-card-title">Changes per {bucketNoun(data.bucket)}</h3>
          <AreaChart points={series.map((p) => ({ date: p.date, value: p.changes, extra: 0 }))} bucket={data.bucket} unit="changes" extraUnit={null} />
        </div>
        <div className="card">
          <h3 className="an-card-title">Most active</h3>
          <RankList rows={h.people.map((p) => ({ key: personName(p.key), value: p.value }))} format={nf} tone="s1" empty="No changes yet." />
          <h3 className="an-card-title an-gap">By module</h3>
          <RankList rows={h.types.map((t) => ({ key: TYPE_LABEL(t.key), value: t.value }))} format={nf} tone="s1" />
        </div>
      </div>
    </Section>
  )
}

/* ---------------- shared bits ---------------- */

function RankList({ rows, format, empty = 'Nothing yet.', tone }: { rows: KV[]; format: (n: number) => string; empty?: string; tone: 's1' | 's2' }) {
  if (!rows.length) return <p className="muted small">{empty}</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="rank">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="rank-bar" style={{ width: `${(r.value / max) * 100}%` }} data-tone={tone} aria-hidden="true" />
          <span className="rank-key" title={r.key}>{r.key}</span>
          <span className="rank-val">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return `${fmtDate(iso)} ${d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`
}

const countries = (() => {
  try {
    return new Intl.DisplayNames(['en-AU'], { type: 'region' })
  } catch {
    return null
  }
})()

function countryName(code: string) {
  if (!code || code === '—') return 'Unknown'
  if (code.length !== 2) return code
  try {
    return countries?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

