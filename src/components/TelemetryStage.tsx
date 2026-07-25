import { useMemo, useRef } from 'react'
import type {
  Channel,
  EventItem,
  OpMode,
  TelemetryPoint,
  VehicleSample,
} from '../types'
import { computeBurnStats, impulseToIndex, KGF_TO_N } from '../motorStats'

type TelemetryStageProps = {
  mode: OpMode
  burnIndex: number
  playing: boolean
  thrustCurve: TelemetryPoint[]
  vehicleCurve: VehicleSample[]
  liveThrust: number
  livePressure: number
  liveTemp: number
  liveAltitude: number
  liveVelocity: number
  liveAccel: number
  liveBattery: number
  liveSats: number
  channels: Channel[]
  events: EventItem[]
  selectedChannelId: string
  recording: boolean
  onSeek: (index: number) => void
  onTogglePlay: () => void
  onSelectChannel: (id: string) => void
}

export function TelemetryStage({
  mode,
  burnIndex,
  playing,
  thrustCurve,
  vehicleCurve,
  liveThrust,
  livePressure,
  liveTemp,
  liveAltitude,
  liveVelocity,
  liveAccel,
  liveBattery,
  liveSats,
  channels,
  events,
  selectedChannelId,
  recording,
  onSeek,
  onTogglePlay,
  onSelectChannel,
}: TelemetryStageProps) {
  const chartRef = useRef<SVGSVGElement>(null)
  const series = mode === 'launch' ? vehicleCurve : thrustCurve
  const maxIndex = Math.max(series.length - 1, 1)
  const tPlus =
    mode === 'idle' ? 0 : mode === 'launch' ? burnIndex / 2 : burnIndex / 20
  const tMax = mode === 'launch' ? (vehicleCurve.length - 1) / 2 : 3.5

  const stats = useMemo(() => computeBurnStats(thrustCurve), [thrustCurve])
  const impulseSoFar = useMemo(
    () => (mode === 'static-fire' ? impulseToIndex(thrustCurve, burnIndex) : 0),
    [mode, thrustCurve, burnIndex],
  )

  const chart = useMemo(() => {
    if (mode === 'launch') {
      return buildPath(vehicleCurve, 'altitude', 'velocity', burnIndex)
    }
    return buildPath(thrustCurve, 'thrust', 'pressure', burnIndex)
  }, [mode, thrustCurve, vehicleCurve, burnIndex])

  const fullBurn = useMemo(
    () => buildPath(thrustCurve, 'thrust', 'pressure', maxIndex),
    [thrustCurve, maxIndex],
  )

  const thrustFill = useMemo(() => {
    if (mode !== 'static-fire') return ''
    return buildFill(thrustCurve, 'thrust', burnIndex)
  }, [mode, thrustCurve, burnIndex])

  const isFire = mode === 'static-fire'
  const isLaunch = mode === 'launch'
  const thrustN = liveThrust * KGF_TO_N
  const visibleChannels = channels.filter((ch) => {
    if (mode === 'launch') return true
    if (mode === 'static-fire') return ch.kind !== 'vehicle'
    return ch.kind === 'pad' || ch.kind === 'shed'
  })
  const recentEvents = events.slice(0, 6)

  function seekFromPointer(clientX: number) {
    const svg = chartRef.current
    if (!svg || mode === 'idle') return
    const rect = svg.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onSeek(Math.round(ratio * maxIndex))
  }

  return (
    <section className="panel stage" aria-label="Live telemetry">
      <div className="panel-head">
        <h2 className="panel-title">
          {isFire ? 'Pad burn feed' : isLaunch ? 'Vehicle downlink' : 'Link monitor'}
        </h2>
        <span className="panel-note">
          {isFire
            ? 'Thrust · pressure · impulse'
            : isLaunch
              ? 'Altitude · velocity · vehicle health'
              : 'Bench — no active burn'}
        </span>
      </div>
      <div className="stage-body">
        {isFire ? (
          <div className="motor-stats" aria-label="Burn performance">
            <Stat label="Total impulse" value={stats.totalImpulseNs.toFixed(0)} unit="N·s" />
            <Stat label="Burn time" value={stats.burnTime.toFixed(2)} unit="s" />
            <Stat label="Max thrust" value={stats.maxThrustN.toFixed(0)} unit="N" />
            <Stat label="Avg thrust" value={stats.avgThrustN.toFixed(0)} unit="N" />
            <Stat label="Max pressure" value={stats.maxPressurePsi.toFixed(0)} unit="psi" />
            <Stat
              label="Impulse @ cursor"
              value={impulseSoFar.toFixed(0)}
              unit="N·s"
              accent
            />
          </div>
        ) : null}

        <div className={`readouts ${isLaunch || isFire ? 'readouts-dense' : ''}`}>
          {isLaunch ? (
            <>
              <Readout label="Altitude" value={liveAltitude.toFixed(0)} unit="m" />
              <Readout label="Velocity" value={liveVelocity.toFixed(0)} unit="m/s" />
              <Readout label="Accel" value={liveAccel.toFixed(1)} unit="g" />
              <Readout label="Battery" value={liveBattery.toFixed(1)} unit="V" />
              <Readout label="GPS" value={String(liveSats)} unit="sats" />
              <Readout label="T+" value={tPlus.toFixed(1)} unit="s" />
            </>
          ) : isFire ? (
            <>
              <Readout
                label="Thrust"
                value={thrustN.toFixed(0)}
                unit={`N · ${liveThrust.toFixed(1)} kgf`}
              />
              <Readout label="Chamber P" value={livePressure.toFixed(0)} unit="psi" />
              <Readout label="Case temp" value={liveTemp.toFixed(0)} unit="°C" />
              <Readout label="T+" value={tPlus.toFixed(2)} unit="s" />
            </>
          ) : (
            <>
              <Readout label="Link" value="Idle" unit="" />
              <Readout label="T+" value="0.00" unit="s" />
            </>
          )}
        </div>

        <div className="chart-block">
          <div className="chart-legend">
            {isLaunch ? (
              <>
                <span className="legend-item" data-series="altitude">
                  <span className="legend-swatch" /> Altitude
                </span>
                <span className="legend-item" data-series="velocity">
                  <span className="legend-swatch" /> Velocity
                </span>
              </>
            ) : (
              <>
                <span className="legend-item" data-series="thrust">
                  <span className="legend-swatch" /> Thrust
                </span>
                <span className="legend-item" data-series="pressure">
                  <span className="legend-swatch" /> Pressure
                </span>
                <span className="legend-hint">Click / drag to scrub</span>
              </>
            )}
          </div>
          <div
            className="chart-wrap"
            onPointerDown={(e) => {
              if (mode === 'idle') return
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              seekFromPointer(e.clientX)
            }}
            onPointerMove={(e) => {
              if (mode === 'idle' || !(e.buttons & 1)) return
              seekFromPointer(e.clientX)
            }}
          >
            <svg
              ref={chartRef}
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Burn curve"
            >
              <g stroke="var(--chart-grid)" strokeWidth="1">
                {[0.25, 0.5, 0.75].map((t) => {
                  const y = CHART_PAD_TOP + (1 - t) * CHART_PLOT_H
                  return <line key={t} x1="0" y1={y} x2={CHART_W} y2={y} />
                })}
              </g>

              {isFire && thrustFill ? (
                <path className="chart-fill" d={thrustFill} />
              ) : null}

              {mode !== 'idle' ? (
                <>
                  <path
                    className="chart-line chart-line-ghost"
                    d={
                      isLaunch
                        ? buildPath(vehicleCurve, 'altitude', 'velocity', maxIndex).primary
                        : fullBurn.primary
                    }
                    stroke={isLaunch || isFire ? 'var(--ignition)' : 'var(--fg-faint)'}
                  />
                  <path
                    className="chart-line chart-line-ghost"
                    d={
                      isLaunch
                        ? buildPath(vehicleCurve, 'altitude', 'velocity', maxIndex).secondary
                        : fullBurn.secondary
                    }
                    stroke="var(--telem-cyan)"
                  />
                </>
              ) : null}

              <path
                className="chart-line"
                d={chart.primary}
                stroke={isLaunch || isFire ? 'var(--ignition)' : 'var(--fg-faint)'}
              />
              <path
                className="chart-line"
                d={chart.secondary}
                stroke="var(--telem-cyan)"
                style={{ animationDelay: '0.15s' }}
              />

              {isFire ? (
                <>
                  <BurnMarker
                    index={stats.maxThrustIndex}
                    maxIndex={maxIndex}
                    label="P"
                    title="Max thrust"
                  />
                  <BurnMarker
                    index={stats.burnoutIndex}
                    maxIndex={maxIndex}
                    label="B"
                    title="Burnout"
                  />
                </>
              ) : null}

              {mode !== 'idle' ? (
                <line
                  className="scrub-cursor"
                  x1={(burnIndex / maxIndex) * CHART_W}
                  y1={CHART_PAD_TOP}
                  x2={(burnIndex / maxIndex) * CHART_W}
                  y2={CHART_BASE}
                />
              ) : null}
            </svg>
          </div>
        </div>

        <div className="scrubber">
          <button
            type="button"
            className="scrubber-play"
            onClick={onTogglePlay}
            disabled={mode === 'idle'}
            aria-label={playing ? 'Pause playback' : 'Play playback'}
          >
            {playing ? 'Pause' : 'Play'}
          </button>

          {isFire ? (
            <div className="scrubber-jumps" role="group" aria-label="Jump to burn event">
              <button type="button" className="scrubber-jump" onClick={() => onSeek(0)}>
                Ignition
              </button>
              <button
                type="button"
                className="scrubber-jump"
                onClick={() => onSeek(stats.maxThrustIndex)}
              >
                Max thrust
              </button>
              <button
                type="button"
                className="scrubber-jump"
                onClick={() => onSeek(stats.burnoutIndex)}
              >
                Burnout
              </button>
            </div>
          ) : null}

          <label className="scrubber-track">
            <span className="scrubber-label">
              Scrub · T+{tPlus.toFixed(2)}s / {tMax.toFixed(1)}s
            </span>
            <input
              type="range"
              min={0}
              max={maxIndex}
              step={1}
              value={Math.min(burnIndex, maxIndex)}
              disabled={mode === 'idle'}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Burn time scrubber"
            />
          </label>
        </div>

        <div className="stage-fill" aria-label="Live context">
          <div className="stage-status" aria-label="Feed status">
            <span className="stage-pill" data-on="true">
              View only
            </span>
            <span className="stage-pill" data-on={recording ? 'true' : 'false'}>
              {recording ? 'Logger on' : 'Logger off'}
            </span>
            <span className="stage-pill" data-on={playing ? 'true' : 'false'}>
              {playing ? 'Playing' : 'Paused'}
            </span>
          </div>

          <div className="stage-fill-grid">
            <section className="stage-card" aria-label="Channel health">
              <h3 className="section-label">Channel health</h3>
              <ul className="stage-channel-list">
                {visibleChannels.map((ch) => (
                  <li key={ch.id}>
                    <button
                      type="button"
                      className="stage-channel"
                      data-status={ch.status}
                      aria-pressed={selectedChannelId === ch.id}
                      onClick={() => onSelectChannel(ch.id)}
                    >
                      <span className="stage-channel-name">{ch.name}</span>
                      <span className="stage-channel-meta">
                        {ch.latencyMs ? `${ch.latencyMs} ms` : '—'} ·{' '}
                        {ch.dropPct.toFixed(1)}%
                      </span>
                      <span className="chip" data-tone={statusTone(ch.status)}>
                        {ch.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="stage-card" aria-label="Recent downlink">
              <h3 className="section-label">Recent downlink</h3>
              <ul className="stage-event-list">
                {recentEvents.map((event) => (
                  <li key={event.id} className="stage-event" data-level={event.level}>
                    <span className="stage-event-time">{event.time}</span>
                    <span className="stage-event-src">{event.source}</span>
                    <span className="stage-event-msg">{event.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </section>
  )
}

function statusTone(status: Channel['status']) {
  if (status === 'nominal') return 'green'
  if (status === 'degraded') return 'amber'
  if (status === 'lost') return 'red'
  return 'ink'
}

const CHART_W = 640
const CHART_H = 200
const CHART_PAD_TOP = 22
const CHART_PAD_BOTTOM = 16
const CHART_PLOT_H = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM
const CHART_BASE = CHART_H - CHART_PAD_BOTTOM

function chartY(value: number, max: number, scale = 1) {
  const ratio = Math.min(1, Math.max(0, value / Math.max(max, 1)))
  return CHART_BASE - ratio * CHART_PLOT_H * scale
}

function BurnMarker({
  index,
  maxIndex,
  label,
  title,
}: {
  index: number
  maxIndex: number
  label: string
  title: string
}) {
  const x = (index / maxIndex) * CHART_W
  return (
    <g className="burn-marker" aria-label={title}>
      <line x1={x} y1={CHART_PAD_TOP} x2={x} y2={CHART_BASE} />
      <circle cx={x} cy={CHART_PAD_TOP} r="6" />
      <text x={x} y={CHART_PAD_TOP + 3.5} textAnchor="middle">
        {label}
      </text>
    </g>
  )
}

function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit: string
  accent?: boolean
}) {
  return (
    <div className={`motor-stat${accent ? ' motor-stat-accent' : ''}`}>
      <span className="motor-stat-label">{label}</span>
      <span className="motor-stat-value">
        {value}
        <span className="motor-stat-unit">{unit}</span>
      </span>
    </div>
  )
}

function Readout({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="readout">
      <p className="readout-label">{label}</p>
      <p className="readout-value">
        {value}
        {unit ? <span className="readout-unit">{unit}</span> : null}
      </p>
    </div>
  )
}

function buildPath(
  series: Array<TelemetryPoint | VehicleSample>,
  primaryKey: 'thrust' | 'altitude',
  secondaryKey: 'pressure' | 'velocity',
  upTo: number,
) {
  const slice = series.slice(0, Math.max(2, upTo + 1))
  const read = (p: TelemetryPoint | VehicleSample, key: string) => {
    if (key === 'thrust' && 'thrust' in p) return p.thrust
    if (key === 'pressure' && 'pressure' in p) return p.pressure
    if (key === 'altitude' && 'altitude' in p) return p.altitude
    if (key === 'velocity' && 'velocity' in p) return p.velocity
    return 0
  }

  const maxP = Math.max(...series.map((p) => read(p, primaryKey)), 1)
  const maxS = Math.max(...series.map((p) => Math.abs(read(p, secondaryKey))), 1)
  const n = Math.max(series.length - 1, 1)

  const toPrimary = (points: Array<TelemetryPoint | VehicleSample>) =>
    points
      .map((p, i) => {
        const x = (i / n) * CHART_W
        const y = chartY(read(p, primaryKey), maxP)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  const toSecondary = (points: Array<TelemetryPoint | VehicleSample>) =>
    points
      .map((p, i) => {
        const x = (i / n) * CHART_W
        const y = chartY(Math.abs(read(p, secondaryKey)), maxS, 0.9)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  return {
    primary: toPrimary(slice),
    secondary: toSecondary(slice),
  }
}

function buildFill(curve: TelemetryPoint[], key: 'thrust', upTo: number) {
  const n = Math.max(curve.length - 1, 1)
  const max = Math.max(...curve.map((p) => p.thrust), 1)
  const end = Math.max(2, Math.min(upTo + 1, curve.length))
  const pts = curve.slice(0, end)
  if (pts.length < 2) return ''
  const line = pts
    .map((p, i) => {
      const x = (i / n) * CHART_W
      const y = chartY(p[key], max)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastX = ((end - 1) / n) * CHART_W
  return `${line} L${lastX.toFixed(1)},${CHART_BASE} L0,${CHART_BASE} Z`
}
