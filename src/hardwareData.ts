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
  electronics: 'Electronics',
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
  'electronics',
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
  completed: 'Completed',
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
  'completed',
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


const LEGACY_INVENTORY_KINDS = new Set(['flight-hardware', 'test-hardware'])

/** Map removed inventory kinds onto part; preserve other fields. */
export function normalizeHardwareUnit(unit: HardwareUnit): HardwareUnit {
  const kind = unit.kind as string
  if (LEGACY_INVENTORY_KINDS.has(kind)) {
    return { ...unit, kind: 'part' }
  }
  return unit
}

export function normalizeHardwareLabState(state: HardwareLabState): HardwareLabState {
  return {
    ...state,
    units: state.units.map(normalizeHardwareUnit),
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
    return normalizeHardwareLabState({
      units: Array.isArray(stored.units) ? stored.units : seed.units,
      progress: Array.isArray(stored.progress) ? stored.progress : seed.progress,
      tests: Array.isArray(stored.tests) ? stored.tests : seed.tests,
      processes: Array.isArray(stored.processes)
        ? stored.processes
        : seed.processes,
    })
  } catch {
    return normalizeHardwareLabState(seed)
  }
}

export function saveHardwareLab(state: HardwareLabState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetHardwareLab(): HardwareLabState {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem('octopus.hardware-lab.v1')
  return normalizeHardwareLabState(seedState())
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

/** True when an outstanding order is past its expected delivery date. */
export function isOrderOverdue(
  unit: Pick<HardwareUnit, 'expectedAt' | 'onOrderQty' | 'stockStatus' | 'status'>,
  today = new Date().toISOString().slice(0, 10),
) {
  const eta = unit.expectedAt?.trim()
  if (!eta) return false
  const status = stockStatusOf(unit as HardwareUnit)
  const outstanding =
    unitOnOrderQty(unit) > 0 ||
    status === 'on-order' ||
    status === 'receiving' ||
    status === 'incoming'
  if (!outstanding) return false
  return eta < today
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

/**
 * Install inventory onto a hardware unit.
 * - qty 1 / draw-all: reserve the whole line (`installedOnUnitId` + reserved)
 * - partial qty on multi-qty lines: draw from on-hand, track on `linkedInventoryDraws`
 */
export function installInventoryOnHardware(
  units: HardwareUnit[],
  hardwareId: string,
  inventoryId: string,
  drawQty?: number,
  now = new Date().toISOString(),
): { units: HardwareUnit[]; error?: string } {
  const hardware = units.find((u) => u.id === hardwareId)
  const item = units.find((u) => u.id === inventoryId)
  if (!hardware || !isSystemKind(hardware.kind)) {
    return { units, error: 'Hardware unit not found' }
  }
  if (!item || !isInventoryKind(item.kind)) {
    return { units, error: 'Inventory item not found' }
  }
  if (item.installedOnUnitId && item.installedOnUnitId !== hardwareId) {
    const other = units.find((u) => u.id === item.installedOnUnitId)
    return {
      units,
      error: `Already installed on ${other?.name ?? 'another unit'} — return it first`,
    }
  }

  const onHand = unitQuantity(item)
  if (onHand <= 0) {
    return { units, error: 'Nothing on hand to install' }
  }

  const qty = drawQty == null ? (onHand <= 1 ? 1 : 1) : Math.floor(drawQty)
  if (!Number.isFinite(qty) || qty <= 0) {
    return { units, error: 'Enter a quantity to install' }
  }
  if (qty > onHand) {
    return { units, error: `Only ${onHand} on hand` }
  }

  const reserveWhole = qty >= onHand

  const next = units.map((u) => {
    if (u.id === hardwareId) {
      const linked = u.linkedInventoryIds ?? []
      const draws = { ...(u.linkedInventoryDraws ?? {}) }
      if (reserveWhole) {
        delete draws[inventoryId]
      } else {
        draws[inventoryId] = (draws[inventoryId] ?? 0) + qty
      }
      const nextDraws = Object.keys(draws).length > 0 ? draws : undefined
      return {
        ...u,
        linkedInventoryIds: linked.includes(inventoryId)
          ? linked
          : [...linked, inventoryId],
        linkedInventoryDraws: nextDraws,
        updatedAt: now,
      }
    }
    if (u.id === inventoryId) {
      if (reserveWhole) {
        return {
          ...u,
          installedOnUnitId: hardwareId,
          stockStatus: 'reserved' as const,
          status: hardwareStatusForStock('reserved'),
          updatedAt: now,
        }
      }
      const remaining = onHand - qty
      const stockStatus = applyInventoryStockRules(
        stockStatusOf(u) === 'reserved' ? 'in-stock' : stockStatusOf(u),
        remaining,
        u.minQty,
      )
      return {
        ...u,
        quantity: remaining,
        installedOnUnitId: undefined,
        stockStatus,
        status: hardwareStatusForStock(stockStatus),
        updatedAt: now,
      }
    }
    return u
  })
  return { units: next }
}

/** Return a reserved (whole-line) inventory item to available stock. */
export function returnInventoryFromHardware(
  units: HardwareUnit[],
  inventoryId: string,
  now = new Date().toISOString(),
): { units: HardwareUnit[]; error?: string } {
  const item = units.find((u) => u.id === inventoryId)
  if (!item || !isInventoryKind(item.kind)) {
    return { units, error: 'Inventory item not found' }
  }
  if (!item.installedOnUnitId) {
    return { units, error: 'Item is not installed' }
  }

  const qty = unitQuantity(item)
  const stockStatus = applyInventoryStockRules('in-stock', qty, item.minQty)
  const hardwareId = item.installedOnUnitId
  const next = units.map((u) => {
    if (u.id === inventoryId) {
      return {
        ...u,
        installedOnUnitId: undefined,
        stockStatus,
        status: hardwareStatusForStock(stockStatus),
        updatedAt: now,
      }
    }
    if (u.id === hardwareId) {
      const linked = (u.linkedInventoryIds ?? []).filter((id) => id !== inventoryId)
      const draws = { ...(u.linkedInventoryDraws ?? {}) }
      delete draws[inventoryId]
      return {
        ...u,
        linkedInventoryIds: linked.length > 0 ? linked : undefined,
        linkedInventoryDraws:
          Object.keys(draws).length > 0 ? draws : undefined,
        updatedAt: now,
      }
    }
    return u
  })
  return { units: next }
}

/**
 * Return drawn consumable qty from a hardware unit back to inventory,
 * or return a reserved whole-line install.
 */
export function unlinkInventoryFromHardware(
  units: HardwareUnit[],
  hardwareId: string,
  inventoryId: string,
  now = new Date().toISOString(),
): HardwareUnit[] {
  const hardware = units.find((u) => u.id === hardwareId)
  const item = units.find((u) => u.id === inventoryId)
  if (!hardware || !item) return units

  if (item.installedOnUnitId === hardwareId) {
    return returnInventoryFromHardware(units, inventoryId, now).units
  }

  const drawn = hardware.linkedInventoryDraws?.[inventoryId] ?? 0
  return units.map((u) => {
    if (u.id === inventoryId && drawn > 0) {
      const qty = unitQuantity(u) + drawn
      const stockStatus = applyInventoryStockRules(
        stockStatusOf(u) === 'reserved' ? 'in-stock' : stockStatusOf(u),
        qty,
        u.minQty,
      )
      return {
        ...u,
        quantity: qty,
        stockStatus,
        status: hardwareStatusForStock(stockStatus),
        updatedAt: now,
      }
    }
    if (u.id === hardwareId) {
      const linked = (u.linkedInventoryIds ?? []).filter((id) => id !== inventoryId)
      const draws = { ...(u.linkedInventoryDraws ?? {}) }
      delete draws[inventoryId]
      return {
        ...u,
        linkedInventoryIds: linked.length > 0 ? linked : undefined,
        linkedInventoryDraws:
          Object.keys(draws).length > 0 ? draws : undefined,
        updatedAt: now,
      }
    }
    return u
  })
}

/** When removing a hardware unit, return reserved + drawn inventory. */
export function returnAllInstalledOnHardware(
  units: HardwareUnit[],
  hardwareId: string,
  now = new Date().toISOString(),
): HardwareUnit[] {
  const hardware = units.find((u) => u.id === hardwareId)
  let next = units
  for (const u of units) {
    if (u.installedOnUnitId === hardwareId) {
      next = returnInventoryFromHardware(next, u.id, now).units
    }
  }
  if (hardware?.linkedInventoryIds?.length) {
    for (const inventoryId of hardware.linkedInventoryIds) {
      next = unlinkInventoryFromHardware(next, hardwareId, inventoryId, now)
    }
  }
  return next
}

/** Clear install links when an inventory item leaves reserved without going through Return. */
export function clearHardwareLinksToInventory(
  units: HardwareUnit[],
  inventoryId: string,
  now = new Date().toISOString(),
): HardwareUnit[] {
  return units.map((u) => {
    if (!isSystemKind(u.kind)) return u
    const linked = u.linkedInventoryIds ?? []
    if (!linked.includes(inventoryId) && !u.linkedInventoryDraws?.[inventoryId]) {
      return u
    }
    const nextLinked = linked.filter((id) => id !== inventoryId)
    const draws = { ...(u.linkedInventoryDraws ?? {}) }
    delete draws[inventoryId]
    return {
      ...u,
      linkedInventoryIds: nextLinked.length > 0 ? nextLinked : undefined,
      linkedInventoryDraws:
        Object.keys(draws).length > 0 ? draws : undefined,
      updatedAt: now,
    }
  })
}
