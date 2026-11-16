import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type Sample } from '../lib/api'
import { useStore } from '../lib/store'
import type { Rec } from '../lib/types'
import { useDialog } from './Dialog'
import { Badge, Button, copyText, useToast } from './ui'

/**
 * Live sensor data (chamber pressure etc.) for one test, straight from the range laptop.
 * Polls Octopus twice a second, so the team sees readings about half a second after they're taken.
 */

const POLL_MS = 500
const WINDOWS = [
  { key: '30', label: '30 s', ms: 30_000 },
  { key: '120', label: '2 min', ms: 120_000 },
  { key: 'all', label: 'Whole test', ms: Infinity },
] as const

const PUBLIC = [
  { value: 'off', label: 'Team only' },
  { value: '10', label: '10 s delay' },
  { value: '30', label: '30 s delay' },
  { value: '60', label: '60 s delay' },
  { value: 'after', label: 'After the test' },
]

const LABELS: Record<string, string> = { chamber: 'Chamber pressure', tank: 'Tank pressure', feed: 'Feed pressure', thrust: 'Thrust' }
export const channelLabel = (c: string) => LABELS[c] ?? c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase())
const fmt = (v: number | undefined) => (v == null ? '—' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1))

function useRangeData(testId: string) {
  const [state, setState] = useState<{ samples: Sample[]; units: Record<string, string>; ok: boolean; at: number }>({
    samples: [],
    units: {},
    ok: true,
    at: 0,
  })
  const cursor = useRef<string | undefined>(undefined)
  const [reset, setReset] = useState(0)

  useEffect(() => {
    let stop = false
    let timer: number | undefined
    cursor.current = undefined
    setState({ samples: [], units: {}, ok: true, at: 0 })
    const poll = async () => {
      if (document.visibilityState === 'visible') {
        try {
          let more = true
          while (more && !stop) {
            const r = await api.rangeData(testId, cursor.current)
            if (stop) return
            cursor.current = r.cursor
            more = r.more
            setState((s) => ({
              samples: r.samples.length ? [...s.samples, ...r.samples] : s.samples,
              units: r.units ? { ...s.units, ...r.units } : s.units,
              ok: true,
              at: Date.now(),
            }))
          }
        } catch {
          if (!stop) setState((s) => ({ ...s, ok: false }))
        }
      }
      if (!stop) timer = window.setTimeout(poll, POLL_MS)
    }
    poll()
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [testId, reset])

  return { ...state, reload: () => setReset((n) => n + 1) }
}

/** Highest value per time bucket, so peaks survive when there are more points than pixels. */
function thin(samples: Sample[], ch: string, max: number): [number, number][] {
  const pts = samples.filter((s) => ch in s)
  if (pts.length <= max) return pts.map((s) => [s.t, s[ch]])
  const t0 = pts[0].t
  const span = pts[pts.length - 1].t - t0 || 1
  const out: [number, number][] = []
  for (const s of pts) {
    const i = Math.min(max - 1, Math.floor(((s.t - t0) / span) * max))
    if (!out[i] || s[ch] > out[i][1]) out[i] = [s.t, s[ch]]
  }
  return out.filter(Boolean)
}

/** Breaks a line where the sender stopped for a while, instead of drawing a straight line across the gap. */
function splitGaps(pts: [number, number][], gapMs = 3000): [number, number][][] {
  const runs: [number, number][][] = []
  let run: [number, number][] = []
  for (const p of pts) {
    if (run.length && p[0] - run[run.length - 1][0] > gapMs) {
      runs.push(run)
      run = []
    }
    run.push(p)
  }
  if (run.length) runs.push(run)
  return runs
}

function niceMax(v: number) {
  if (v <= 0) return 10
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

const COLORS = ['var(--accent)', 'var(--info)', 'var(--good)', 'var(--warn)']

export function PressureChart({ samples, channels, windowMs, now }: {
  samples: Sample[]
  channels: string[]
  windowMs: number
  now: number
}) {
  // Drawn at the real on-screen width so text never stretches.
  const ref = useRef<SVGSVGElement>(null)
  const [W, setW] = useState(1000)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setW(Math.max(280, Math.round(el.clientWidth))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = W < 600 ? 210 : 260
  const PAD = { l: 52, r: 12, t: 12, b: 26 }
  const last = samples.length ? samples[samples.length - 1].t : now
  const end = Number.isFinite(windowMs) ? Math.max(last, Math.min(now, last + 5000)) : last
  const start = Number.isFinite(windowMs) ? end - windowMs : samples.length ? samples[0].t : end - 30_000
  const visible = samples.filter((s) => s.t >= start && s.t <= end)
  const series = channels.map((c) => thin(visible, c, 1000))
  const top = niceMax(Math.max(0, ...series.flat().map(([, v]) => v)) * 1.08)
  const low = Math.min(0, ...series.flat().map(([, v]) => v))
  // Sensor noise just below zero shouldn't drag the axis down; real negative readings still show.
  const bottom = low < -0.05 * top ? -niceMax(-low) : 0
  const x = (t: number) => PAD.l + ((t - start) / (end - start || 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - bottom) / (top - bottom || 1)) * (H - PAD.t - PAD.b)
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => bottom + f * (top - bottom))
  const clock = (t: number) => new Date(t).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit' })

  return (
    <svg ref={ref} className="range-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${channels.map(channelLabel).join(', ')} chart`}>
      {grid.map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="range-grid" />
          <text x={PAD.l - 8} y={y(g) + 4} textAnchor="end" className="range-axis">{fmt(g)}</text>
        </g>
      ))}
      <text x={PAD.l} y={H - 6} className="range-axis">{clock(start)}</text>
      <text x={W - PAD.r} y={H - 6} textAnchor="end" className="range-axis">{clock(end)}</text>
      {series.map((pts, i) =>
        splitGaps(pts).map((run, k) =>
          run.length > 1 ? (
            <polyline key={`${channels[i]}-${k}`} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth={2} vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" points={run.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
          ) : null,
        ),
      )}
    </svg>
  )
}

