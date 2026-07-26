import type {
  HardwareProgressNote,
  HardwareStatus,
  HardwareUnit,
  TestLogEntry,
} from './types'

const STORAGE_KEY = 'octopus.hardware-lab.v1'

export const HARDWARE_KIND_LABELS: Record<HardwareUnit['kind'], string> = {
  vehicle: 'Vehicle',
  motor: 'Motor',
  avionics: 'Avionics',
  pad: 'Pad / stand',
  ground: 'Ground support',
  other: 'Other',
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

/** Seed inventory — edit here for shared defaults; browser edits layer on top. */
export const SEED_HARDWARE: HardwareUnit[] = [
  {
    id: 'hw-stravox-b1m',
    name: 'STRAVOX airframe',
    kind: 'vehicle',
    serial: 'SVX-B1M-001',
    hwRev: 'B1M · rev A',
    fwVersion: '',
    status: 'assembly',
    location: 'Goods Shed',
    owner: 'Structures',
    notes: 'Primary flight vehicle for B1M campaign.',
    updatedAt: '2026-07-20T10:00:00.000Z',
  },
  {
    id: 'hw-motor-b1m',
    name: 'B1M motor',
    kind: 'motor',
    serial: 'MTR-B1M-001',
    hwRev: 'B1M · grain set 1',
    status: 'checkout',
    location: 'Goods Shed · prop bay',
    owner: 'Propulsion',
    notes: 'Static-fire candidate. Case temp instrumentation fitted.',
    updatedAt: '2026-07-22T08:30:00.000Z',
  },
  {
    id: 'hw-avionics-01',
    name: 'Flight computer',
    kind: 'avionics',
    serial: 'AVN-FC-01',
    hwRev: 'rev B',
    fwVersion: '0.4.2-dev',
    status: 'checkout',
    location: 'Goods Shed · bench',
    owner: 'Avionics',
    notes: 'Downlink dry-run load. GPS path not fully exercised.',
    updatedAt: '2026-07-24T14:15:00.000Z',
  },
  {
    id: 'hw-pad-stand',
    name: 'Static-fire stand',
    kind: 'pad',
    serial: 'PAD-SF-01',
    hwRev: 'rev C',
    status: 'flight-ready',
    location: 'Pad',
    owner: 'Structures',
    notes: 'Load path verified. Thrust cell cal current.',
    updatedAt: '2026-07-18T16:00:00.000Z',
  },
  {
    id: 'hw-logger',
    name: 'Goods Shed logger',
    kind: 'ground',
    serial: 'GSE-LOG-01',
    hwRev: 'rev A',
    fwVersion: '1.1.0',
    status: 'flight-ready',
    location: 'Goods Shed',
    owner: 'Ops',
    notes: 'Records pad instruments during burns.',
    updatedAt: '2026-07-15T09:00:00.000Z',
  },
]

export const SEED_PROGRESS: HardwareProgressNote[] = [
  {
    id: 'pg-1',
    unitId: 'hw-motor-b1m',
    date: '2026-07-22',
    status: 'checkout',
    note: 'Grain set installed. Chamber pressure tap leak-checked.',
    author: 'Propulsion',
  },
  {
    id: 'pg-2',
    unitId: 'hw-stravox-b1m',
    date: '2026-07-20',
    status: 'assembly',
    note: 'Fin can and motor interface dry-fit complete.',
    author: 'Structures',
  },
  {
    id: 'pg-3',
    unitId: 'hw-avionics-01',
    date: '2026-07-24',
    status: 'checkout',
    note: 'FW 0.4.2-dev flashed. Packet path to shed logger OK in bench loop.',
    author: 'Avionics',
  },
  {
    id: 'pg-4',
    unitId: 'hw-pad-stand',
    date: '2026-07-18',
    status: 'flight-ready',
    note: 'Thrust cell zeroed and span-checked against known mass.',
    author: 'Ops',
  },
]

export const SEED_TESTS: TestLogEntry[] = [
  {
    id: 'test-1',
    date: '2026-07-12',
    title: 'Pad stand load check',
    kind: 'structural',
    result: 'pass',
    unitIds: ['hw-pad-stand', 'hw-logger'],
    site: 'Pad',
    operator: 'Ops',
    summary: 'Static load path and logger capture verified with deadweight.',
    metrics: [
      { key: 'peak_load', value: '120', unit: 'kgf' },
      { key: 'sample_rate', value: '200', unit: 'Hz' },
    ],
    dataRef: 'Drive · test campaign / 2026-07-12-pad-load',
    createdAt: '2026-07-12T17:00:00.000Z',
  },
  {
    id: 'test-2',
    date: '2026-07-24',
    title: 'Avionics downlink dry run',
    kind: 'avionics',
    result: 'partial',
    unitIds: ['hw-avionics-01', 'hw-logger'],
    site: 'Goods Shed',
    operator: 'Avionics',
    summary:
      'Bench RF path into shed logger stable. GPS sats not locked indoors — outdoor retest needed.',
    metrics: [
      { key: 'packet_drop', value: '0.2', unit: '%' },
      { key: 'latency_p95', value: '48', unit: 'ms' },
    ],
    dataRef: 'Drive · test campaign / 2026-07-24-avionics-dry',
    createdAt: '2026-07-24T15:30:00.000Z',
  },
  {
    id: 'test-3',
    date: '2026-07-25',
    title: 'Motor / airframe fit check',
    kind: 'fit-check',
    result: 'pass',
    unitIds: ['hw-motor-b1m', 'hw-stravox-b1m'],
    site: 'Goods Shed',
    operator: 'Structures',
    summary: 'Motor seats cleanly. Retention hardware torque marked.',
    createdAt: '2026-07-25T11:00:00.000Z',
  },
]

export type HardwareLabState = {
  units: HardwareUnit[]
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
}

type StoredLab = {
  units?: HardwareUnit[]
  progress?: HardwareProgressNote[]
  tests?: TestLogEntry[]
}

function seedState(): HardwareLabState {
  return {
    units: structuredClone(SEED_HARDWARE),
    progress: structuredClone(SEED_PROGRESS),
    tests: structuredClone(SEED_TESTS),
  }
}

export function loadHardwareLab(): HardwareLabState {
  const seed = seedState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed
    const stored = JSON.parse(raw) as StoredLab
    return {
      units: Array.isArray(stored.units) ? stored.units : seed.units,
      progress: Array.isArray(stored.progress) ? stored.progress : seed.progress,
      tests: Array.isArray(stored.tests) ? stored.tests : seed.tests,
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
