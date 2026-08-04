import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  effectiveAllowlist,
  getPasswordHashForEmail,
} from './accessStore.js'
import { readEnv } from './env.js'

const COOKIE = 'octopus_session'
const MAX_AGE_SEC = 60 * 60 * 24 * 7 // 7 days

export type SessionPayload = {
  email: string
  name: string
  exp: number
}

function secret() {
  return readEnv('AUTH_SECRET') || readEnv('OPS_PASSWORD') || 'dev-octopus-secret'
}

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromB64url(input: string) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, 'base64').toString('utf8')
}

function passwordsMatch(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) {
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const N = 16384
  const r = 8
  const p = 1
  const hash = scryptSync(password, salt, 32, { N, r, p })
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4], 'base64url')
    expected = Buffer.from(parts[5], 'base64url')
  } catch {
    return false
  }
  const hash = scryptSync(password, salt, expected.length, { N, r, p })
  if (hash.length !== expected.length) return false
  return timingSafeEqual(hash, expected)
}

export function signSession(payload: SessionPayload) {
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret()).update(body).digest('base64url')
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  try {
    const payload = JSON.parse(fromB64url(body)) as SessionPayload
    if (!payload?.email || !payload?.exp || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export function readCookie(req: { headers?: { cookie?: string } }, name = COOKIE) {
  const raw = req.headers?.cookie || ''
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export function sessionCookie(token: string) {
  const secure = readEnv('NODE_ENV') === 'production' || readEnv('VERCEL') === '1'
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie() {
  const secure = readEnv('NODE_ENV') === 'production' || readEnv('VERCEL') === '1'
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}

export async function checkCredentials(email: string, password: string) {
  const normalized = email.trim().toLowerCase()
  const personalHash = await getPasswordHashForEmail(normalized)
  if (personalHash) {
    if (!verifyPassword(password, personalHash)) return false
  } else {
    const expected = readEnv('OPS_PASSWORD') || 'goods-shed'
    if (!passwordsMatch(password, expected)) return false
  }

  const allowed = await effectiveAllowlist()
  if (allowed.length === 0) return true
  return allowed.includes(normalized)
}

export function displayName(email: string) {
  const local = email.split('@')[0] || 'operator'
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export { COOKIE, MAX_AGE_SEC }
