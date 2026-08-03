import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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

export const LAB_BLOB_PATHNAME = 'hardware/lab-state.json'

export type SharedHardwareLab = HardwareLabState & {
  revision: number
  updatedAt: string
  updatedBy: string
}

export type StorageMode = 'blob' | 'file'

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

function blobConfigured() {
  // Marketplace-connected Blob stores inject BLOB_STORE_ID (and often a token).
  // OIDC on Vercel can authenticate without a manual token.
  return (
    hasEnv('BLOB_READ_WRITE_TOKEN') ||
    hasEnv('BLOB_STORE_ID') ||
    (readEnv('VERCEL') === '1' && hasEnv('VERCEL_OIDC_TOKEN'))
  )
}

export function storageSetupHint() {
  return (
    'Shared inventory needs a Vercel Blob store connected to this project. ' +
    'In Vercel → octopus → Storage, create or connect a Blob store to Production ' +
    '(and Preview if you use it), then Redeploy. ' +
    'If the store is already connected, Redeploy without build cache so the runtime picks up BLOB_STORE_ID.'
  )
}

async function streamToJson(stream: ReadableStream<Uint8Array>): Promise<unknown> {
  const text = await new Response(stream).text()
  if (!text.trim()) return null
  return JSON.parse(text) as unknown
}

async function readBlob(): Promise<SharedHardwareLab | null> {
  const result = await get(LAB_BLOB_PATHNAME, {
    access: 'private',
    useCache: false,
  })
  if (!result?.stream) return null
  try {
    const raw = await streamToJson(result.stream)
    return normalize(raw as StoredLab)
  } catch {
    return null
  }
}

async function writeBlob(lab: SharedHardwareLab) {
  await put(LAB_BLOB_PATHNAME, JSON.stringify(lab), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  })
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
  // On Vercel, always use Blob. Connected stores authenticate via injected
  // BLOB_STORE_ID / token / OIDC — do not gate on process.env visibility
  // (that check was falsely failing for Redis Sensitive vars).
  if (readEnv('VERCEL') === '1' || blobConfigured()) return 'blob'
  return 'file'
}

async function withBlobErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Vercel Blob read/write failed (${message}). ${storageSetupHint()}`)
  }
}

export async function loadSharedLab(): Promise<SharedHardwareLab> {
  const mode = storageMode()
  if (mode === 'blob') {
    return withBlobErrors(async () => {
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

  if (mode === 'blob') {
    await withBlobErrors(async () => writeBlob(lab))
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

  if (mode === 'blob') {
    await withBlobErrors(async () => writeBlob(lab))
  } else {
    await writeLocal(lab)
  }

  return lab
}

export function storageEnvFlags() {
  return {
    BLOB_READ_WRITE_TOKEN: hasEnv('BLOB_READ_WRITE_TOKEN'),
    BLOB_STORE_ID: hasEnv('BLOB_STORE_ID'),
    VERCEL_OIDC_TOKEN: hasEnv('VERCEL_OIDC_TOKEN'),
    VERCEL: readEnv('VERCEL') === '1',
  }
}
