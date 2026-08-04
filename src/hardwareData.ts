import type {
  HardwareProgressNote,
  HardwareStatus,
  HardwareUnit,
  ProcessStepStatus,
  StockStatus,
  TestLogEntry,
  VehicleProcess,
  VehicleProcessStep,
} from './types'
import {
  SEED_HARDWARE,
  SEED_PROCESSES,
  SEED_PROGRESS,
  SEED_TESTS,
} from './hardwareSeed'

const STORAGE_KEY = 'octopus.hardware-lab.v2'

export { SEED_HARDWARE, SEED_PROCESSES, SEED_PROGRESS, SEED_TESTS }

export const HARDWARE_KIND_LABELS: Record<HardwareUnit['kind'], string> = {
  vehicle: 'Vehicle',
  subsystem: 'Subsystem',
  motor: 'Motor / propulsion',
  avionics: 'Avionics',
  pad: 'Pad / stand',
  ground: 'Ground support',
  part: 'Part',
  consumable: 'Consumable',
  tool: 'Tool',
  'flight-hardware': 'Flight hardware',
  'test-hardware': 'Test hardware',
  other: 'Other',
}

/** Vehicles and flight/GSE subsystems — shown under Hardware. */
export const SYSTEM_KINDS: HardwareUnit['kind'][] = [
  'vehicle',
  'subsystem',
  'motor',
  'avionics',
  'pad',
  'ground',
]

/** General stock — shown under Inventory. */
export const INVENTORY_KINDS: HardwareUnit['kind'][] = [
  'part',
  'consumable',
  'tool',
  'flight-hardware',
  'test-hardware',
  'other',
]

export function isSystemKind(kind: HardwareUnit['kind']) {
  return SYSTEM_KINDS.includes(kind)
}

export function isInventoryKind(kind: HardwareUnit['kind']) {
  return !isSystemKind(kind)
}

export const HARDWARE_STATUS_LABELS: Record<HardwareStatus, string> = {
  concept: 'Concept',
  design: 'Design',
  fab: 'Fab',
  assembly: 'Assembly',
  checkout: 'Checkout',
  'flight-ready': 'Flight ready',
  retired: 'Retired',
  failed: 'Failed',
}

export const HARDWARE_STATUS_ORDER: HardwareStatus[] = [
  'concept',
  'design',
  'fab',
  'assembly',
  'checkout',
  'flight-ready',
  'retired',
  'failed',
]

/** Stock-facing labels for inventory items. */
export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  'in-stock': 'In stock',
  low: 'Low stock',
  'on-order': 'On order',
  reserved: 'Reserved',
  receiving: 'Receiving',
  incoming: 'Incoming',
  quarantine: 'Quarantine',
  depleted: 'Depleted',
}

export const STOCK_STATUS_ORDER: StockStatus[] = [
  'in-stock',
  'low',
  'on-order',
  'reserved',
  'receiving',
  'incoming',
  'quarantine',
  'depleted',
]

/** Map legacy hardware statuses that inventory used to reuse. */
const LEGACY_STATUS_TO_STOCK: Partial<Record<HardwareStatus, StockStatus>> = {
  'flight-ready': 'in-stock',
  checkout: 'low',
  assembly: 'on-order',
  design: 'reserved',
  fab: 'receiving',
  concept: 'incoming',
  failed: 'quarantine',
  retired: 'depleted',
}

const STOCK_TO_HARDWARE_STATUS: Record<StockStatus, HardwareStatus> = {
  'in-stock': 'flight-ready',
  low: 'checkout',
  'on-order': 'assembly',
  reserved: 'design',
  receiving: 'fab',
  incoming: 'concept',
  quarantine: 'failed',
  depleted: 'retired',
}

export function stockStatusOf(unit: HardwareUnit): StockStatus {
  if (unit.stockStatus && STOCK_STATUS_ORDER.includes(unit.stockStatus)) {
    return unit.stockStatus
  }
  return LEGACY_STATUS_TO_STOCK[unit.status] ?? 'in-stock'
}

export function stockStatusLabel(status: StockStatus) {
  return STOCK_STATUS_LABELS[status]
}

export function hardwareStatusForStock(stockStatus: StockStatus): HardwareStatus {
  return STOCK_TO_HARDWARE_STATUS[stockStatus]
}

/** Statuses the user is managing manually — do not auto-override with minQty rules. */
const STOCK_MANUAL_STATUSES: StockStatus[] = [
  'on-order',
  'reserved',
  'receiving',
  'incoming',
  'quarantine',
]

/**
 * Apply quantity / minQty rules after a stock edit.
 * - qty ≤ 0 → depleted (unless a manual pipeline status)
 * - qty ≤ minQty → low (when currently in-stock / low / depleted)
 */
export function applyInventoryStockRules(
  stockStatus: StockStatus,
  quantity: number,
  minQty?: number,
): StockStatus {
  if (STOCK_MANUAL_STATUSES.includes(stockStatus)) return stockStatus
  if (quantity <= 0) return 'depleted'
  if (typeof minQty === 'number' && Number.isFinite(minQty) && minQty >= 0 && quantity <= minQty) {
    return 'low'
  }
  if (stockStatus === 'depleted') return 'in-stock'
  return stockStatus
}

