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
  dropPct: number
  packetAgeMs: number
  recording: boolean
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
  batteryV: number
  gpsSats: number
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

export type CameraGroupId = 'pad' | 'shed' | 'vehicle'

export interface CameraGroup {
  id: CameraGroupId
  label: string
  blurb: string
}

export interface CameraFeed {
  id: string
  group: CameraGroupId
  name: string
  spot: string
  status: LinkStatus
  latencyMs: number
}

export type ResourceCategory =
  | 'cad'
  | 'drive'
  | 'planning'
  | 'web'
  | 'ops'

export interface ResourceLink {
  id: string
  category: ResourceCategory
  title: string
  description: string
  href: string
  external?: boolean
}

export interface Contact {
  id: string
  name: string
  role: string
  email: string
  phone?: string
  notes?: string
}

export type MilestoneStatus = 'done' | 'active' | 'upcoming' | 'blocked'

export interface Milestone {
  id: string
  date: string
  title: string
  detail: string
  status: MilestoneStatus
}

export interface Notice {
  id: string
  level: 'info' | 'warn' | 'crit'
  title: string
  body: string
}
