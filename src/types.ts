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

/**
 * Unit kinds across both catalogs:
 * - System (vehicles & subsystems): vehicle, motor, avionics, pad, ground
 * - General inventory (stock): part, consumable, tool, other
 */
export type HardwareKind =
  | 'vehicle'
  | 'motor'
  | 'avionics'
  | 'pad'
  | 'ground'
  | 'part'
  | 'consumable'
  | 'tool'
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

/** Stock-room status for inventory items (separate from hardware build status). */
export type StockStatus =
  | 'in-stock'
  | 'low'
  | 'on-order'
  | 'reserved'
  | 'receiving'
  | 'incoming'
  | 'quarantine'
  | 'depleted'

export interface HardwareUnit {
  id: string
  name: string
  kind: HardwareKind
  /** Human serial / asset tag, e.g. SVX-B1M-001 */
  serial: string
  /** Optional drawing / catalog part number */
  partNumber?: string
  /** Count on hand (default 1 for unique assets) */
  quantity?: number
  /** Inventory: quantity still outstanding on order (not yet received). */
  onOrderQty?: number
  /** Hardware revision / drawing rev, e.g. B1M · rev A */
  hwRev: string
  /** Firmware / software load when applicable */
  fwVersion?: string
  status: HardwareStatus
  /** Inventory-only stock status. Prefer this over `status` for stock items. */
  stockStatus?: StockStatus
  /** Inventory reorder URL (McMaster, DigiKey, vendor cart, etc.). */
  orderUrl?: string
  /** Inventory: date the PO / order was placed (YYYY-MM-DD). */
  orderedAt?: string
  /** Inventory: expected delivery / ETA (YYYY-MM-DD). */
  expectedAt?: string
  /** Inventory minimum quantity — at or below this, status becomes low. */
  minQty?: number
  location?: string
  owner?: string
  notes?: string
  updatedAt: string
}

/** Step state on a vehicle / campaign process tracker. */
export type ProcessStepStatus =
  | 'pending'
  | 'active'
  | 'blocked'
  | 'done'
  | 'skipped'

export interface VehicleProcessStep {
  id: string
  order: number
  title: string
  detail?: string
  owner?: string
  status: ProcessStepStatus
  /** Inventory units this step touches */
  linkedUnitIds?: string[]
  blockedReason?: string
  completedAt?: string
  completedBy?: string
}

/** Ordered build / checkout process for a vehicle campaign. */
export interface VehicleProcess {
  id: string
  /** Hardware unit id of the vehicle (or primary asset) */
  vehicleUnitId: string
  name: string
  campaign?: string
  notes?: string
  steps: VehicleProcessStep[]
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
