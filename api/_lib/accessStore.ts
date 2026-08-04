import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Redis } from '@upstash/redis'
import { get, put } from '@vercel/blob'
import { hasEnv, readEnv } from './env.js'

export const ACCESS_REDIS_KEY = 'octopus:ops-access'
export const ACCESS_BLOB_PATHNAME = 'auth/ops-access.json'

export type OpsUserCredential = {
  /** scrypt$N$r$p$salt$hash — never send to the client. */
  passwordHash: string
  updatedAt: string
}

export type OpsAccessState = {
  revision: number
  updatedAt: string
  updatedBy: string
  /** Extra emails allowed to sign in (beyond OPS_USERS env). */
  users: string[]
  /** Per-email personal passwords (hashed). */
  passwords: Record<string, OpsUserCredential>
}

type StorageMode = 'redis' | 'blob' | 'file'
type BlobAccess = 'public' | 'private'

const LOCAL_PATH = join(process.cwd(), '.data', 'ops-access.json')
let resolvedBlobAccess: BlobAccess | null = null

function emptyAccess(updatedBy = 'system'): OpsAccessState {
  return {
    revision: 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    users: [],
    passwords: {},
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizeEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const email = normalizeEmail(item)
    if (!email || !email.includes('@') || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

function normalizePasswords(raw: unknown): Record<string, OpsUserCredential> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, OpsUserCredential> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const email = normalizeEmail(key)
    if (!email || !email.includes('@')) continue
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entry = value as Partial<OpsUserCredential>
    if (typeof entry.passwordHash !== 'string' || !entry.passwordHash) continue
    out[email] = {
      passwordHash: entry.passwordHash,
      updatedAt:
        typeof entry.updatedAt === 'string'
          ? entry.updatedAt
          : new Date().toISOString(),
    }
  }
  return out
}

function normalize(raw: Partial<OpsAccessState> | null | undefined): OpsAccessState {
  const seed = emptyAccess()
  if (!raw || typeof raw !== 'object') return seed
  return {
    revision: Number.isFinite(raw.revision) ? Number(raw.revision) : seed.revision,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : seed.updatedAt,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : seed.updatedBy,
    users: normalizeEmails(raw.users),
    passwords: normalizePasswords(raw.passwords),
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

function storageMode(): StorageMode {
  if (redisConfigured()) return 'redis'
  if (readEnv('VERCEL') === '1' || blobConfigured()) return 'blob'
  return 'file'
}

function getRedis() {
  return new Redis({
    url: redisUrl(),
    token: redisToken(),
  })
}

async function readRedis(): Promise<OpsAccessState | null> {
  const value = await getRedis().get<OpsAccessState | string>(ACCESS_REDIS_KEY)
  if (value == null) return null
  if (typeof value === 'string') {
    if (!value.trim()) return null
    return normalize(JSON.parse(value) as Partial<OpsAccessState>)
  }
  return normalize(value)
}

async function writeRedis(state: OpsAccessState) {
  await getRedis().set(ACCESS_REDIS_KEY, state)
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

async function tryGetBlob(access: BlobAccess): Promise<OpsAccessState | null | undefined> {
  try {
    const result = await get(ACCESS_BLOB_PATHNAME, {
      access,
      ...(access === 'private' ? { useCache: false as const } : {}),
    })
    resolvedBlobAccess = access
    if (!result?.stream) return null
    try {
      const raw = await streamToJson(result.stream)
      return normalize(raw as Partial<OpsAccessState>)
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

async function readBlob(): Promise<OpsAccessState | null> {
  for (const access of blobAccessCandidates()) {
    const result = await tryGetBlob(access)
    if (result === undefined) continue
    return result
  }
  return null
}

async function writeBlob(state: OpsAccessState) {
  const body = JSON.stringify(state)
  let lastError: unknown
  for (const access of blobAccessCandidates()) {
    try {
      await put(ACCESS_BLOB_PATHNAME, body, {
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

async function readLocal(): Promise<OpsAccessState | null> {
  try {
    const raw = await readFile(LOCAL_PATH, 'utf8')
    return normalize(JSON.parse(raw) as Partial<OpsAccessState>)
  } catch {
    return null
  }
}

async function writeLocal(state: OpsAccessState) {
  await mkdir(dirname(LOCAL_PATH), { recursive: true })
  await writeFile(LOCAL_PATH, JSON.stringify(state, null, 2), 'utf8')
}

export async function loadAccessList(): Promise<OpsAccessState> {
  const mode = storageMode()
  if (mode === 'redis') {
    const existing = await readRedis()
    if (existing) return existing
    const seeded = emptyAccess()
    await writeRedis(seeded)
    return seeded
  }
  if (mode === 'blob') {
    const existing = await readBlob()
    if (existing) return existing
    const seeded = emptyAccess()
    await writeBlob(seeded)
    return seeded
  }
  const existing = await readLocal()
  if (existing) return existing
  const seeded = emptyAccess()
  await writeLocal(seeded)
  return seeded
}

async function writeAccess(next: OpsAccessState) {
  const mode = storageMode()
  if (mode === 'redis') await writeRedis(next)
  else if (mode === 'blob') await writeBlob(next)
  else await writeLocal(next)
}

export async function saveAccessList(
  users: string[],
  updatedBy: string,
): Promise<OpsAccessState> {
  const current = await loadAccessList()
  const nextUsers = normalizeEmails(users)
  const env = envAllowlist()
  const passwords: Record<string, OpsUserCredential> = {}
  for (const [email, cred] of Object.entries(current.passwords || {})) {
    if (nextUsers.includes(email) || env.includes(email)) {
      passwords[email] = cred
    }
  }
  const next: OpsAccessState = {
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    users: nextUsers,
    passwords,
  }
  await writeAccess(next)
  return next
}

export async function setUserPassword(
  email: string,
  passwordHash: string,
  updatedBy: string,
): Promise<OpsAccessState> {
  const normalized = normalizeEmail(email)
  const current = await loadAccessList()
  const next: OpsAccessState = {
    ...current,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    passwords: {
      ...current.passwords,
      [normalized]: {
        passwordHash,
        updatedAt: new Date().toISOString(),
      },
    },
  }
  await writeAccess(next)
  return next
}

export async function clearUserPassword(
  email: string,
  updatedBy: string,
): Promise<OpsAccessState> {
  const normalized = normalizeEmail(email)
  const current = await loadAccessList()
  const passwords = { ...current.passwords }
  delete passwords[normalized]
  const next: OpsAccessState = {
    ...current,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy,
    passwords,
  }
  await writeAccess(next)
  return next
}

export function emailsWithPersonalPassword(access: OpsAccessState): string[] {
  return Object.keys(access.passwords || {}).sort((a, b) => a.localeCompare(b))
}

export async function getPasswordHashForEmail(
  email: string,
): Promise<string | null> {
  const access = await loadAccessList()
  const entry = access.passwords?.[normalizeEmail(email)]
  return entry?.passwordHash || null
}

/** Emails from OPS_USERS env (bootstrap / break-glass). */
export function envAllowlist(): string[] {
  return normalizeEmails(
    (readEnv('OPS_USERS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

/** Effective sign-in allowlist = env ∪ shared list. Empty = any email + password. */
export async function effectiveAllowlist(): Promise<string[]> {
  const env = envAllowlist()
  const shared = await loadAccessList()
  return normalizeEmails([...env, ...shared.users])
}

/** Always-allowed Team admins (merged with OPS_ADMINS when set). */
const BOOTSTRAP_ADMINS = [
  'willg7856@gmail.com',
  'will.grant@beyondstagezero.com',
]

export function envAdmins(): string[] {
  const fromEnv = normalizeEmails(
    (readEnv('OPS_ADMINS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  return normalizeEmails([...fromEnv, ...BOOTSTRAP_ADMINS])
}

/**
 * Who can view and manage Team accounts.
 * OPS_ADMINS env emails plus built-in bootstrap admins.
 */
export function canManageAccounts(email: string | undefined): boolean {
  if (!email) return false
  return envAdmins().includes(normalizeEmail(email))
}

export function isEnvLockedEmail(email: string) {
  return envAllowlist().includes(normalizeEmail(email))
}
