import { useEffect, useMemo, useState } from 'react'
import {
  CAMERA_FEEDS,
  CAMERA_GROUPS,
  CHANNELS,
  CHECKLIST,
  DATA_MODE,
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
import { navigateHash, viewFromHash } from './routing'
import { Header, type AppView } from './components/Header'
import { HubHome } from './components/HubHome'
import { ResourcesPage } from './components/ResourcesPage'
import { TeamPage } from './components/TeamPage'
import { TimelinePage } from './components/TimelinePage'
import { ModePanel } from './components/ModePanel'
import { TelemetryStage } from './components/TelemetryStage'
import { MissionOps } from './components/MissionOps'
import { RangeBar } from './components/RangeBar'
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
  const [events, setEvents] = useState(EVENTS)
  const [cameras, setCameras] = useState(CAMERA_FEEDS)
  const [armed, setArmed] = useState(false)
  const [range, setRange] = useState<RangeState>('hold')
  const [toast, setToast] = useState<string | null>(null)
  const [clock, setClock] = useState(() => formatClock(new Date()))
  const [burnIndex, setBurnIndex] = useState(12)
  const [playing, setPlaying] = useState(true)
  const [downlinkOpen, setDownlinkOpen] = useState(readStoredDownlinkOpen)
  const [view, setView] = useState<AppView>(() => viewFromHash())
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
      .every((c) => c.status === 'nominal' || c.status === 'degraded' || c.status === 'standby')
    const loadcell = channels.find((c) => c.id === 'pad-thrust')
    const chamber = channels.find((c) => c.id === 'pad-chamber')
    return {
      loadcell: !!loadcell && loadcell.status !== 'lost',
      chamber: !!chamber && chamber.status !== 'lost',
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
      pad: worstStatus(padCh.map((c) => c.status)),
      rf: rfStatus,
      shed: shed?.status ?? 'standby',
      vehicle:
        mode === 'launch' ? worstStatus(veh.map((c) => c.status)) : ('standby' as LinkStatus),
    } as Record<string, LinkStatus>
  }, [channels, mode])

  const { missionClock, missionState } = useMemo(() => {
    if (mode === 'idle') return { missionClock: 'IDLE', missionState: 'idle' as const }
    if (range === 'nogo') return { missionClock: 'SAFE', missionState: 'safe' as const }
    if (!playing && burnIndex === 0) {
      return { missionClock: 'HOLD', missionState: 'hold' as const }
    }
    return {
      missionClock: `T+${tPlus.toFixed(mode === 'launch' ? 1 : 2)}s`,
      missionState: 'live' as const,
    }
  }, [mode, range, playing, burnIndex, tPlus])

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
    if (authState !== 'signed-in' || !playing || mode === 'idle') return
    const max = mode === 'launch' ? vehicleCurve.length - 1 : thrustCurve.length - 1
    const id = window.setInterval(() => {
      setBurnIndex((prev) => (prev >= max ? 0 : prev + 1))
    }, mode === 'launch' ? 500 : 50)
    return () => window.clearInterval(id)
  }, [authState, playing, mode, thrustCurve.length, vehicleCurve.length])

  useEffect(() => {
    if (!DEMO || authState !== 'signed-in') return
    const id = window.setInterval(() => {
      setChannels((prev) =>
        prev.map((ch) => {
          if (ch.status === 'standby') return ch
          const jitter = (Math.random() - 0.5) * 8
          const latencyMs = Math.max(8, Math.round(ch.latencyMs + jitter))
          const dropPct = Math.max(
            0,
            Number((ch.dropPct + (Math.random() - 0.5) * 0.2).toFixed(1)),
          )
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

  function handleViewChange(next: AppView) {
    setView(next)
  }

  function handleModeChange(next: OpMode) {
    setMode(next)
    setArmed(false)
    setRange('hold')
    setBurnIndex(next === 'idle' ? 0 : 12)
    setPlaying(next !== 'idle')
    setManualChecks({ crew: false })
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
              status: next === 'launch' ? 'standby' : 'standby',
              latencyMs: 0,
            }
          : cam,
      ),
    )
    if (next === 'launch') setSelectedChannelId('veh-avionics')
    else if (next === 'static-fire') setSelectedChannelId('pad-thrust')
    pushEvent('info', 'MODE', `Mode → ${next}`)
  }

  function handleRangeChange(next: RangeState) {
    setRange(next)
    if (next === 'nogo') {
      setArmed(false)
      pushEvent('crit', 'RANGE', 'Range NO-GO — ignition enable safed')
      setToast('Range NO-GO — safed')
      return
    }
    if (next === 'go') pushEvent('ok', 'RANGE', 'Range GO')
    else pushEvent('warn', 'RANGE', 'Range HOLD')
  }

  function handleArm() {
    if (armed) {
      setArmed(false)
      pushEvent('warn', 'MC', 'Ignition enable disarmed')
      setToast('Disarmed')
      return
    }
    if (!canArm) {
      setToast('Cannot arm — checklist incomplete or range not GO')
      return
    }
    setArmed(true)
    pushEvent('ok', 'MC', 'Ignition enable armed')
    setToast('Ignition enable armed')
  }

  function handleToggleCheck(id: string) {
    const item = CHECKLIST.find((c) => c.id === id)
    if (!item || item.auto) return
    setManualChecks((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function handleToggleRecording() {
    setChannels((prev) =>
      prev.map((ch) =>
        ch.kind === 'pad' || ch.id === 'shed-log'
          ? { ...ch, recording: !recording }
          : ch,
      ),
    )
    pushEvent('info', 'SHED', recording ? 'Shed recording stopped' : 'Shed recording started')
  }

  function handleMarkEvent() {
    pushEvent(
      'info',
      'MARK',
      `Manual mark @ T+${tPlus.toFixed(2)}s · ${selectedChannel?.name ?? 'no channel'}`,
    )
    setToast('Timeline event marked')
  }

  function handleClear() {
    pushEvent('warn', 'SHED', 'Goods Shed buffer clear requested')
    setToast('Shed buffer clear logged')
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
      ].slice(0, 30),
    )
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

  const onControl = view === 'control'

  return (
    <div
      className="app"
      data-downlink-open={downlinkOpen && onControl ? 'true' : 'false'}
      data-view={view}
      data-demo={DEMO ? 'true' : 'false'}
    >
      <div className="shell">
        <div className="shell-main">
          <Header
            clock={clock}
            missionClock={missionClock}
            missionState={missionState}
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
              linkLabel={
                linkState === 'nominal'
                  ? 'OK'
                  : linkState === 'degraded'
                    ? 'Degraded'
                    : linkState === 'lost'
                      ? 'Lost'
                      : 'Standby'
              }
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

          {onControl ? (
            <>
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

              <RangeBar range={range} armed={armed} onChange={handleRangeChange} />

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
                  armed={armed}
                  range={range}
                  demo={DEMO}
                  onSeek={handleSeek}
                  onTogglePlay={handleTogglePlay}
                  onSelectChannel={setSelectedChannelId}
                />
                <MissionOps
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
                  demo={DEMO}
                  onToggleCheck={handleToggleCheck}
                  onArm={handleArm}
                  onMarkEvent={handleMarkEvent}
                  onClear={handleClear}
                  onToggleRecording={handleToggleRecording}
                  onExport={handleExport}
                  onOpenCameras={() => handleViewChange('cameras')}
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
              onBack={() => handleViewChange('control')}
            />
          ) : null}
        </div>

        {onControl ? (
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
