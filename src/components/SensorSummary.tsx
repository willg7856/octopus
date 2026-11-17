import { useEffect, useState } from 'react'
import { api, type Sample } from '../lib/api'
import { PressureChart } from './RangePanel'
import { Button } from './ui'

/**
 * What the sensor data says about a test: burn time, thrust, total impulse and chamber pressure,
 * worked out by Octopus from the readings (see summarize() in api/_lib/telemetry.ts), plus the
 * whole curve and a CSV download.
 */

export interface Summary {
  samples: number
  channels: string[]
  units: Record<string, string>
  from: number
  to: number
  burn: { start: number; end: number; seconds: number; basis: 'thrust' | 'chamber' } | null
  thrust: { peakKg: number; peakN: number; avgKg: number; avgN: number; impulseNs: number; motorClass: string } | null
  chamber: { peak: number; avg: number; unit: string } | null
}

const n0 = (v: number) => Math.round(v).toLocaleString('en-AU')
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-AU', { maximumFractionDigits: 1 })

/** The test log's text fields, filled from a summary. */
export function summaryFields(s: Summary): Record<string, string> {
  const out: Record<string, string> = {}
  if (s.burn) out.burnTime = `${s.burn.seconds.toFixed(2)} s`
  if (s.thrust) {
    out.peakThrust = `${n1(s.thrust.peakKg)} kgf (${n0(s.thrust.peakN)} N)`
    if (s.thrust.impulseNs > 0) out.impulse = `${n0(s.thrust.impulseNs)} N·s (${s.thrust.motorClass})`
  }
  if (s.chamber) out.peakPressure = `${n0(s.chamber.peak)} ${s.chamber.unit}`
  return out
}

export function useSummary(testId: string | undefined) {
  const [state, setState] = useState<{ summary: Summary | null; samples: Sample[]; loading: boolean; error?: string }>({
    summary: null,
    samples: [],
    loading: !!testId,
  })
  useEffect(() => {
    if (!testId) return
    let stop = false
    setState((s) => ({ ...s, loading: true }))
    Promise.all([
      fetch(`/api/range/summary?test=${encodeURIComponent(testId)}`, { credentials: 'same-origin' }).then((r) => r.json()),
      api.rangeData(testId),
    ])
      .then(([sum, data]) => !stop && setState({ summary: sum.summary ?? null, samples: data.samples, loading: false }))
      .catch((e) => !stop && setState({ summary: null, samples: [], loading: false, error: (e as Error).message }))
    return () => {
      stop = true
    }
  }, [testId])
  return state
}

export function SensorSummary({ testId, name, onFill, fillLabel = 'Fill in from sensor data' }: {
  testId: string
  name?: string
  onFill?: (fields: Record<string, string>) => void
  fillLabel?: string
}) {
  const { summary: s, samples, loading, error } = useSummary(testId)
  if (loading) return <p className="muted small">Working out the summary…</p>
  if (error) return <p className="muted small">Couldn’t load the sensor data ({error}).</p>
  if (!s) return <p className="muted small">No sensor data for this test yet.</p>
  const channels = s.channels.sort((a, b) => (a === 'thrust' ? -1 : b === 'thrust' ? 1 : a.localeCompare(b)))

  const stats: [string, string, string?][] = []
  if (s.burn) stats.push(['Burn time', `${s.burn.seconds.toFixed(2)} s`, s.burn.basis === 'chamber' ? 'from chamber pressure' : undefined])
  if (s.thrust) {
    stats.push(['Peak thrust', `${n1(s.thrust.peakKg)} kgf`, `${n0(s.thrust.peakN)} N`])
    if (s.burn) stats.push(['Average thrust', `${n1(s.thrust.avgKg)} kgf`, `${n0(s.thrust.avgN)} N`])
    if (s.thrust.impulseNs > 0) stats.push(['Total impulse', `${n0(s.thrust.impulseNs)} N·s`, `${s.thrust.motorClass} class motor`])
  }
  if (s.chamber) {
    stats.push(['Peak chamber', `${n0(s.chamber.peak)} ${s.chamber.unit}`])
    if (s.burn) stats.push(['Average chamber', `${n0(s.chamber.avg)} ${s.chamber.unit}`, 'during the burn'])
  }

  return (
    <div className="sensor-summary">
      {stats.length ? (
        <dl className="sensor-stats">
          {stats.map(([label, value, sub]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
              {sub && <span className="muted small">{sub}</span>}
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted small">No burn found in the readings yet (thrust never went above 0.5 kg, or pressure above 5 psi).</p>
      )}
      {samples.length > 1 && <PressureChart samples={samples} channels={channels} windowMs={Infinity} now={Date.now()} />}
      <div className="row gap-s wrap">
        {onFill && stats.length > 0 && (
          <Button small variant="primary" onClick={() => onFill(summaryFields(s))}>{fillLabel}</Button>
        )}
        <a className="btn btn-sm" href={`/api/range/csv?test=${encodeURIComponent(testId)}${name ? `&name=${encodeURIComponent(name)}` : ''}`} download>
          Download CSV
        </a>
        <span className="muted small">
          {s.samples.toLocaleString('en-AU')} readings over {Math.round((s.to - s.from) / 1000)} s. The range laptop’s own CSV has every reading.
        </span>
      </div>
    </div>
  )
}
