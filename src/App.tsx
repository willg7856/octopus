import { useEffect, useMemo, useState } from 'react'
import {
  CHANNELS,
  EVENTS,
  OPERATION,
  buildThrustCurve,
  buildVehicleCurve,
} from './data'
import type { Channel, EventItem, OpMode } from './types'
import { Header } from './components/Header'
import { ModePanel } from './components/ModePanel'
import { TelemetryStage } from './components/TelemetryStage'
import { LinkDetail } from './components/LinkDetail'
import { EventStream } from './components/EventStream'

export default function App() {
  const [mode, setMode] = useState<OpMode>('static-fire')
  const [channels, setChannels] = useState(CHANNELS)
  const [selectedChannelId, setSelectedChannelId] = useState('pad-thrust')
  const [events, setEvents] = useState(EVENTS)
  const [armed, setArmed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [burnIndex, setBurnIndex] = useState(12)

  const thrustCurve = useMemo(() => buildThrustCurve(), [])
  const vehicleCurve = useMemo(() => buildVehicleCurve(), [])

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  )

  const linkState = useMemo(() => aggregateLink(channels, mode), [channels, mode])

  const sample = thrustCurve[Math.min(burnIndex, thrustCurve.length - 1)]
  const vehicle = vehicleCurve[Math.min(burnIndex, vehicleCurve.length - 1)]

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(id)
  }, [toast])

  // Animate burn / trajectory playhead
  useEffect(() => {
    if (mode === 'idle') {
      setBurnIndex(0)
      return
    }
    const max = mode === 'launch' ? vehicleCurve.length - 1 : thrustCurve.length - 1
    const id = window.setInterval(() => {
      setBurnIndex((i) => (i >= max ? (mode === 'static-fire' ? 8 : 0) : i + 1))
    }, mode === 'launch' ? 120 : 90)
    return () => window.clearInterval(id)
  }, [mode, thrustCurve.length, vehicleCurve.length])

  // Soft latency jitter on live pad channels
  useEffect(() => {
    const id = window.setInterval(() => {
      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.status === 'standby' || ch.status === 'lost') return ch
          const delta = Math.round((Math.random() - 0.45) * 10)
          const latencyMs = Math.max(12, ch.latencyMs + delta)
          return {
            ...ch,
            latencyMs,
            lastPacket: `${(latencyMs / 1000).toFixed(2)}s`,
            status: latencyMs > 150 ? 'degraded' : ch.id === 'pad-video' && latencyMs > 120 ? 'degraded' : 'nominal',
          }
        }),
      )
    }, 1800)
    return () => window.clearInterval(id)
  }, [])

  function handleModeChange(next: OpMode) {
    setMode(next)
    setArmed(false)
    if (next === 'launch') {
      setSelectedChannelId('veh-avionics')
      setChannels((prev) =>
        prev.map((ch) =>
          ch.kind === 'vehicle'
            ? { ...ch, status: 'nominal', latencyMs: 64, lastPacket: '0.06s' }
            : ch,
        ),
      )
      setToast('Launch day mode — vehicle path enabled')
    } else if (next === 'static-fire') {
      setSelectedChannelId('pad-thrust')
      setChannels((prev) =>
        prev.map((ch) =>
          ch.kind === 'vehicle'
            ? { ...ch, status: 'standby', latencyMs: 0, lastPacket: '—' }
            : ch,
        ),
      )
      setToast('Static fire mode — pad → Goods Shed')
    } else {
      setArmed(false)
      setToast('Idle — Octopus on bench')
    }
  }

  function handleArm() {
    setArmed((v) => {
      const next = !v
      setToast(next ? 'Ignition enable armed on MC side' : 'Ignition enable disarmed')
      pushEvent(next ? 'ok' : 'info', 'MC', next ? 'Ignition enable ARMED' : 'Ignition enable SAFE')
      return next
    })
  }

  function handleMarkEvent() {
    pushEvent('info', 'MC', `Manual mark · T+${(burnIndex / 20).toFixed(2)}s · ${selectedChannel?.name ?? 'channel'}`)
    setToast('Timeline event marked')
  }

  function handleClear() {
    pushEvent('warn', 'SHED', 'Goods Shed buffer cleared by operator')
    setToast('Shed buffer cleared')
  }

  function pushEvent(level: EventItem['level'], source: string, message: string) {
    const time = formatClock(new Date())
    setEvents((prev) => [
      {
        id: `e-${Date.now()}`,
        time,
        level,
        source,
        message,
      },
      ...prev,
    ].slice(0, 12))
  }

  return (
    <div className="app">
      <div className="shell">
        <Header
          clock={clock}
          linkState={linkState}
          sessionId={OPERATION.id}
        />

        <div className="ops-strip" aria-label="Operation summary">
          <div className="ops-cell">
            <p className="ops-label">Operation</p>
            <p className="ops-value" data-accent="true">
              {OPERATION.label}
            </p>
          </div>
          <div className="ops-cell">
            <p className="ops-label">Vehicle</p>
            <p className="ops-value">{OPERATION.vehicle}</p>
          </div>
          <div className="ops-cell">
            <p className="ops-label">Site</p>
            <p className="ops-value">{OPERATION.site}</p>
          </div>
          <div className="ops-cell">
            <p className="ops-label">Window</p>
            <p className="ops-value">{OPERATION.window}</p>
          </div>
        </div>

        <main className="console">
          <ModePanel
            mode={mode}
            onModeChange={handleModeChange}
            channels={channels}
            selectedChannelId={selectedChannelId}
            onSelectChannel={setSelectedChannelId}
          />
          <TelemetryStage
            mode={mode}
            burnIndex={burnIndex}
            thrustCurve={thrustCurve}
            vehicleCurve={vehicleCurve}
            liveThrust={mode === 'idle' ? 0 : sample.thrust}
            livePressure={mode === 'idle' ? 0 : sample.pressure}
            liveTemp={mode === 'idle' ? 22 : sample.temp}
            liveAltitude={mode === 'launch' ? vehicle.altitude : 0}
            liveVelocity={mode === 'launch' ? vehicle.velocity : 0}
          />
          <LinkDetail
            channel={selectedChannel}
            operation={OPERATION}
            armed={armed}
            onArm={handleArm}
            onMarkEvent={handleMarkEvent}
            onClear={handleClear}
          />
        </main>

        <EventStream events={events} />
      </div>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function formatClock(d: Date) {
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function aggregateLink(channels: Channel[], mode: OpMode) {
  const relevant =
    mode === 'launch'
      ? channels
      : mode === 'static-fire'
        ? channels.filter((c) => c.kind !== 'vehicle')
        : channels.filter((c) => c.kind === 'shed' || c.kind === 'pad')

  if (relevant.some((c) => c.status === 'lost')) return 'lost'
  if (relevant.some((c) => c.status === 'degraded')) return 'degraded'
  if (mode === 'idle') return 'standby'
  if (relevant.every((c) => c.status === 'standby')) return 'standby'
  return 'nominal'
}
