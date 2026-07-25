import type {
  CameraFeed,
  CameraGroup,
  Channel,
  ChecklistItem,
  EventItem,
  LinkHop,
  Operation,
  TelemetryPoint,
  VehicleSample,
} from './types'

export const OPERATION: Operation = {
  id: 'SF-B1M-01',
  label: 'B1M static fire rehearsal',
  mode: 'static-fire',
  vehicle: 'STRAVOX B1M',
  site: 'Creswick Goods Shed · Pad link',
  status: 'ARMED',
  window: 'Q4 2026 – Q1 2027',
}

export const CHANNELS: Channel[] = [
  {
    id: 'pad-thrust',
    name: 'Load cell / thrust',
    kind: 'pad',
    status: 'nominal',
    rateHz: 200,
    latencyMs: 42,
    lastPacket: '0.04s',
    dropPct: 0.1,
    packetAgeMs: 42,
    recording: true,
  },
  {
    id: 'pad-chamber',
    name: 'Chamber pressure',
    kind: 'pad',
    status: 'nominal',
    rateHz: 200,
    latencyMs: 38,
    lastPacket: '0.04s',
    dropPct: 0.0,
    packetAgeMs: 38,
    recording: true,
  },
  {
    id: 'pad-case',
    name: 'Casing thermistors',
    kind: 'pad',
    status: 'nominal',
    rateHz: 20,
    latencyMs: 55,
    lastPacket: '0.05s',
    dropPct: 0.2,
    packetAgeMs: 55,
    recording: true,
  },
  {
    id: 'pad-video',
    name: 'Pad camera mux',
    kind: 'pad',
    status: 'degraded',
    rateHz: 30,
    latencyMs: 180,
    lastPacket: '0.18s',
    dropPct: 2.4,
    packetAgeMs: 180,
    recording: true,
  },
  {
    id: 'veh-avionics',
    name: 'Vehicle avionics',
    kind: 'vehicle',
    status: 'standby',
    rateHz: 50,
    latencyMs: 0,
    lastPacket: '—',
    dropPct: 0,
    packetAgeMs: 0,
    recording: false,
  },
  {
    id: 'veh-gps',
    name: 'Vehicle GPS / baro',
    kind: 'vehicle',
    status: 'standby',
    rateHz: 10,
    latencyMs: 0,
    lastPacket: '—',
    dropPct: 0,
    packetAgeMs: 0,
    recording: false,
  },
  {
    id: 'shed-log',
    name: 'Goods Shed logger',
    kind: 'shed',
    status: 'nominal',
    rateHz: 1,
    latencyMs: 12,
    lastPacket: '0.01s',
    dropPct: 0,
    packetAgeMs: 12,
    recording: true,
  },
]

export const CAMERA_GROUPS: CameraGroup[] = [
  {
    id: 'pad',
    label: 'Pad',
    blurb: 'Static fire pad · Creswick',
  },
  {
    id: 'shed',
    label: 'Goods Shed',
    blurb: 'Mission control bay cameras',
  },
  {
    id: 'vehicle',
    label: 'Vehicle',
    blurb: 'STRAVOX airframe / bay (flight day)',
  },
]

export const CAMERA_FEEDS: CameraFeed[] = [
  {
    id: 'pad-wide',
    group: 'pad',
    name: 'Pad wide',
    spot: 'North fence · full pad',
    status: 'nominal',
    latencyMs: 96,
  },
  {
    id: 'pad-close',
    group: 'pad',
    name: 'Pad close',
    spot: 'Stand · nozzle / plume',
    status: 'degraded',
    latencyMs: 180,
  },
  {
    id: 'pad-flame',
    group: 'pad',
    name: 'Flame trench',
    spot: 'Downstream · trench / blast',
    status: 'nominal',
    latencyMs: 110,
  },
  {
    id: 'pad-tower',
    group: 'pad',
    name: 'Tower',
    spot: 'West mast · high angle',
    status: 'nominal',
    latencyMs: 88,
  },
  {
    id: 'shed-ops',
    group: 'shed',
    name: 'Ops floor',
    spot: 'Goods Shed · console row',
    status: 'nominal',
    latencyMs: 42,
  },
  {
    id: 'shed-rack',
    group: 'shed',
    name: 'Rack / RF',
    spot: 'Back wall · link gear',
    status: 'nominal',
    latencyMs: 51,
  },
  {
    id: 'shed-door',
    group: 'shed',
    name: 'Bay door',
    spot: 'Entry · pad sightline',
    status: 'nominal',
    latencyMs: 60,
  },
  {
    id: 'veh-avionics',
    group: 'vehicle',
    name: 'Avionics bay',
    spot: 'STRAVOX · internal bay',
    status: 'standby',
    latencyMs: 0,
  },
  {
    id: 'veh-fin',
    group: 'vehicle',
    name: 'Fin can',
    spot: 'Aft · fin / nozzle fairing',
    status: 'standby',
    latencyMs: 0,
  },
  {
    id: 'veh-nose',
    group: 'vehicle',
    name: 'Nose / tip',
    spot: 'Forward · rail view',
    status: 'standby',
    latencyMs: 0,
  },
]