export function RangePanel({ test, now }: { test: Rec; now: number }) {
  const { update, user } = useStore()
  const toast = useToast()
  const dialog = useDialog()
  const isAdmin = user.role === 'admin'
  const { samples, units, ok, reload } = useRangeData(test.id)
  const [win, setWin] = useState<(typeof WINDOWS)[number]['key']>('30')
  const [showSetup, setShowSetup] = useState(false)
  const [keyInfo, setKeyInfo] = useState<{ set: boolean; updatedAt?: string } | null>(null)
  const d = test.data as Record<string, unknown>
  const mode = String(d.telemetry ?? '30')

  useEffect(() => {
    if (showSetup && !keyInfo) api.rangeKey().then(setKeyInfo, () => setKeyInfo({ set: false }))
  }, [showSetup, keyInfo])

  const channels = useMemo(() => {
    const set = new Set<string>()
    for (let i = Math.max(0, samples.length - 200); i < samples.length; i++) for (const k of Object.keys(samples[i])) if (k !== 't') set.add(k)
    return [...set].sort((a, b) => (a === 'chamber' ? -1 : b === 'chamber' ? 1 : a.localeCompare(b)))
  }, [samples])
  const peaks = useMemo(() => {
    const p: Record<string, number> = {}
    for (const s of samples) for (const [k, v] of Object.entries(s)) if (k !== 't' && (p[k] === undefined || v > p[k])) p[k] = v
    return p
  }, [samples])
  const latest = samples[samples.length - 1]
  const age = latest ? now - latest.t : Infinity
  const receiving = age < 3000

  const setMode = async (value: string) => {
    try {
      await update(test, { ...d, telemetry: value })
      toast(value === 'off' ? 'Sensor data is team-only' : `On .space: ${PUBLIC.find((p) => p.value === value)?.label}`, { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  const makeKey = async () => {
    if (keyInfo?.set && !(await dialog.confirm({
      title: 'Make a new range key?',
      message: 'The old key stops working straight away, so the range laptop will need the new one.',
      confirmLabel: 'Make new key',
      danger: true,
    }))) return
    try {
      const r = await api.newRangeKey()
      setKeyInfo(r)
      await copyText(r.key).catch(() => undefined)
      await dialog.confirm({
        title: 'Range laptop key',
        message: (
          <>
            <p><code className="range-key">{r.key}</code></p>
            <p>Copied to your clipboard. Paste it into the sender on the range laptop. It won’t be shown again. If you lose it, make a new one.</p>
          </>
        ),
        confirmLabel: 'Done',
      })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  const clear = async () => {
    if (!(await dialog.confirm({
      title: 'Delete this test’s sensor data?',
      message: `All ${samples.length.toLocaleString()} readings for “${String(d.name)}” are removed from Octopus and .space. The CSV on the range laptop is untouched.`,
      confirmLabel: 'Delete data',
      danger: true,
    }))) return
    try {
      const r = await api.clearRangeData(test.id)
      toast(`Deleted ${r.deleted} batches`, { tone: 'good' })
      reload()
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  return (
    <section className="card range-panel">
      <div className="row between wrap gap-s">
        <div>
          <h2 className="card-title">Live sensor data</h2>
          <p className={`small range-status${receiving ? ' on' : ''}`}>
            <span className="range-dot" aria-hidden="true" />
            {!ok
              ? 'Can’t reach Octopus, retrying…'
              : receiving
                ? `Receiving from the range · ${(Math.max(0, age) / 1000).toFixed(1)} s behind`
                : latest
                  ? `Last reading ${Math.round(age / 60_000) < 1 ? `${Math.round(age / 1000)} s` : `${Math.round(age / 60_000)} min`} ago`
                  : 'No readings yet. Start the sender on the range laptop and set the test to Live or Hold.'}
          </p>
        </div>
        <div className="row gap-s wrap">
          <label className="range-public">
            <span className="muted small">On .space</span>
            <select className="select-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
              {PUBLIC.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <Button small variant="ghost" icon="download" onClick={() => setShowSetup(!showSetup)}>Range laptop</Button>
        </div>
      </div>

      {channels.length > 0 && (
        <>
          <div className="range-readouts">
            {channels.map((c) => (
              <div key={c} className="range-readout">
                <span className="muted small">{channelLabel(c)}</span>
                <span className="range-value">{fmt(latest?.[c])}<small>{units[c] ?? ''}</small></span>
                <span className="muted small">Peak {fmt(peaks[c])} {units[c] ?? ''}</span>
              </div>
            ))}
          </div>
          <div className="row between wrap gap-s">
            <div className="chips" role="radiogroup" aria-label="Chart window">
              {WINDOWS.map((w) => (
                <button key={w.key} type="button" role="radio" aria-checked={win === w.key} className={`chip${win === w.key ? ' on' : ''}`} onClick={() => setWin(w.key)}>
                  {w.label}
                </button>
              ))}
            </div>
            <span className="muted small">{samples.length.toLocaleString()} readings</span>
          </div>
          <PressureChart samples={samples} channels={channels} windowMs={WINDOWS.find((w) => w.key === win)!.ms} now={now} />
        </>
      )}

      {showSetup && (
        <div className="range-setup">
          <p>
            <strong>1. Key.</strong>{' '}
            {keyInfo == null ? 'Checking…' : keyInfo.set
              ? <>A key is set{keyInfo.updatedAt ? ` (made ${new Date(keyInfo.updatedAt).toLocaleDateString('en-AU')})` : ''}. </>
              : 'No key yet. '}
            {isAdmin
              ? <Button small onClick={makeKey}>{keyInfo?.set ? 'Make a new key' : 'Make a key'}</Button>
              : <span className="muted">Ask an admin to make one.</span>}
          </p>
          <p>
            <strong>2. Sender.</strong> On the range laptop (needs Python 3):{' '}
            <a href="/range/range_sender.py" download>download range_sender.py</a>, then run <code>pip install pyserial</code>.
          </p>
          <p><strong>3. Run it</strong> with the Arduino plugged in (it prints one reading per line, e.g. <code>98.4</code> or <code>chamber=98.4,tank=150</code>):</p>
          <pre>python3 range_sender.py --port COM3 --key bszr_…</pre>
          <p className="muted small">
            On a Mac/Linux the port looks like <code>/dev/ttyACM0</code> or <code>/dev/cu.usbmodem…</code>. Every reading is also saved to a CSV on the
            laptop, even if the internet drops. Readings go to whichever test is Live or on Hold here. To try it without hardware:{' '}
            <code>python3 range_sender.py --simulate --key bszr_…</code>
          </p>
          {isAdmin && samples.length > 0 && (
            <p><Button small variant="ghost" icon="trash" onClick={clear}>Delete this test’s sensor data</Button> <span className="muted small">e.g. after a dry run</span></p>
          )}
        </div>
      )}
      {mode !== 'off' && channels.length > 0 && (
        <p className="muted small">
          <Badge tone="good">Public</Badge>{' '}
          {mode === 'after' ? 'Viewers on .space see the chart once the test is Complete.' : `Viewers on .space see this ${mode} seconds behind you.`}
        </p>
      )}
    </section>
  )
}
