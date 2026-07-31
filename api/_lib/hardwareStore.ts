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

export type HardwareLabState = {
  units: HardwareUnit[]
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
  processes: VehicleProcess[]
}

export const HARDWARE_BLOB_PATH = 'octopus/hardware-lab.json'

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

/** True when a Blob store is connected (OIDC via BLOB_STORE_ID) or a RW token is set. */
function blobConfigured() {
  // Do not treat VERCEL_OIDC_TOKEN alone as configured — Vercel injects it on every deploy.
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

function blobAccess(): 'private' | 'public' {
  return process.env.BLOB_ACCESS === 'public' ? 'public' : 'private'
}

export function blobSetupHint() {
  return (
    'Create a Vercel Blob store for the octopus project: ' +
    'Vercel → octopus → Storage → Create Database → Blob → Private → ' +
    'connect Production + Preview, then Redeploy. ' +
    'Dashboard: https://vercel.com/beyondstagezero/octopus/stores'
  )
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

async function readBlob(): Promise<SharedHardwareLab | null> {
  const access = blobAccess()
  const result = await get(HARDWARE_BLOB_PATH, {
    access,
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

export function storageMode(): 'blob' | 'file' {
  if (blobConfigured()) return 'blob'
  if (process.env.VERCEL === '1') {
    throw new Error(`Shared inventory needs Vercel Blob. ${blobSetupHint()}`)
  }
  return 'file'
}

async function withBlobErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Vercel Blob read/write failed (${message}). Check the store is connected and BLOB_ACCESS matches the store type (private/public). ${blobSetupHint()}`,
    )
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

  if (storageMode() === 'blob') {
    await withBlobErrors(async () => {
      await writeBlob(lab)
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

  if (storageMode() === 'blob') {
    await withBlobErrors(async () => {
      await writeBlob(lab)
    })
  } else {
    await writeLocal(lab)
  }

  return lab
}