export const EVENTS: EventItem[] = [
  {
    id: 'e1',
    time: '14:22:08',
    level: 'warn',
    source: 'PAD-CAM',
    message: 'Pad camera mux latency 180 ms — still inside soft limit',
  },
  {
    id: 'e2',
    time: '14:21:54',
    level: 'ok',
    source: 'LINK',
    message: 'Pad → Goods Shed path locked · Octopus session SF-B1M-01',
  },
  {
    id: 'e3',
    time: '14:21:31',
    level: 'info',
    source: 'THRUST',
    message: 'Load cell zeroed · awaiting ignition enable',
  },
  {
    id: 'e4',
    time: '14:20:58',
    level: 'ok',
    source: 'PRESS',
    message: 'Chamber pressure transducer calibrated',
  },
  {
    id: 'e5',
    time: '14:20:12',
    level: 'info',
    source: 'VEH',
    message: 'Vehicle telemetry path standby — flight day only',
  },
  {
    id: 'e6',
    time: '14:19:44',
    level: 'ok',
    source: 'SHED',
    message: 'Goods Shed logger writing · /ops/SF-B1M-01',
  },
  {
    id: 'e7',
    time: '14:18:03',
    level: 'crit',
    source: 'NOTE',
    message: 'Reminder: Octopus moves data — flight computer is separate',
  },
]

/** Simulated residual from a prior B1M-class burn profile (~3.5 s).
 *  thrust is stored in kgf; pressure is stored in psi. */
export function buildThrustCurve(): TelemetryPoint[] {
  const points: TelemetryPoint[] = []
  for (let i = 0; i <= 70; i++) {
    const t = i / 20 // 0 → 3.5 s
    const envelope =
      t < 0.15
        ? t / 0.15
        : t > 3.2
          ? Math.max(0, 1 - (t - 3.2) / 0.3)
          : 1
    const thrustKgf = 150 * envelope * (0.92 + 0.08 * Math.sin(t * 9))
    // ~4.8 MPa peak ≈ 696 psi
    const pressurePsi = 696 * envelope * (0.94 + 0.06 * Math.cos(t * 7))
    const temp = 22 + 180 * Math.min(1, t / 1.2) * envelope
    points.push({
      t,
      thrust: Math.max(0, thrustKgf),
      pressure: Math.max(0, pressurePsi),
      temp,
    })
  }
  return points
}

export function buildVehicleCurve(): VehicleSample[] {
  const points: VehicleSample[] = []
  for (let i = 0; i <= 120; i++) {
    const t = i / 2 // 0 → 60 s
    const boost = t < 3.5 ? t / 3.5 : 1
    const coast = t > 3.5 ? (t - 3.5) / 40 : 0
    const altitude = Math.max(0, 3200 * Math.sin(Math.min(1, boost * 0.35 + coast) * Math.PI * 0.5))
    const velocity = t < 3.5 ? 280 * boost : Math.max(-80, 280 - (t - 3.5) * 9)
    const accel = t < 3.5 ? 8.2 : t < 45 ? -1.1 : -0.4
    const batteryV = Math.max(10.8, 12.4 - t * 0.012)
    const gpsSats = t < 1 ? 6 : t < 8 ? 9 : 11
    points.push({ t, altitude, velocity, accel, batteryV, gpsSats })
  }
  return points
}

export const CHECKLIST: ChecklistItem[] = [
  { id: 'loadcell', label: 'Load cell zeroed', auto: true },
  { id: 'chamber', label: 'Chamber P path nominal', auto: true },
  { id: 'recording', label: 'Shed logger recording', auto: true },
  { id: 'cams', label: 'Pad cameras nominal', auto: true },
  { id: 'range', label: 'Range is GO', auto: true },
  { id: 'crew', label: 'Crew brief complete', auto: false },
]

export const LINK_HOPS: LinkHop[] = [
  { id: 'pad', label: 'Pad', detail: 'Instruments / mux' },
  { id: 'rf', label: 'RF path', detail: 'Pad → Shed' },
  { id: 'shed', label: 'Goods Shed', detail: 'Logger / MC' },
  { id: 'vehicle', label: 'Vehicle', detail: 'Flight-day only' },
]
