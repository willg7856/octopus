import { useMemo } from 'react'
import type { OpMode, TelemetryPoint, VehicleSample } from '../types'

const KGF_TO_N = 9.80665

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
  onSeek: (index: number) => void
  onTogglePlay: () => void
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
  onSeek,
  onTogglePlay,
}: TelemetryStageProps) {
  const series = mode === 'launch' ? vehicleCurve : thrustCurve
  const maxIndex = Math.max(series.length - 1, 1)
  const tPlus =
    mode === 'idle' ? 0 : mode === 'launch' ? burnIndex / 2 : burnIndex / 20
  const tMax = mode === 'launch' ? (vehicleCurve.length - 1) / 2 : 3.5

  const chart = useMemo(() => {
    if (mode === 'launch') {
      return buildPath(vehicleCurve, 'altitude', 'velocity', burnIndex)
    }
    return buildPath(thrustCurve, 'thrust', 'pressure', burnIndex)
  }, [mode, thrustCurve, vehicleCurve, burnIndex])

  const isFire = mode === 'static-fire'
  const isLaunch = mode === 'launch'
  const thrustN = liveThrust * KGF_TO_N

  return (
    <section className="panel stage" aria-label="Live telemetry">
      <div className="panel-head">
        <h2 className="panel-title">
          {isFire ? 'Pad burn feed' : isLaunch ? 'Vehicle downlink' : 'Link monitor'}
        </h2>
        <span className="panel-note">
          {isFire
            ? 'Thrust · pressure'
            : isLaunch
              ? 'Altitude · velocity'
              : 'No active burn'}
        </span>
      </div>
      <div className="stage-body">
        <div className="readouts readouts-dense">
          {isLaunch ? (
            <>
              <Readout label="Altitude" value={liveAltitude.toFixed(0)} unit="m" />
              <Readout label="Velocity" value={liveVelocity.toFixed(0)} unit="m/s" />
              <Readout label="Apogee tgt" value="3000" unit="m" />
              <Readout label="T+" value={tPlus.toFixed(1)} unit="s" />
            </>
          ) : (
            <>
              <Readout label="Thrust" value={thrustN.toFixed(0)} unit="N" />
              <Readout label="Thrust" value={liveThrust.toFixed(1)} unit="kgf" />
              <Readout label="Chamber P" value={livePressure.toFixed(0)} unit="psi" />
              <Readout label="Case temp" value={liveTemp.toFixed(0)} unit="°C" />
              <Readout label="T+" value={tPlus.toFixed(2)} unit="s" />
            </>
          )}
        </div>

        <div className="chart-wrap" aria-hidden="true">
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
              </>
            )}
          </div>
          <svg viewBox="0 0 640 240" preserveAspectRatio="none">
            <g stroke="var(--chart-grid)" strokeWidth="1">
              {[40, 80, 120, 160, 200].map((y) => (
                <line key={y} x1="0" y1={y} x2="640" y2={y} />
              ))}
            </g>
            {/* Full faint curve for context when scrubbing */}
            {mode !== 'idle' ? (
              <>
                <path
                  className="chart-line chart-line-ghost"
                  d={
                    mode === 'launch'
                      ? buildPath(vehicleCurve, 'altitude', 'velocity', maxIndex).primary
                      : buildPath(thrustCurve, 'thrust', 'pressure', maxIndex).primary
                  }
                  stroke={isLaunch || isFire ? 'var(--ignition)' : 'var(--fg-faint)'}
                />
                <path
                  className="chart-line chart-line-ghost"
                  d={
                    mode === 'launch'
                      ? buildPath(vehicleCurve, 'altitude', 'velocity', maxIndex).secondary
                      : buildPath(thrustCurve, 'thrust', 'pressure', maxIndex).secondary
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
            {mode !== 'idle' ? (
              <line
                className="scrub-cursor"
                x1={(burnIndex / maxIndex) * 640}
                y1="20"
                x2={(burnIndex / maxIndex) * 640}
                y2="230"
              />
            ) : null}
          </svg>
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

        <p className="stage-note">
          {mode === 'idle' ? (
            <>
              <strong>Bench mode.</strong> Octopus is up for integration checks.
              Switch to static fire or launch day when the range is live.
            </>
          ) : isLaunch ? (
            <>
              <strong>Vehicle → mission control.</strong> Simulated B1M-class
              trajectory for Goods Shed display rehearsals. Use the scrubber to
              inspect any point on the flight.
            </>
          ) : (
            <>
              <strong>Pad → Goods Shed.</strong> B1M burn profile (~150 kgf /
              ~1470 N, ~3.5 s). Drag the scrubber to inspect any point on the
              burn.
            </>
          )}
        </p>
      </div>
    </section>
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
        const x = (i / n) * 640
        const y = 220 - (read(p, primaryKey) / maxP) * 180
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  const toSecondary = (points: Array<TelemetryPoint | VehicleSample>) =>
    points
      .map((p, i) => {
        const x = (i / n) * 640
        const y = 220 - (Math.abs(read(p, secondaryKey)) / maxS) * 160
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  return {
    primary: toPrimary(slice),
    secondary: toSecondary(slice),
  }
}
