import type {
  HardwareProgressNote,
  HardwareStatus,
  HardwareUnit,
  ProcessStepStatus,
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
  motor: 'Motor / propulsion',
  avionics: 'Avionics',
  pad: 'Pad / stand',
  ground: 'Ground support',
  part: 'Part',
  consumable: 'Consumable',
  tool: 'Tool',
  other: 'Other',
}

/** Vehicles and flight/GSE subsystems — shown under Hardware. */
export const SYSTEM_KINDS: HardwareUnit['kind'][] = [
  'vehicle',
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

/** Stock-facing labels for inventory items (same status field, different meaning). */
export const INVENTORY_STATUS_LABELS: Record<HardwareStatus, string> = {
  concept: 'Incoming',
  design: 'Reserved',
  fab: 'Receiving',
  assembly: 'On order',
  checkout: 'Low stock',
  'flight-ready': 'In stock',
  retired: 'Depleted',
  failed: 'Quarantine',
}

export const INVENTORY_STATUS_ORDER: HardwareStatus[] = [
  'flight-ready',
  'checkout',
  'assembly',
  'design',
  'fab',
  'concept',
  'failed',
  'retired',
]

export function inventoryStatusLabel(status: HardwareStatus) {
  return INVENTORY_STATUS_LABELS[status] ?? status
}

export function normalizeInventoryStatus(status: HardwareStatus): HardwareStatus {
  return INVENTORY_STATUS_ORDER.includes(status) ? status : 'flight-ready'
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
