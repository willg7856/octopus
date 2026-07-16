import { useMemo } from 'react'
import type { OpMode, TelemetryPoint, VehicleSample } from '../types'

type TelemetryStageProps = {
  mode: OpMode
  burnIndex: number
  thrustCurve: TelemetryPoint[]
  vehicleCurve: VehicleSample[]
  liveThrust: number
  livePressure: number
  liveTemp: number
  liveAltitude: number
  liveVelocity: number
}

export function TelemetryStage({
  mode,
  burnIndex,
  thrustCurve,
  vehicleCurve,
  liveThrust,
  livePressure,
  liveTemp,
  liveAltitude,
  liveVelocity,
}: TelemetryStageProps) {
  const chart = useMemo(() => {
    if (mode === 'launch') {
      return buildPath(vehicleCurve, 'altitude', 'velocity', burnIndex)
    }
    return buildPath(thrustCurve, 'thrust', 'pressure', burnIndex)
  }, [mode, thrustCurve, vehicleCurve, burnIndex])

  const isFire = mode === 'static-fire'
  const isLaunch = mode === 'launch'

  return (
    <section className="panel stage" aria-label="Live telemetry">
      <div className="panel-head">
        <h2 className="panel-title">
          {isFire ? 'Pad burn feed' : isLaunch ? 'Vehicle downlink' : 'Link monitor'}
        </h2>
        <span className="panel-note">
          {isFire ? 'Thrust · pressure' : isLaunch ? 'Altitude · velocity' : 'No active burn'}
        </span>
      </div>
      <div className="stage-body">
        <div className="readouts">
          {isLaunch ? (
            <>
              <Readout label="Altitude" value={liveAltitude.toFixed(0)} unit="m" />
              <Readout label="Velocity" value={liveVelocity.toFixed(0)} unit="m/s" />
              <Readout label="Apogee tgt" value="3000" unit="m" />
              <Readout label="Link" value="VEH→MC" unit="" />
            </>
          ) : (
            <>
              <Readout label="Thrust" value={liveThrust.toFixed(1)} unit="kgf" />
              <Readout label="Chamber P" value={livePressure.toFixed(2)} unit="MPa" />
              <Readout label="Case temp" value={liveTemp.toFixed(0)} unit="°C" />
              <Readout
                label="T+"
                value={(isFire ? burnIndex / 20 : 0).toFixed(2)}
                unit="s"
              />
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
          </svg>
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
              trajectory for Goods Shed display rehearsals. Flight control stays
              onboard — Octopus only moves the data.
            </>
          ) : (
            <>
              <strong>Pad → Goods Shed.</strong> Live-style B1M burn profile
              (~150 kgf, ~3.5 s). This is the pipe into mission control, not the
              motor controller.
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