/** Status after receiving stock from an order pipeline (on-order / receiving / incoming). */
export function stockStatusAfterReceive(
  quantity: number,
  minQty?: number,
): StockStatus {
  if (quantity <= 0) return 'depleted'
  if (typeof minQty === 'number' && Number.isFinite(minQty) && minQty >= 0 && quantity <= minQty) {
    return 'low'
  }
  return 'in-stock'
}

export const TEST_KIND_LABELS: Record<TestLogEntry['kind'], string> = {
  'static-fire': 'Static fire',
  'cold-flow': 'Cold flow',
  'fit-check': 'Fit check',
  avionics: 'Avionics',
  structural: 'Structural',
  ground: 'Ground',
  other: 'Other',
}

export const TEST_RESULT_LABELS: Record<TestLogEntry['result'], string> = {
  pass: 'Pass',
  fail: 'Fail',
  partial: 'Partial',
  aborted: 'Aborted',
  'data-only': 'Data only',
}

export const PROCESS_STEP_STATUS_LABELS: Record<ProcessStepStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  blocked: 'Blocked',
  done: 'Done',
  skipped: 'Skipped',
}

export const PROCESS_STEP_STATUS_ORDER: ProcessStepStatus[] = [
  'pending',
  'active',
  'blocked',
  'done',
  'skipped',
]

export type HardwareLabState = {
  units: HardwareUnit[]
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
  processes: VehicleProcess[]
}

type StoredLab = {
  units?: HardwareUnit[]
  progress?: HardwareProgressNote[]
  tests?: TestLogEntry[]
  processes?: VehicleProcess[]
}

function seedState(): HardwareLabState {
  return {
    units: structuredClone(SEED_HARDWARE),
    progress: structuredClone(SEED_PROGRESS),
    tests: structuredClone(SEED_TESTS),
    processes: structuredClone(SEED_PROCESSES),
  }
}

export function loadHardwareLab(): HardwareLabState {
  const seed = seedState()
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem('octopus.hardware-lab.v1')
    if (!raw) return seed
    const stored = JSON.parse(raw) as StoredLab
    return {
      units: Array.isArray(stored.units) ? stored.units : seed.units,
      progress: Array.isArray(stored.progress) ? stored.progress : seed.progress,
      tests: Array.isArray(stored.tests) ? stored.tests : seed.tests,
      processes: Array.isArray(stored.processes)
        ? stored.processes
        : seed.processes,
    }
  } catch {
    return seed
  }
}

export function saveHardwareLab(state: HardwareLabState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetHardwareLab(): HardwareLabState {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem('octopus.hardware-lab.v1')
  return seedState()
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function sortUnits(units: HardwareUnit[]) {
  return [...units].sort((a, b) => {
    const ai = HARDWARE_STATUS_ORDER.indexOf(a.status)
    const bi = HARDWARE_STATUS_ORDER.indexOf(b.status)
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })
}

export function sortTests(tests: TestLogEntry[]) {
  return [...tests].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export function sortProgress(notes: HardwareProgressNote[]) {
  return [...notes].sort((a, b) => b.date.localeCompare(a.date))
}

export function sortProcesses(processes: VehicleProcess[]) {
  return [...processes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function sortProcessSteps(steps: VehicleProcessStep[]) {
  return [...steps].sort((a, b) => a.order - b.order)
}

export function processCompletion(process: VehicleProcess) {
  const steps = process.steps
  if (steps.length === 0) return { done: 0, total: 0, pct: 0 }
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  return {
    done,
    total: steps.length,
    pct: Math.round((done / steps.length) * 100),
  }
}

export function processOverallStatus(process: VehicleProcess): ProcessStepStatus {
  if (process.steps.some((s) => s.status === 'blocked')) return 'blocked'
  if (process.steps.every((s) => s.status === 'done' || s.status === 'skipped')) {
    return 'done'
  }
  if (process.steps.some((s) => s.status === 'active')) return 'active'
  return 'pending'
}

export function unitQuantity(unit: HardwareUnit) {
  return typeof unit.quantity === 'number' && Number.isFinite(unit.quantity)
    ? unit.quantity
    : 1
}

/** Outstanding on-order quantity for inventory (0 if unset). */
export function unitOnOrderQty(unit: Pick<HardwareUnit, 'onOrderQty'>) {
  return typeof unit.onOrderQty === 'number' &&
    Number.isFinite(unit.onOrderQty) &&
    unit.onOrderQty > 0
    ? unit.onOrderQty
    : 0
}

/** Optional unit price for inventory value estimates. */
export function unitPriceOf(unit: Pick<HardwareUnit, 'unitPrice'>) {
  return typeof unit.unitPrice === 'number' &&
    Number.isFinite(unit.unitPrice) &&
    unit.unitPrice >= 0
    ? unit.unitPrice
    : undefined
}

export function formatMoney(amount: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}
