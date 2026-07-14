import type { Channel, EventItem, Operation, TelemetryPoint, VehicleSample } from './types'

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
  },
  {
    id: 'pad-chamber',
    name: 'Chamber pressure',
    kind: 'pad',
    status: 'nominal',
    rateHz: 200,
    latencyMs: 38,
    lastPacket: '0.04s',
  },
  {
    id: 'pad-case',
    name: 'Casing thermistors',
    kind: 'pad',
    status: 'nominal',
    rateHz: 20,
    latencyMs: 55,
    lastPacket: '0.05s',
  },
  {
    id: 'pad-video',
    name: 'Pad camera mux',
    kind: 'pad',
    status: 'degraded',
    rateHz: 30,
    latencyMs: 180,
    lastPacket: '0.18s',
  },
  {
    id: 'veh-avionics',
    name: 'Vehicle avionics',
    kind: 'vehicle',
    status: 'standby',
    rateHz: 50,
    latencyMs: 0,
    lastPacket: '—',
  },
  {
    id: 'veh-gps',
    name: 'Vehicle GPS / baro',
    kind: 'vehicle',
    status: 'standby',
    rateHz: 10,
    latencyMs: 0,
    lastPacket: '—',
  },
  {
    id: 'shed-log',
    name: 'Goods Shed logger',
    kind: 'shed',
    status: 'nominal',
    rateHz: 1,
    latencyMs: 12,
    lastPacket: '0.01s',
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

/** Simulated residual from a prior B1M-class burn profile (~3.5 s). */
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
    const thrust = 150 * envelope * (0.92 + 0.08 * Math.sin(t * 9))
    const pressure = 4.8 * envelope * (0.94 + 0.06 * Math.cos(t * 7))
    const temp = 22 + 180 * Math.min(1, t / 1.2) * envelope
    points.push({
      t,
      thrust: Math.max(0, thrust),
      pressure: Math.max(0, pressure),
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
    points.push({ t, altitude, velocity, accel })
  }
  return points
}
