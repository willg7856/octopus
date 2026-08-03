import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Redis } from '@upstash/redis'
import {
  SEED_HARDWARE,
  SEED_PROCESSES,
  SEED_PROGRESS,
  SEED_TESTS,
} from '../../src/hardwareSeed.js'
import type {
  HardwareProgressNote,
  HardwareUnit,
  TestLogEntry,
  VehicleProcess,
} from '../../src/types.js'

export type HardwareLabState = {
  units: HardwareUnit[]
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
  processes: VehicleProcess[]
}

export const HARDWARE_REDIS_KEY = 'octopus:hardware-lab'

export type SharedHardwareLab = HardwareLabState & {
  revision: number
  updatedAt: string
  updatedBy: string
}

type StoredLab = Partial<SharedHardwareLab>

const LOCAL_PATH = join(process.cwd(), '.data', 'hardware-lab.json')

function seedLab(updatedBy = 'system'): SharedHardwareLab {
  return {
    revision: 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    units: structuredClone(SEED_HARDWARE),
    progress: structuredClone(SEED_PROGRESS),
    tests: structuredClone(SEED_TESTS),
    processes: structuredClone(SEED_PROCESSES),
  }
}

function normalize(raw: StoredLab | null | undefined, updatedBy = 'system'): SharedHardwareLab {
  const seed = seedLab(updatedBy)
  if (!raw || typeof raw !== 'object') return seed
  return {
    revision: Number.isFinite(raw.revision) ? Number(raw.revision) : seed.revision,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : seed.updatedAt,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : seed.updatedBy,
    units: Array.isArray(raw.units) ? raw.units : seed.units,
    progress: Array.isArray(raw.progress) ? raw.progress : seed.progress,
    tests: Array.isArray(raw.tests) ? raw.tests : seed.tests,
    processes: Array.isArray(raw.processes) ? raw.processes : seed.processes,
  }
}

function redisConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  )
}

export function redisSetupHint() {
  return (
    'Create a free Upstash Redis database, then add UPSTASH_REDIS_REST_URL and ' +
    'UPSTASH_REDIS_REST_TOKEN to the octopus Vercel project (Production + Preview), then Redeploy. ' +
    'Console: https://console.upstash.com/'
  )
}

function getRedis() {
  return Redis.fromEnv()
}

async function readLocal(): Promise<SharedHardwareLab | null> {
  try {
    const raw = await readFile(LOCAL_PATH, 'utf8')
    return normalize(JSON.parse(raw) as StoredLab)
  } catch {
    return null
  }
}

async function writeLocal(lab: SharedHardwareLab) {
  await mkdir(dirname(LOCAL_PATH), { recursive: true })
  await writeFile(LOCAL_PATH, JSON.stringify(lab, null, 2), 'utf8')
}

async function readRedis(): Promise<SharedHardwareLab | null> {
  const redis = getRedis()
  const value = await redis.get<StoredLab | string>(HARDWARE_REDIS_KEY)
  if (value == null) return null
  if (typeof value === 'string') {
    if (!value.trim()) return null
    return normalize(JSON.parse(value) as StoredLab)
  }
  return normalize(value)
}

async function writeRedis(lab: SharedHardwareLab) {
  const redis = getRedis()
  await redis.set(HARDWARE_REDIS_KEY, lab)
}

export function storageMode(): 'redis' | 'file' {
  if (redisConfigured()) return 'redis'
  if (process.env.VERCEL === '1') {
    throw new Error(`Shared inventory needs Upstash Redis. ${redisSetupHint()}`)
  }
  return 'file'
}

async function withRedisErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Upstash Redis read/write failed (${message}). Check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. ${redisSetupHint()}`,
    )
  }
}

export async function loadSharedLab(): Promise<SharedHardwareLab> {
  const mode = storageMode()
  if (mode === 'redis') {
    return withRedisErrors(async () => {
      const existing = await readRedis()
      if (existing) return existing
      const seeded = seedLab('system')
      await writeRedis(seeded)
      return seeded
    })
  }

  const existing = await readLocal()
  if (existing) return existing
  const seeded = seedLab('system')
  await writeLocal(seeded)
  return seeded
}

export async function saveSharedLab(
  next: HardwareLabState,
  expectedRevision: number,
  updatedBy: string,
): Promise<
  | { ok: true; lab: SharedHardwareLab }
  | { ok: false; conflict: true; lab: SharedHardwareLab }
> {
  const current = await loadSharedLab()
  if (current.revision !== expectedRevision) {
    return { ok: false, conflict: true, lab: current }
  }

  const lab: SharedHardwareLab = {
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    units: next.units,
    progress: next.progress,
    tests: next.tests,
    processes: next.processes,
  }

  if (storageMode() === 'redis') {
    await withRedisErrors(async () => {
      await writeRedis(lab)
    })
  } else {
    await writeLocal(lab)
  }

  return { ok: true, lab }
}

export async function resetSharedLab(updatedBy: string): Promise<SharedHardwareLab> {
  const current = await loadSharedLab()
  const lab: SharedHardwareLab = {
    ...seedLab(updatedBy),
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }

  if (storageMode() === 'redis') {
    await withRedisErrors(async () => {
      await writeRedis(lab)
    })
  } else {
    await writeLocal(lab)
  }

  return lab
}
