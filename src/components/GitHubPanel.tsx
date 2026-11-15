import { useEffect, useMemo, useState } from 'react'
import { fmtDate } from '../lib/derive'

interface GitHubData {
  days: number
  commits: number
  additions: number
  deletions: number
  linesPending: boolean
  contributors: number
  repos: { repo: string; url: string; commits: number; additions: number | null; deletions: number | null }[]
  bucket?: 'hour' | 'day'
  daily: { date: string; commits: number }[]
  truncated: boolean
}

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 182, label: '6mo' },
  { days: 365, label: '1y' },
]

const RANGE_WORDS: Record<number, string> = { 1: '24 hours', 7: '7 days', 30: '30 days', 90: '90 days', 182: '6 months', 365: 'year' }

const nf = (n: number) => n.toLocaleString('en-AU')

function readRange(): number {
  try {
    const v = Number(localStorage.getItem('octopus-gh-range'))
    return RANGES.some((r) => r.days === v) ? v : 30
  } catch {
    return 30
  }
}

/** Pass `days` to control the range from outside (the Analytics page); otherwise it has its own switch. */
export function GitHubPanel({ days: controlled }: { days?: number } = {}) {
  const [own, setDays] = useState(readRange)
  const days = controlled ?? own
  const [data, setData] = useState<GitHubData | null>(null)
  const [error, setError] = useState<{ msg: string; setup: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`/api/github?days=${days}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!live) return
        if (!r.ok) {
          setError({ msg: body.error ?? 'Couldn’t reach GitHub.', setup: body.code === 'not_configured' })
          setData(null)
        } else {
          setError(null)
          setData(body)
          // GitHub works out line counts in the background the first time; check back shortly.
          if (body.linesPending) window.setTimeout(() => live && setRetry((n) => n + 1), 8000)
        }
      })
      .catch(() => live && setError({ msg: 'Couldn’t reach GitHub.', setup: false }))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [days, retry])

  // Bars: daily for ≤30 days, weekly beyond that.
  const bars = useMemo(() => {
    if (!data) return []
    if (data.bucket === 'hour') {
      return data.daily.map((d) => {
        const t = new Date(`${d.date}:00:00Z`)
        const h = t.getHours()
        return { key: d.date, label: `${fmtDate(t.toISOString())} ${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`, value: d.commits }
      })
    }
    if (data.days <= 30) return data.daily.map((d) => ({ key: d.date, label: fmtDate(d.date), value: d.commits }))
    const out: { key: string; label: string; value: number }[] = []
    for (let i = 0; i < data.daily.length; i += 7) {
      const chunk = data.daily.slice(i, i + 7)
      out.push({ key: chunk[0]!.date, label: `week of ${fmtDate(chunk[0]!.date)}`, value: chunk.reduce((t, d) => t + d.commits, 0) })
    }
    return out
  }, [data])

  return (
    <section className="live gh" aria-label="Code pushed to GitHub">
      <header className="live-head">
        <span className="live-title">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Code shipped
        </span>
        {controlled == null && <div className="gh-ranges" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              role="tab"
              aria-selected={r.days === days}
              className={r.days === days ? 'on' : undefined}
              onClick={() => {
                setDays(r.days)
                try {
                  localStorage.setItem('octopus-gh-range', String(r.days))
                } catch {
                  /* ignore */
                }
              }}
            >
              {r.label}
            </button>
          ))}
        </div>}
      </header>

      {error ? (
        <p className="gh-msg">
          {error.msg}
          {error.setup && ' Ask an admin to add it in Vercel → Settings → Environment Variables.'}
        </p>
      ) : !data ? (
        <p className="gh-msg">Loading from GitHub…</p>
      ) : (
        <div className={loading ? 'gh-body loading' : 'gh-body'}>
          <div className="live-grid gh-grid">
            <div className="live-tile">
              <span className="live-label">Commits</span>
              <span className="live-value">{nf(data.commits)}{data.truncated ? '+' : ''}</span>
              <span className="live-sub">last {RANGE_WORDS[data.days] ?? `${data.days} days`}</span>
            </div>
            <div className="live-tile">
              <span className="live-label">Lines added</span>
              <span className="live-value gh-add">{data.linesPending && !data.additions ? '…' : `+${nf(data.additions)}`}</span>
              <span className="live-sub">{data.linesPending ? 'GitHub is still counting' : 'across all repos'}</span>
            </div>
            <div className="live-tile">
              <span className="live-label">Lines removed</span>
              <span className="live-value gh-del">{data.linesPending && !data.deletions ? '…' : `−${nf(data.deletions)}`}</span>
              <span className="live-sub">cleanup counts too</span>
            </div>
            <div className="live-tile">
              <span className="live-label">Active repos</span>
              <span className="live-value">{data.repos.length}</span>
              <span className="live-sub">
                {data.contributors} contributor{data.contributors === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <CommitBars bars={bars} unit={data.bucket === 'hour' ? 'hour' : data.days <= 30 ? 'day' : 'week'} total={data.commits} />

          {data.repos.length > 0 && (
            <ul className="gh-repos">
              {data.repos.slice(0, 6).map((r) => (
                <li key={r.repo}>
                  <a href={r.url} target="_blank" rel="noreferrer">{r.repo.split('/')[1]}</a>
                  <span className="gh-repo-n">{nf(r.commits)} commit{r.commits === 1 ? '' : 's'}</span>
                  {r.additions != null && (
                    <span className="gh-repo-lines">
                      <span className="gh-add">+{nf(r.additions)}</span> <span className="gh-del">−{nf(r.deletions ?? 0)}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function CommitBars({ bars, unit, total }: { bars: { key: string; label: string; value: number }[]; unit: 'hour' | 'day' | 'week'; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...bars.map((b) => b.value))
  const W = 600
  const H = 56
  const gap = bars.length > 40 ? 1 : 2
  const bw = W / Math.max(bars.length, 1) - gap
  const h = hover != null ? bars[hover] : null
  return (
    <figure className="live-chart">
      <figcaption>
        <span className="live-label">Commits per {unit}</span>
        <span className="live-chart-readout" aria-live="polite">
          {h ? (
            <>
              <strong>{h.value}</strong> {h.label}
            </>
          ) : (
            <>
              <strong>{total}</strong> total
            </>
          )}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Commits per ${unit}, ${total} in total`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="live-axis" />
        {bars.map((b, i) => {
          const x = i * (bw + gap)
          const bh = b.value > 0 ? Math.max(3, (b.value / max) * (H - 6)) : 0
          const r = Math.min(2, bw / 2)
          return (
            <g key={b.key} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={0} width={bw + gap} height={H} fill="transparent" />
              {bh > 0 ? (
                <path className={`live-bar gh-bar${hover === i ? ' on' : ''}`} d={`M${x},${H} V${H - bh + r} q0,-${r} ${r},-${r} h${Math.max(0, bw - 2 * r)} q${r},0 ${r},${r} V${H} Z`} />
              ) : (
                <rect x={x} y={H - 2} width={Math.max(bw, 0.5)} height={1} className="live-zero" />
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
