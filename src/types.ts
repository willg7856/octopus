export type LinkStatus = 'nominal' | 'degraded' | 'lost' | 'standby'
export type OpMode = 'static-fire' | 'launch' | 'idle'
export type ChannelKind = 'pad' | 'vehicle' | 'shed'

export interface Channel {
  id: string
  name: string
  kind: ChannelKind
  status: LinkStatus
  rateHz: number
  latencyMs: number
  lastPacket: string
}

export interface TelemetryPoint {
  t: number
  thrust: number
  pressure: number
  temp: number
}

export interface VehicleSample {
  t: number
  altitude: number
  velocity: number
  accel: number
}

export interface EventItem {
  id: string
  time: string
  level: 'info' | 'ok' | 'warn' | 'crit'
  source: string
  message: string
}

export interface Operation {
  id: string
  label: string
  mode: OpMode
  vehicle: string
  site: string
  status: string
  window: string
}
