import { useEffect, useMemo, useState } from 'react'
import {
  CAMERA_FEEDS,
  CAMERA_GROUPS,
  CHANNELS,
  DATA_MODE,
  EVENTS,
  OPERATION,
  buildThrustCurve,
  buildVehicleCurve,
} from './data'
import type { Channel, OpMode } from './types'
import { applyTheme, getPreferredTheme, type Theme } from './theme'
import {
  fetchSession,
  login as authLogin,
  logout as authLogout,
  type AuthUser,
} from './auth'
import { downloadSessionExport } from './exportSession'
import { navigateHash, viewFromHash } from './routing'
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

const DEMO = DATA_MODE === 'demo'

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
  const [cameras] = useState(CAMERA_FEEDS)
  const [toast, setToast] = useState<string | null>(null)
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [burnIndex, setBurnIndex] = useState(12)
  const [playing, setPlaying] = useState(true)
  const [downlinkOpen, setDownlinkOpen] = useState(readStoredDownlinkOpen)
  const [view, setView] = useState<AppView>(() => viewFromHash())

  const thrustCurve = useMemo(() => buildThrustCurve(), [])
  const vehicleCurve = useMemo(() => buildVehicleCurve(), [])

  const linkState = useMemo(() => aggregateLink(channels, mode), [channels, mode])
  const recording = channels.find((c) => c.id === 'shed-log')?.recording ?? false

  const sample = thrustCurve[Math.min(burnIndex, thrustCurve.length - 1)]
  const vehicle = vehicleCurve[Math.min(burnIndex, vehicleCurve.length - 1)]

  const linkLabel =
    linkState === 'nominal'
      ? 'OK'
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
    function onHash() {
      setView(viewFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    navigateHash(view)
  }, [view])

  useEffect(() => {
    if (!DEMO || authState !== 'signed-in' || !playing || mode === 'idle') return
    const max = mode === 'launch' ? vehicleCurve.length - 1 : thrustCurve.length - 1
    const id = window.setInterval(() => {
      setBurnIndex((prev) => (prev >= max ? 0 : prev + 1))
    }, mode === 'launch' ? 500 : 50)
    return () => window.clearInterval(id)
  }, [authState, playing, mode, thrustCurve.length, vehicleCurve.length])

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

  function handleViewChange(next: AppView) {
    setView(next)
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
            status: next === 'launch' ? (DEMO ? 'standby' : 'nominal') : 'standby',
            recording: next === 'launch' && !DEMO,
            lastPacket: next === 'launch' && !DEMO ? '0.05s' : '—',
            latencyMs: next === 'launch' && !DEMO ? 48 : 0,
            packetAgeMs: next === 'launch' && !DEMO ? 48 : 0,
          }
        }
        return ch
      }),
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
    setToast(DEMO ? 'Demo CSV downloaded' : 'Session CSV downloaded')
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
      data-demo={DEMO ? 'true' : 'false'}
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
            demo={DEMO}
            onToggleTheme={handleToggleTheme}
            onSignOut={handleSignOut}
            onViewChange={handleViewChange}
          />

          {view === 'home' ? (
            <HubHome
              operation={OPERATION}
              linkLabel={linkLabel}
              channels={channels}
              cameras={cameras}
              demo={DEMO}
              onNavigate={handleViewChange}
            />
          ) : null}

          {view === 'resources' ? (
            <ResourcesPage onNavigate={handleViewChange} />
          ) : null}
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
                  <p className="ops-label">Data</p>
                  <p className="ops-value">{DEMO ? 'Demo' : 'Live'}</p>
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
                  demo={DEMO}
                  onSeek={handleSeek}
                  onTogglePlay={handleTogglePlay}
                  onSelectChannel={setSelectedChannelId}
                />
                <LiveStatus
                  mode={mode}
                  channels={channels}
                  selectedChannelId={selectedChannelId}
                  demo={DEMO}
                  onSelectChannel={setSelectedChannelId}
                  onOpenCameras={() => handleViewChange('cameras')}
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
              demo={DEMO}
              onBack={() => handleViewChange('home')}
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
