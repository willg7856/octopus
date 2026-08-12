/**
 * Unit kinds across both catalogs:
 * - System (vehicles & subsystems): vehicle, subsystem, motor, avionics, pad, ground
 * - General inventory (stock): part, consumable, tool, electronics, other
 */
export type HardwareKind =
  | 'vehicle'
  | 'subsystem'
  | 'motor'
  | 'avionics'
  | 'pad'
  | 'ground'
  | 'part'
  | 'consumable'
  | 'tool'
  | 'electronics'
  | 'other'

/** Build / checkout progress for a hardware unit. */
export type HardwareStatus =
  | 'concept'
  | 'design'
  | 'fab'
  | 'assembly'
  | 'checkout'
  | 'flight-ready'
  /** Done for non-flight hardware (pad, GSE, ground gear, fixtures). */
  | 'completed'
  | 'retired'
  | 'failed'
  | 'destroyed'

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
  | 'destroyed'

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
  /**
   * Inventory: qty held for production steps (Use inventory) but not yet drawn.
   * Available = on-hand − reserved. Released or converted on Done / remove.
   */
  reservedQty?: number
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
  /** Inventory optional unit price (AUD) for value estimates. */
  unitPrice?: number
  /**
   * Inventory optional program / vehicle association (e.g. B1M, STRAVOX).
   * Free-text tag for filtering stock by campaign — not a hard hardware parent link.
   */
  program?: string
  /**
   * Hardware: parent unit this mounts under (vehicle, engine, subsystem, etc.).
   * Field name kept for stored lab compatibility.
   */
  parentVehicleId?: string
  /**
   * Hardware: inventory ids installed on this unit (mirrors items with
   * `installedOnUnitId` pointing here; kept for listing / export).
   */
  linkedInventoryIds?: string[]
  /**
   * Hardware: qty drawn from multi-qty inventory lines (consumables).
   * Unique/reserved installs use `installedOnUnitId` on the inventory item instead.
   */
  linkedInventoryDraws?: Record<string, number>
  /**
   * Inventory: hardware unit id this item is installed / reserved on.
   * When set, stock status should be `reserved` and the item is unavailable elsewhere.
   */
  installedOnUnitId?: string
  location?: string
  owner?: string
  notes?: string
  /** When true, notes are surfaced on the list and detail top. */
  notesImportant?: boolean
  /**
   * Manual floor flag — show in Needs attention filters / glance.
   * Independent of notes text.
   */
  needsAttention?: boolean
  updatedAt: string
}

/** Step state on a vehicle / campaign process tracker. */
export type ProcessStepStatus =
  | 'pending'
  | 'active'
  | 'blocked'
  | 'done'
  | 'skipped'

/** Dated note logged during an active production (run-wide or on a step). */
export interface ProductionLogNote {
  id: string
  /** ISO timestamp when the note was added */
  at: string
  text: string
  author?: string
}

export interface VehicleProcessStep {
  id: string
  order: number
  title: string
  detail?: string
  owner?: string
  status: ProcessStepStatus
  /** Hardware and/or inventory units this step touches */
  linkedUnitIds?: string[]
  /**
   * Planned inventory qty on this step (from Use inventory).
   * Reserved from available stock until the step is marked Done, then drawn.
   */
  linkedInventoryQty?: Record<string, number>
  /**
   * Qty already drawn from stock when this step was marked done.
   * Restored if the step leaves Done.
   */
  consumedInventoryQty?: Record<string, number>
  /**
   * Chronological floor notes for this step while the production is running.
   */
  logNotes?: ProductionLogNote[]
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
  /**
   * Pre-production / planning notes and open decisions
   * (things not decided yet, setup context, constraints).
   */
  notes?: string
  /**
   * Chronological floor notes while the production is running
   * (what happened, blockers cleared, callouts during build).
   */
  logNotes?: ProductionLogNote[]
  /**
   * Inventory parts / tools / materials for this production overall.
   * Soft planning link — on-hand stock is reserved when a step uses the
   * item (Use inventory) and drawn when that step is marked Done.
   * Prefer `linkedInventoryQty` when quantities matter; ids stay in sync.
   */
  linkedInventoryIds?: string[]
  /**
   * Qty of each inventory material for this production (unitId → count).
   * Soft planning until a using step reserves/draws it.
   */
  linkedInventoryQty?: Record<string, number>
  /**
   * Hardware vehicles / subsystems used on this production overall.
   * Soft link only until Integrate advances hardware status.
   */
  linkedHardwareIds?: string[]
  /** Schedule dates (YYYY-MM-DD). Soft planning fields only. */
  startedAt?: string
  deadlineAt?: string
  finishedAt?: string
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
