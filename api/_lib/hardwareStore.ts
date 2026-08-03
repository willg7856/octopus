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
import { hasEnv, readEnv } from './env.js'

export type HardwareLabState = {
  units: HardwareUnit[]
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
  processes: VehicleProcess[]
}

export const HARDWARE_REDIS_KEY = 'octopus:hardware-lab'
export const LAB_BLOB_PATHNAME = 'hardware/lab-state.json'

export type SharedHardwareLab = HardwareLabState & {
  revision: number
  updatedAt: string
  updatedBy: string
}

export type StorageMode = 'redis' | 'blob' | 'file'

type BlobAccess = 'public' | 'private'
type StoredLab = Partial<SharedHardwareLab>

const LOCAL_PATH = join(process.cwd(), '.data', 'hardware-lab.json')

let resolvedBlobAccess: BlobAccess | null = null

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
  return readEnv('UPSTASH_REDIS_REST_URL') || readEnv('KV_REST_API_URL')
}

function redisToken() {
  return readEnv('UPSTASH_REDIS_REST_TOKEN') || readEnv('KV_REST_API_TOKEN')
}

function redisConfigured() {
  return Boolean(redisUrl() && redisToken())
}

function blobConfigured() {
  return (
    hasEnv('BLOB_READ_WRITE_TOKEN') ||
    hasEnv('BLOB_STORE_ID') ||
    (readEnv('VERCEL') === '1' && hasEnv('VERCEL_OIDC_TOKEN'))
  )
}

export function storageSetupHint() {
  if (!redisConfigured()) {
    return (
      'Prefer Upstash Redis for snappy shared inventory. In Vercel → octopus → Storage, ' +
      'create or connect an Upstash Redis database to Production (and Preview), then Redeploy. ' +
      'Until Redis is connected, the app keeps using Vercel Blob as a fallback.'
    )
  }
  return (
    'Shared inventory storage is misconfigured. Confirm Upstash Redis is connected under ' +
    'Vercel → Storage, or that a Blob store remains connected as fallback, then Redeploy.'
  )
}

function getRedis() {
  return new Redis({
    url: redisUrl(),
    token: redisToken(),
  })
}

async function readRedis(): Promise<SharedHardwareLab | null> {
  const value = await getRedis().get<StoredLab | string>(HARDWARE_REDIS_KEY)
  if (value == null) return null
  if (typeof value === 'string') {
    if (!value.trim()) return null
    return normalize(JSON.parse(value) as StoredLab)
  }
  return normalize(value)
}

async function writeRedis(lab: SharedHardwareLab) {
  await getRedis().set(HARDWARE_REDIS_KEY, lab)
}

function blobAccessCandidates(): BlobAccess[] {
  if (resolvedBlobAccess) return [resolvedBlobAccess]
  return ['public', 'private']
}

async function streamToJson(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  const text = await new Response(stream).text()
  if (!text.trim()) return null
  return JSON.parse(text) as unknown
}

async function tryGetBlob(access: BlobAccess): Promise<SharedHardwareLab | null | undefined> {
  try {
    const result = await get(LAB_BLOB_PATHNAME, {
      access,
      ...(access === 'private' ? { useCache: false as const } : {}),
    })
    resolvedBlobAccess = access
    if (!result?.stream) return null
    try {
      const raw = await streamToJson(result.stream)
      return normalize(raw as StoredLab)
    } catch {
      return null
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/\b400\b/.test(message) || /access|private|public|cache/i.test(message)) {
      return undefined
    }
    if (/not found|404/i.test(message)) return null
    throw error
  }
}

async function readBlob(): Promise<SharedHardwareLab | null> {
  for (const access of blobAccessCandidates()) {
    const result = await tryGetBlob(access)
    if (result === undefined) continue
    return result
  }
  return null
}

async function writeBlob(lab: SharedHardwareLab) {
  const body = JSON.stringify(lab)
  let lastError: unknown
  for (const access of blobAccessCandidates()) {
    try {
      await put(LAB_BLOB_PATHNAME, body, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      })
      resolvedBlobAccess = access
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
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

export function storageMode(): StorageMode {
  if (redisConfigured()) return 'redis'
  // On Vercel without Redis yet, keep Blob so inventory stays shared.
  if (readEnv('VERCEL') === '1' || blobConfigured()) return 'blob'
  return 'file'
}

async function withStorageErrors<T>(backend: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${backend} read/write failed (${message}). ${storageSetupHint()}`)
  }
}

export async function loadSharedLab(): Promise<SharedHardwareLab> {
  const mode = storageMode()

  if (mode === 'redis') {
    return withStorageErrors('Upstash Redis', async () => {
      const existing = await readRedis()
      if (existing) return existing
      const seeded = seedLab('system')
      await writeRedis(seeded)
      return seeded
    })
  }

  if (mode === 'blob') {
    return withStorageErrors('Vercel Blob', async () => {
      const existing = await readBlob()
      if (existing) return existing
      const seeded = seedLab('system')
      await writeBlob(seeded)
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

  if (mode === 'redis') {
    await withStorageErrors('Upstash Redis', async () => writeRedis(lab))
  } else if (mode === 'blob') {
    await withStorageErrors('Vercel Blob', async () => writeBlob(lab))
  } else {
    await writeLocal(lab)
  }

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

  if (mode === 'redis') {
    await withStorageErrors('Upstash Redis', async () => writeRedis(lab))
  } else if (mode === 'blob') {
    await withStorageErrors('Vercel Blob', async () => writeBlob(lab))
  } else {
    await writeLocal(lab)
  }

  return lab
}

export function storageEnvFlags() {
  return {
    UPSTASH_REDIS_REST_URL: hasEnv('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: hasEnv('UPSTASH_REDIS_REST_TOKEN'),
    KV_REST_API_URL: hasEnv('KV_REST_API_URL'),
    KV_REST_API_TOKEN: hasEnv('KV_REST_API_TOKEN'),
    BLOB_READ_WRITE_TOKEN: hasEnv('BLOB_READ_WRITE_TOKEN'),
    BLOB_STORE_ID: hasEnv('BLOB_STORE_ID'),
    VERCEL_OIDC_TOKEN: hasEnv('VERCEL_OIDC_TOKEN'),
    VERCEL: readEnv('VERCEL') === '1',
    blobAccess: resolvedBlobAccess,
  }
}
