import { useEffect, useMemo, useState } from 'react'
import {
  CAMERA_FEEDS,
  CAMERA_GROUPS,
  CHANNELS,
  EVENTS,
  OPERATION,
  buildThrustCurve,
  buildVehicleCurve,
} from './data'
import type { Channel, LinkStatus, OpMode } from './types'
import { applyTheme, getPreferredTheme, type Theme } from './theme'
import {
  fetchSession,
  login as authLogin,
  logout as authLogout,
  type AuthUser,
} from './auth'
import { downloadSessionExport } from './exportSession'
import { Header, type AppView } from './components/Header'
import { HubHome } from './components/HubHome'
import { ResourcesPage } from './components/ResourcesPage'
import { TeamPage } from './components/TeamPage'
import { TimelinePage } from './components/TimelinePage'
import { ModePanel } from './components/ModePanel'
import { TelemetryStage } from './components/TelemetryStage'
import { LiveStatus } from './components/LiveStatus'
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
  const [events] = useState(EVENTS)
  const [cameras, setCameras] = useState(CAMERA_FEEDS)
  const [toast, setToast] = useState<string | null>(null)
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [burnIndex, setBurnIndex] = useState(12)
  const [playing, setPlaying] = useState(true)
  const [downlinkOpen, setDownlinkOpen] = useState(readStoredDownlinkOpen)
  const [view, setView] = useState<AppView>('home')

  const thrustCurve = useMemo(() => buildThrustCurve(), [])
  const vehicleCurve = useMemo(() => buildVehicleCurve(), [])

  const linkState = useMemo(() => aggregateLink(channels, mode), [channels, mode])
  const recording = channels.find((c) => c.id === 'shed-log')?.recording ?? false

  const sample = thrustCurve[Math.min(burnIndex, thrustCurve.length - 1)]
  const vehicle = vehicleCurve[Math.min(burnIndex, vehicleCurve.length - 1)]

  const linkLabel =
    linkState === 'nominal'
      ? 'Live'
      : linkState === 'degraded'
        ? 'Degraded'
        : linkState === 'lost'
          ? 'Lost'
          : 'Standby'

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    fetchSession().then((session) => {
      if (cancelled) return
      if (session) {
        setUser(session)
        setAuthState('signed-in')
      } else {
        setAuthState('signed-out')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (authState !== 'signed-in' || !playing || mode === 'idle') return
    const max = mode === 'launch' ? vehicleCurve.length - 1 : thrustCurve.length - 1
    const id = window.setInterval(() => {
      setBurnIndex((prev) => (prev >= max ? 0 : prev + 1))
    }, mode === 'launch' ? 500 : 50)
    return () => window.clearInterval(id)
  }, [authState, playing, mode, thrustCurve.length, vehicleCurve.length])

  useEffect(() => {
    if (authState !== 'signed-in') return
    const id = window.setInterval(() => {
      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.status === 'standby') return ch
          const jitter = (Math.random() - 0.5) * 8
          const latencyMs = Math.max(8, Math.round(ch.latencyMs + jitter))
          const dropPct = Math.max(0, Number((ch.dropPct + (Math.random() - 0.5) * 0.2).toFixed(1)))
          let status: LinkStatus = ch.status
          if (latencyMs > 160 || dropPct > 2.5) status = 'degraded'
          else if (ch.status !== 'lost') status = 'nominal'
          return {
            ...ch,
            latencyMs,
            dropPct,
            status,
            lastPacket: `${(latencyMs / 1000).toFixed(2)}s`,
            packetAgeMs: latencyMs,
          }
        }),
      )
      setCameras((prev) =>
        prev.map((cam) => {
          if (cam.status === 'standby') return cam
          const latencyMs = Math.max(20, Math.round(cam.latencyMs + (Math.random() - 0.5) * 12))
          return {
            ...cam,
            latencyMs,
            status: latencyMs > 160 ? 'degraded' : 'nominal',
          }
        }),
      )
    }, 1800)
    return () => window.clearInterval(id)
  }, [authState])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(id)
  }, [toast])

  function handleToggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  function handleSignedIn(next: AuthUser) {
    setUser(next)
    setAuthState('signed-in')
  }

  async function handleSignOut() {
    await authLogout()
    setUser(null)
    setAuthState('signed-out')
  }

  function handleModeChange(next: OpMode) {
    setMode(next)
    setBurnIndex(next === 'idle' ? 0 : 12)
    setPlaying(next !== 'idle')
    setChannels((prev) =>
      prev.map((ch) => {
        if (ch.kind === 'vehicle') {
          return {
            ...ch,
            status: next === 'launch' ? 'nominal' : 'standby',
            recording: next === 'launch',
            lastPacket: next === 'launch' ? '0.05s' : '—',
            latencyMs: next === 'launch' ? 48 : 0,
            packetAgeMs: next === 'launch' ? 48 : 0,
          }
        }
        return ch
      }),
    )
    setCameras((prev) =>
      prev.map((cam) =>
        cam.group === 'vehicle'
          ? {
              ...cam,
              status: next === 'launch' ? 'nominal' : 'standby',
              latencyMs: next === 'launch' ? 90 : 0,
            }
          : cam,
      ),
    )
    if (next === 'launch') setSelectedChannelId('veh-avionics')
    else if (next === 'static-fire') setSelectedChannelId('pad-thrust')
  }

  function handleSeek(index: number) {
    setBurnIndex(index)
    setPlaying(false)
  }

  function handleTogglePlay() {
    if (mode === 'idle') return
    setPlaying((p) => !p)
  }

  function handleExport() {
    downloadSessionExport({
      operationId: OPERATION.id,
      mode,
      events,
      thrustCurve,
      vehicleCurve,
    })
    setToast('Session CSV downloaded')
  }

  if (authState === 'loading') {
    return (
      <div className="app">
        <div className="auth-screen auth-loading">
          <p className="brand-kicker">Beyond Stage Zero</p>
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

  const isLiveWorkbench = view === 'live'

  return (
    <div
      className="app"
      data-downlink-open={downlinkOpen && isLiveWorkbench ? 'true' : 'false'}
      data-view={view}
    >
      <div className="shell">
        <div className="shell-main">
          <Header
            clock={clock}
            linkState={linkState}
            sessionLabel={OPERATION.vehicle}
            theme={theme}
            view={view}
            user={user}
            onToggleTheme={handleToggleTheme}
            onSignOut={handleSignOut}
            onViewChange={setView}
          />

          {view === 'home' ? (
            <HubHome
              operation={OPERATION}
              linkLabel={linkLabel}
              cameraCount={cameras.length}
              onNavigate={setView}
            />
          ) : null}

          {view === 'resources' ? <ResourcesPage onNavigate={setView} /> : null}
          {view === 'team' ? <TeamPage /> : null}
          {view === 'timeline' ? <TimelinePage /> : null}

          {view === 'live' ? (
            <>
              <div className="ops-strip" aria-label="Live focus">
                <div className="ops-cell">
                  <p className="ops-label">Focus</p>
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
                  recording={recording}
                  onSeek={handleSeek}
                  onTogglePlay={handleTogglePlay}
                  onSelectChannel={setSelectedChannelId}
                />
                <LiveStatus
                  mode={mode}
                  channels={channels}
                  selectedChannelId={selectedChannelId}
                  onSelectChannel={setSelectedChannelId}
                  onOpenCameras={() => setView('cameras')}
                  onExport={handleExport}
                />
              </main>
            </>
          ) : null}

          {view === 'cameras' ? (
            <CameraPage
              feeds={cameras}
              groups={CAMERA_GROUPS}
              clock={clock}
              onBack={() => setView('home')}
            />
          ) : null}
        </div>

        {view === 'live' ? (
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
