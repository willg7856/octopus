import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getDb } from './db.js'
import { HttpError, type Req, type Res } from './http.js'

const COOKIE = 'octopus_sid'
export const MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30 days

export interface User {
  email: string
  name: string
  role: 'admin' | 'member'
}

const isProd = () => process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (s) return s
  if (isProd()) throw new HttpError(503, 'AUTH_SECRET is not set on the server.')
  return 'octopus-dev-secret'
}

/** Shared bootstrap password (OPS_PASSWORD). Used until a person sets their own. */
function sharedPassword(): string | undefined {
  return process.env.OPS_PASSWORD || (isProd() ? undefined : 'octopus')
}

/** Emails that are always admins and can always sign in with the shared password. */
export function bootstrapAdmins(): string[] {
  return (process.env.OPS_ADMINS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

function verifyHash(password: string, encoded: string): boolean {
  const [scheme, salt, hash] = encoded.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), expected.length, {
    N: 16384,
    r: 8,
    p: 1,
  })
  return timingSafeEqual(expected, actual)
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

interface UserRow {
  email: string
  name: string | null
  role: string
  password_hash: string | null
  disabled: boolean
}

/** Checks credentials. Returns the user, or throws a 401 with a human message. */
export async function authenticate(emailRaw: string, password: string): Promise<User> {
  const email = emailRaw.trim().toLowerCase()
  if (!email || !password) throw new HttpError(400, 'Enter your email and password.')
  const db = await getDb()
  const [row] = await db.query<UserRow>('select * from users where email = $1', [email])
  const admins = bootstrapAdmins()
  const shared = sharedPassword()

  if (row) {
    if (row.disabled) throw new HttpError(401, 'This account has been disabled. Ask an admin.')
    const ok = row.password_hash
      ? verifyHash(password, row.password_hash)
      : !!shared && safeEqual(password, shared)
    if (!ok) throw new HttpError(401, 'Wrong email or password.')
    await db.query('update users set last_login_at = now() where email = $1', [email])
    return {
      email,
      name: row.name || nameFromEmail(email),
      role: admins.includes(email) ? 'admin' : (row.role as User['role']),
    }
  }

  // Not in the team list. Bootstrap admins (and, in local dev, anyone while the team is empty)
  // can sign in with the shared password, which creates their account.
  const [{ count }] = await db.query<{ count: number }>('select count(*)::int as count from users')
  const allowed = admins.includes(email) || (!isProd() && count === 0)
  if (!allowed || !shared || !safeEqual(password, shared)) {
    throw new HttpError(401, 'Wrong email or password, or you are not on the team list yet.')
  }
  await db.query(
    `insert into users (email, name, role, last_login_at) values ($1, $2, 'admin', now())
     on conflict (email) do nothing`,
    [email, nameFromEmail(email)],
  )
  return { email, name: nameFromEmail(email), role: 'admin' }
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function setSession(res: Res, user: User) {
  const payload = Buffer.from(
    JSON.stringify({ e: user.email, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC }),
  ).toString('base64url')
  const token = `${payload}.${sign(payload)}`
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${isProd() ? '; Secure' : ''}`,
  )
}

export function clearSession(res: Res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd() ? '; Secure' : ''}`,
  )
}

function readCookie(req: Req): string | undefined {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=')
  }
  return undefined
}

/** Returns the signed-in user (re-checked against the team list), or throws 401. */
export async function requireUser(req: Req): Promise<User> {
  const token = readCookie(req)
  if (!token) throw new HttpError(401, 'Not signed in')
  const [payload, sig] = token.split('.')
  if (!payload || !sig || !safeEqual(sig, sign(payload))) throw new HttpError(401, 'Not signed in')
  let data: { e: string; exp: number }
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    throw new HttpError(401, 'Not signed in')
  }
  if (!data.e || data.exp < Date.now() / 1000) throw new HttpError(401, 'Session expired')
  const db = await getDb()
  const [row] = await db.query<UserRow>('select * from users where email = $1', [data.e])
  if (!row || row.disabled) throw new HttpError(401, 'Your access has been removed')
  return {
    email: row.email,
    name: row.name || nameFromEmail(row.email),
    role: bootstrapAdmins().includes(row.email) ? 'admin' : (row.role as User['role']),
  }
}

export async function requireAdmin(req: Req): Promise<User> {
  const user = await requireUser(req)
  if (user.role !== 'admin') throw new HttpError(403, 'Admins only')
  return user
}
