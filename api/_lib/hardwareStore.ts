import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Redis } from '@upstash/redis'
import { get, put } from '@vercel/blob'
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
export const HARDWARE_BLOB_PATH = 'octopus/hardware-lab.json'

export type SharedHardwareLab = HardwareLabState & {
  revision: number
  updatedAt: string
  updatedBy: string
}

export type StorageMode = 'redis' | 'blob' | 'file'

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

function redisUrl() {
  return (
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    ''
  )
}

function redisToken() {
  return (
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    ''
  )
}

function redisConfigured() {
  return Boolean(redisUrl() && redisToken())
}

function blobConfigured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim(),
  )
}

function blobAccess(): 'private' | 'public' {
  return process.env.BLOB_ACCESS === 'public' ? 'public' : 'private'
}

export function storageSetupHint() {
  return (
    'Shared inventory needs storage. Prefer Upstash Redis env vars ' +
    'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or connect a Vercel Blob store ' +
    '(BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN), then Redeploy.'
  )
}

function getRedis() {
  return new Redis({
    url: redisUrl(),
    token: redisToken(),
  })
}

async function streamToText(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return ''
  return new Response(stream).text()
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

async function readBlob(): Promise<SharedHardwareLab | null> {
  const result = await get(HARDWARE_BLOB_PATH, {
    access: blobAccess(),
    useCache: false,
  })
  if (!result || result.statusCode !== 200) return null
  const text = await streamToText(result.stream)
  if (!text.trim()) return null
  return normalize(JSON.parse(text) as StoredLab)
}

async function writeBlob(lab: SharedHardwareLab) {
  await put(HARDWARE_BLOB_PATH, JSON.stringify(lab), {
    access: blobAccess(),
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  })
}

export function storageMode(): StorageMode {
  if (redisConfigured()) return 'redis'
  if (blobConfigured()) return 'blob'
  if (process.env.VERCEL === '1') {
    throw new Error(storageSetupHint())
  }
  return 'file'
}

async function withStoreErrors<T>(backend: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${backend} read/write failed (${message}). ${storageSetupHint()}`)
  }
}

async function readStore(mode: StorageMode): Promise<SharedHardwareLab | null> {
  if (mode === 'redis') return withStoreErrors('Upstash Redis', readRedis)
  if (mode === 'blob') return withStoreErrors('Vercel Blob', readBlob)
  return readLocal()
}

async function writeStore(mode: StorageMode, lab: SharedHardwareLab) {
  if (mode === 'redis') {
    await withStoreErrors('Upstash Redis', async () => writeRedis(lab))
    return
  }
  if (mode === 'blob') {
    await withStoreErrors('Vercel Blob', async () => writeBlob(lab))
    return
  }
  await writeLocal(lab)
}

export async function loadSharedLab(): Promise<SharedHardwareLab> {
  const mode = storageMode()
  const existing = await readStore(mode)
  if (existing) return existing
  const seeded = seedLab('system')
  await writeStore(mode, seeded)
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
  const mode = storageMode()
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

  await writeStore(mode, lab)
  return { ok: true, lab }
}

export async function resetSharedLab(updatedBy: string): Promise<SharedHardwareLab> {
  const mode = storageMode()
  const current = await loadSharedLab()
  const lab: SharedHardwareLab = {
    ...seedLab(updatedBy),
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }
  await writeStore(mode, lab)
  return lab
}

export function storageEnvFlags() {
  return {
    UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()),
    UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim()),
    KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL?.trim()),
    KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN?.trim()),
    BLOB_STORE_ID: Boolean(process.env.BLOB_STORE_ID?.trim()),
    BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
    VERCEL: process.env.VERCEL === '1',
  }
}
