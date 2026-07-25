import { useEffect, useMemo, useState } from 'react'
import {
  CAMERA_FEEDS,
  CAMERA_GROUPS,
  CHANNELS,
  CHECKLIST,
  EVENTS,
  LINK_HOPS,
  OPERATION,
  buildThrustCurve,
  buildVehicleCurve,
} from './data'
import type { Channel, EventItem, LinkStatus, OpMode, RangeState } from './types'
import { applyTheme, getPreferredTheme, type Theme } from './theme'
import {
  fetchSession,
  login as authLogin,
  logout as authLogout,
  type AuthUser,
} from './auth'
import { downloadSessionExport } from './exportSession'
import { Header, type AppView } from './components/Header'
import { ModePanel } from './components/ModePanel'
import { TelemetryStage } from './components/TelemetryStage'
import { LinkDetail } from './components/LinkDetail'
import { RangeBar } from './components/RangeBar'
import { CameraPage } from './components/CameraPage'
import { EventStream, readStoredDownlinkOpen } from './components/EventStream'
import { SignIn } from './components/SignIn'

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme())
  const [authState, setAuthState] = useState<'loading' | 'signed-out' | 'signed-in'>(
    'loading',
  )
  const [user, setUser] = useState<AuthUser | null>(null)
  const [mode, setMode] = useState<OpMode>('static-fire')
  const [channels, setChannels] = useState(CHANNELS)
  const [selectedChannelId, setSelectedChannelId] = useState('pad-thrust')
  const [events, setEvents] = useState(EVENTS)
  const [armed, setArmed] = useState(false)
  const [range, setRange] = useState<RangeState>('hold')
  const [cameras, setCameras] = useState(CAMERA_FEEDS)
  const [toast, setToast] = useState<string | null>(null)
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [burnIndex, setBurnIndex] = useState(12)
  const [playing, setPlaying] = useState(true)
  const [downlinkOpen, setDownlinkOpen] = useState(readStoredDownlinkOpen)
  const [view, setView] = useState<AppView>('console')
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({
    crew: false,
  })

  const thrustCurve = useMemo(() => buildThrustCurve(), [])
  const vehicleCurve = useMemo(() => buildVehicleCurve(), [])

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  )

  const linkState = useMemo(() => aggregateLink(channels, mode), [channels, mode])
  const recording = channels.find((c) => c.id === 'shed-log')?.recording ?? false

  const sample = thrustCurve[Math.min(burnIndex, thrustCurve.length - 1)]
  const vehicle = vehicleCurve[Math.min(burnIndex, vehicleCurve.length - 1)]

  const tPlus =
    mode === 'idle' ? 0 : mode === 'launch' ? burnIndex / 2 : burnIndex / 20

  const checks = useMemo(() => {
    const padCamsOk = cameras
      .filter((c) => c.group === 'pad')
      .every((c) => c.status === 'nominal' || c.status === 'degraded')
    const loadcell = channels.find((c) => c.id === 'pad-thrust')
    const chamber = channels.find((c) => c.id === 'pad-chamber')
    return {
      loadcell: !!loadcell && loadcell.status !== 'lost' && loadcell.status !== 'standby',
      chamber: !!chamber && chamber.status === 'nominal',
      recording,
      cams: padCamsOk,
      range: range === 'go',
      crew: !!manualChecks.crew,
    } as Record<string, boolean>
  }, [cameras, channels, recording, range, manualChecks])

  const canArm = CHECKLIST.every((item) => checks[item.id]) && range === 'go'

  const hopStatus = useMemo(() => {
    const padCh = channels.filter((c) => c.kind === 'pad')
    const shed = channels.find((c) => c.id === 'shed-log')
    const veh = channels.filter((c) => c.kind === 'vehicle')
    const padStatus = worstStatus(padCh.map((c) => c.status))
    const video = channels.find((c) => c.id === 'pad-video')
    const rfStatus: LinkStatus =
      !video || video.status === 'standby'
        ? 'standby'
        : video.status === 'lost'
          ? 'lost'
          : video.latencyMs > 150 || video.dropPct > 2
            ? 'degraded'
            : 'nominal'
    return {
      pad: padStatus,
      rf: rfStatus,
      shed: shed?.status ?? 'standby',
      vehicle:
        mode === 'launch' ? worstStatus(veh.map((c) => c.status)) : ('standby' as LinkStatus),
    } as Record<string, LinkStatus>
  }, [channels, mode])

  const { missionClock, missionState } = useMemo(() => {
    if (mode === 'idle') return { missionClock: 'IDLE', missionState: 'idle' as const }
    if (range === 'nogo') return { missionClock: 'SAFE', missionState: 'safe' as const }
    if (playing || burnIndex > 0) {
      return {
        missionClock: `T+${tPlus.toFixed(mode === 'launch' ? 1 : 2)}s`,
        missionState: 'live' as const,
      }
    }
    if (range === 'hold') return { missionClock: 'HOLD', missionState: 'hold' as const }
    if (armed) return { missionClock: 'T−0', missionState: 'live' as const }
    return { missionClock: 'T−HOLD', missionState: 'hold' as const }
  }, [mode, range, playing, burnIndex, tPlus, armed])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    let alive = true
    fetchSession().then((sessionUser) => {
      if (!alive) return
      if (sessionUser) {
        setUser(sessionUser)
        setAuthState('signed-in')
      } else {
        setAuthState('signed-out')
      }
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (authState !== 'signed-in') return
    if (mode === 'idle') {
      setBurnIndex(0)
      setPlaying(false)
      return
    }
    if (!playing) return
    const max = mode === 'launch' ? vehicleCurve.length - 1 : thrustCurve.length - 1
    const id = window.setInterval(() => {
      setBurnIndex((i) => {
        if (i >= max) {
          setPlaying(false)
          return max
        }
        return i + 1
      })
    }, mode === 'launch' ? 120 : 90)
    return () => window.clearInterval(id)
  }, [authState, mode, playing, thrustCurve.length, vehicleCurve.length])

  useEffect(() => {
    if (authState !== 'signed-in') return
    const id = window.setInterval(() => {
      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.status === 'standby' || ch.status === 'lost') {
            return { ...ch, packetAgeMs: 0, lastPacket: '—', dropPct: 0 }
          }
          const delta = Math.round((Math.random() - 0.45) * 10)
          const latencyMs = Math.max(12, ch.latencyMs + delta)
          const dropPct = Math.max(
            0,
            Math.min(8, ch.dropPct + (Math.random() - 0.5) * 0.35),
          )
          const packetAgeMs = latencyMs + Math.round(Math.random() * 18)
          return {
            ...ch,
            latencyMs,
            packetAgeMs,
            dropPct: Number(dropPct.toFixed(1)),
            lastPacket: `${(packetAgeMs / 1000).toFixed(2)}s`,
            status:
              latencyMs > 150 || dropPct > 2
                ? 'degraded'
                : ch.id === 'pad-video' && latencyMs > 120
                  ? 'degraded'
                  : 'nominal',
          }
        }),
      )
      setCameras((prev) =>
        prev.map((cam) => {
          if (cam.group === 'vehicle' && mode !== 'launch') {
            return { ...cam, status: 'standby', latencyMs: 0 }
          }
          const base = cam.latencyMs || (cam.group === 'shed' ? 48 : 90)
          const latencyMs = Math.max(
            28,
            base + Math.round((Math.random() - 0.45) * 14),
          )
          return {
            ...cam,
            latencyMs,
            status: latencyMs > 150 ? 'degraded' : 'nominal',
          }
        }),
      )
    }, 1800)
    return () => window.clearInterval(id)
  }, [authState, mode])

  function handleToggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  function handleSignedIn(next: AuthUser) {
    setUser(next)
    setAuthState('signed-in')
    setToast(`Welcome, ${next.name}`)
  }

  async function handleSignOut() {
    await authLogout()
    setUser(null)
    setAuthState('signed-out')
    setArmed(false)
  }

  function handleModeChange(next: OpMode) {
    setMode(next)
    setArmed(false)
    setRange('hold')
    setBurnIndex(0)
    setPlaying(next !== 'idle')
    setManualChecks({ crew: false })
    if (next === 'launch') {
      setSelectedChannelId('veh-avionics')
      setChannels((prev) =>
        prev.map((ch) =>
          ch.kind === 'vehicle'
            ? {
                ...ch,
                status: 'nominal',
                latencyMs: 64,
                lastPacket: '0.06s',
                packetAgeMs: 64,
              }
            : ch,
        ),
      )
      setCameras((prev) =>
        prev.map((cam) =>
          cam.group === 'vehicle'
            ? { ...cam, status: 'nominal', latencyMs: 72 }
            : cam,
        ),
      )
      setToast('Launch day mode — vehicle path enabled')
    } else if (next === 'static-fire') {
      setSelectedChannelId('pad-thrust')
      setChannels((prev) =>
        prev.map((ch) =>
          ch.kind === 'vehicle'
            ? {
                ...ch,
                status: 'standby',
                latencyMs: 0,
                lastPacket: '—',
                packetAgeMs: 0,
              }
            : ch,
        ),
      )
      setCameras((prev) =>
        prev.map((cam) =>
          cam.group === 'vehicle'
            ? { ...cam, status: 'standby', latencyMs: 0 }
            : cam,
        ),
      )
      setToast('Static fire mode — pad → Goods Shed')
    } else {
      setCameras((prev) =>
        prev.map((cam) =>
          cam.group === 'vehicle'
            ? { ...cam, status: 'standby', latencyMs: 0 }
            : cam,
        ),
      )
      setToast('Idle — Octopus on bench')
    }
  }

  function handleSeek(index: number) {
    setBurnIndex(index)
    setPlaying(false)
  }

  function handleTogglePlay() {
    if (mode === 'idle') return
    setPlaying((prev) => {
      const next = !prev
      if (next) {
        const max = mode === 'launch' ? vehicleCurve.length - 1 : thrustCurve.length - 1
        if (burnIndex >= max) setBurnIndex(0)
      }
      return next
    })
  }

  function handleArm() {
    setArmed((v) => {
      if (!v && !canArm) {
        setToast('Cannot arm — checklist incomplete or range not GO')
        pushEvent('warn', 'RANGE', 'Arm blocked — checklist / range')
        return v
      }
      const next = !v
      setToast(next ? 'Ignition enable armed on MC side' : 'Ignition enable disarmed')
      pushEvent(next ? 'ok' : 'info', 'MC', next ? 'Ignition enable ARMED' : 'Ignition enable SAFE')
      return next
    })
  }

  function handleRangeChange(next: RangeState) {
    setRange(next)
    if (next === 'nogo') {
      setArmed(false)
      setToast('NO-GO — ignition enable safed')
      pushEvent('crit', 'RANGE', 'Range NO-GO · ignition enable safed')
      return
    }
    if (next === 'hold') {
      setToast('HOLD — range paused')
      pushEvent('warn', 'RANGE', 'Range HOLD')
      return
    }
    setToast('GO — range clear')
    pushEvent('ok', 'RANGE', 'Range GO')
  }

  function handleToggleRecording() {
    const next = !recording
    setChannels((prev) =>
      prev.map((ch) =>
        ch.kind === 'pad' || ch.id === 'shed-log' ? { ...ch, recording: next } : ch,
      ),
    )
    setToast(next ? 'Shed recording ON' : 'Shed recording OFF')
    pushEvent(
      next ? 'ok' : 'warn',
      'SHED',
      next ? 'Goods Shed logger recording' : 'Goods Shed logger stopped',
    )
  }

  function handleMarkEvent() {
    pushEvent(
      'info',
      'MC',
      `Manual mark · T+${tPlus.toFixed(2)}s · ${selectedChannel?.name ?? 'channel'}`,
    )
    setToast('Timeline event marked')
  }

  function handleClear() {
    pushEvent('warn', 'SHED', 'Goods Shed buffer cleared by operator')
    setToast('Shed buffer cleared')
  }

  function handleExport() {
    downloadSessionExport({
      operationId: OPERATION.id,
      mode,
      events,
      thrustCurve,
      vehicleCurve,
    })
    pushEvent('ok', 'SHED', 'Session CSV exported')
    setToast('Session exported')
  }

  function handleToggleCheck(id: string) {
    const item = CHECKLIST.find((c) => c.id === id)
    if (!item || item.auto) return
    setManualChecks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function pushEvent(level: EventItem['level'], source: string, message: string) {
    const time = formatClock(new Date())
    setEvents((prev) =>
      [
        {
          id: `e-${Date.now()}`,
          time,
          level,
          source,
          message,
        },
        ...prev,
      ].slice(0, 20),
    )
  }

  if (authState === 'loading') {
    return (
      <div className="app">
        <div className="auth-screen auth-loading">
          <p className="brand-kicker">Beyond Stage Zero · Goods Shed</p>
          <h1 className="brand auth-brand">
            Octopus<em>.</em>
          </h1>
          <p className="auth-copy">Checking session…</p>
        </div>
      </div>
    )
  }

  if (authState === 'signed-out') {
    return (
      <div className="app">
        <SignIn
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onSignedIn={handleSignedIn}
          login={authLogin}
        />
      </div>
    )
  }

  return (
    <div
      className="app"
      data-downlink-open={downlinkOpen ? 'true' : 'false'}
      data-view={view}
    >
      <div className="shell">
        <div className="shell-main">
          <Header
            clock={clock}
            missionClock={missionClock}
            missionState={missionState}
            linkState={linkState}
            sessionId={OPERATION.id}
            vehicle={OPERATION.vehicle}
            theme={theme}
            view={view}
            user={user}
            onToggleTheme={handleToggleTheme}
            onSignOut={handleSignOut}
            onViewChange={setView}
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

          <RangeBar range={range} onChange={handleRangeChange} armed={armed} />

          {view === 'console' ? (
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
                playing={playing}
                thrustCurve={thrustCurve}
                vehicleCurve={vehicleCurve}
                liveThrust={mode === 'idle' ? 0 : sample.thrust}
                livePressure={mode === 'idle' ? 0 : sample.pressure}
                liveTemp={mode === 'idle' ? 22 : sample.temp}
                liveAltitude={mode === 'launch' ? vehicle.altitude : 0}
                liveVelocity={mode === 'launch' ? vehicle.velocity : 0}
                liveAccel={mode === 'launch' ? vehicle.accel : 0}
                liveBattery={mode === 'launch' ? vehicle.batteryV : 0}
                liveSats={mode === 'launch' ? vehicle.gpsSats : 0}
                channels={channels}
                events={events}
                selectedChannelId={selectedChannelId}
                armed={armed}
                recording={recording}
                range={range}
                onSeek={handleSeek}
                onTogglePlay={handleTogglePlay}
                onSelectChannel={setSelectedChannelId}
              />
              <LinkDetail
                channel={selectedChannel}
                operation={OPERATION}
                armed={armed}
                rangeGo={range === 'go'}
                checklist={CHECKLIST}
                checks={checks}
                hops={LINK_HOPS}
                hopStatus={hopStatus}
                canArm={canArm}
                recording={recording}
                onToggleCheck={handleToggleCheck}
                onArm={handleArm}
                onMarkEvent={handleMarkEvent}
                onClear={handleClear}
                onToggleRecording={handleToggleRecording}
                onExport={handleExport}
                onOpenCameras={() => setView('cameras')}
              />
            </main>
          ) : (
            <CameraPage
              feeds={cameras}
              groups={CAMERA_GROUPS}
              clock={clock}
              range={range}
              onBack={() => setView('console')}
            />
          )}
        </div>

        {view === 'console' ? (
          <EventStream
            events={events}
            open={downlinkOpen}
            onOpenChange={setDownlinkOpen}
          />
        ) : null}
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

function worstStatus(statuses: LinkStatus[]): LinkStatus {
  if (statuses.some((s) => s === 'lost')) return 'lost'
  if (statuses.some((s) => s === 'degraded')) return 'degraded'
  if (statuses.every((s) => s === 'standby')) return 'standby'
  if (statuses.some((s) => s === 'nominal')) return 'nominal'
  return 'standby'
}
