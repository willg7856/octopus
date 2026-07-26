export type LinkStatus = 'nominal' | 'degraded' | 'lost' | 'standby'
export type OpMode = 'static-fire' | 'launch' | 'idle'
export type ChannelKind = 'pad' | 'vehicle' | 'shed'
export type RangeState = 'go' | 'hold' | 'nogo'

/** Until real feeds are wired, Live/Cameras run in demo mode. */
export type DataMode = 'demo' | 'live'

export interface ChecklistItem {
  id: string
  label: string
  /** When true, state is derived in App (not manually toggled). */
  auto: boolean
}

export interface LinkHop {
  id: string
  label: string
  detail: string
}

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
  /** Who owns this path when something is wrong. */
  owner?: string
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
  /** HLS / WebRTC / MJPEG / vendor page URL when available. */
  streamUrl?: string
  /** Still frame URL when available. */
  snapshotUrl?: string
  owner?: string
  lastFrameAt?: string
}

export type ResourceCategory =
  | 'cad'
  | 'drive'
  | 'planning'
  | 'ops'
  | 'web'

export interface ResourceLink {
  id: string
  category: ResourceCategory
  title: string
  description: string
  /**
   * Put the real URL here.
   * Leave empty or use '#' until you have it — UI will show “Needs link”.
   */
  href: string
  external?: boolean
  needsLink?: boolean
}

export interface Contact {
  id: string
  name: string
  role: string
  email: string
  phone?: string
  /** Slack handle, Discord, etc. */
  chat?: string
  notes?: string
  /** Higher = contact first in an incident. */
  escalateOrder?: number
}

export type MilestoneStatus = 'done' | 'active' | 'upcoming' | 'blocked'

export interface Milestone {
  id: string
  date: string
  title: string
  detail: string
  status: MilestoneStatus
}

/** Dated calendar-style items for Home / Timeline. */
export interface UpcomingEvent {
  id: string
  date: string
  title: string
  detail: string
}

export interface Notice {
  id: string
  level: 'info' | 'warn' | 'crit'
  title: string
  body: string
}

/** Physical / electronic assets tracked in the Hardware lab. */
export type HardwareKind =
  | 'vehicle'
  | 'motor'
  | 'avionics'
  | 'pad'
  | 'ground'
  | 'other'

/** Build / checkout progress for a hardware unit. */
export type HardwareStatus =
  | 'concept'
  | 'design'
  | 'fab'
  | 'assembly'
  | 'checkout'
  | 'flight-ready'
  | 'retired'
  | 'failed'

export interface HardwareUnit {
  id: string
  name: string
  kind: HardwareKind
  /** Human serial / asset tag, e.g. SVX-B1M-001 */
  serial: string
  /** Hardware revision / drawing rev, e.g. B1M · rev A */
  hwRev: string
  /** Firmware / software load when applicable */
  fwVersion?: string
  status: HardwareStatus
  location?: string
  owner?: string
  notes?: string
  updatedAt: string
}

export interface HardwareProgressNote {
  id: string
  unitId: string
  date: string
  status: HardwareStatus
  note: string
  author?: string
}

export type TestKind =
  | 'static-fire'
  | 'cold-flow'
  | 'fit-check'
  | 'avionics'
  | 'structural'
  | 'ground'
  | 'other'

export type TestResult = 'pass' | 'fail' | 'partial' | 'aborted' | 'data-only'

export interface TestMetric {
  key: string
  value: string
  unit?: string
}

export interface TestLogEntry {
  id: string
  date: string
  title: string
  kind: TestKind
  result: TestResult
  unitIds: string[]
  site?: string
  operator?: string
  summary: string
  metrics?: TestMetric[]
  /** Drive folder, CSV name, or other pointer to raw data */
  dataRef?: string
  createdAt: string
}
