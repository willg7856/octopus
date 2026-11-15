import {
  bootstrapAdmins,
  hashPassword,
  nameFromEmail,
  requireAdmin,
  requireUser,
} from './_lib/auth.js'
import { getDb } from './_lib/db.js'
import { body, HttpError, q, route } from './_lib/http.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface UserRow {
  email: string
  name: string | null
  role: string
  password_hash: string | null
  disabled: boolean
  created_at: string
  last_login_at: string | null
}

const shape = (r: UserRow) => ({
  email: r.email,
  name: r.name || nameFromEmail(r.email),
  role: bootstrapAdmins().includes(r.email) ? 'admin' : r.role,
  hasPassword: !!r.password_hash,
  disabled: r.disabled,
  locked: bootstrapAdmins().includes(r.email),
  createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
})

/**
 * GET    /api/users                                        → team list (any teammate)
 * POST   /api/users {email,name,role,password?}            → add teammate (admin)
 * PATCH  /api/users {email,name?,role?,disabled?,password?} → update teammate (admin)
 * DELETE /api/users?email=…                                → remove teammate (admin)
 */
export default route({
  async GET(req, res) {
    await requireUser(req)
    const db = await getDb()
    const rows = await db.query<UserRow>('select * from users order by lower(coalesce(name, email))')
    res.status(200).json({ users: rows.map(shape) })
  },

  async POST(req, res) {
    await requireAdmin(req)
    const b = body<{ email?: string; name?: string; role?: string; password?: string }>(req)
    const email = String(b.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email.')
    if (b.password && b.password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters.')
    }
    const db = await getDb()
    const rows = await db.query<UserRow>(
      `insert into users (email, name, role, password_hash) values ($1, $2, $3, $4)
       on conflict (email) do nothing returning *`,
      [
        email,
        b.name?.trim() || nameFromEmail(email),
        b.role === 'admin' ? 'admin' : 'member',
        b.password ? hashPassword(b.password) : null,
      ],
    )
    if (!rows[0]) throw new HttpError(409, `${email} is already on the team.`)
    res.status(200).json({ user: shape(rows[0]) })
  },

  async PATCH(req, res) {
    const admin = await requireAdmin(req)
    const b = body<{
      email?: string
      name?: string
      role?: string
      disabled?: boolean
      password?: string | null
    }>(req)
    const email = String(b.email ?? '').trim().toLowerCase()
    if (email === admin.email && (b.disabled || b.role === 'member')) {
      throw new HttpError(400, "You can't remove your own admin access.")
    }
    if (b.password && b.password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters.')
    }
    const sets: string[] = []
    const params: unknown[] = [email]
    const set = (col: string, v: unknown) => {
      params.push(v)
      sets.push(`${col} = $${params.length}`)
    }
    if (typeof b.name === 'string') set('name', b.name.trim() || null)
    if (b.role === 'admin' || b.role === 'member') set('role', b.role)
    if (typeof b.disabled === 'boolean') set('disabled', b.disabled)
    if (b.password === null) set('password_hash', null)
    else if (typeof b.password === 'string') set('password_hash', hashPassword(b.password))
    if (!sets.length) throw new HttpError(400, 'Nothing to change')
    const db = await getDb()
    const rows = await db.query<UserRow>(
      `update users set ${sets.join(', ')} where email = $1 returning *`,
      params,
    )
    if (!rows[0]) throw new HttpError(404, 'No such teammate')
    res.status(200).json({ user: shape(rows[0]) })
  },

  async DELETE(req, res) {
    const admin = await requireAdmin(req)
    const email = String(q(req, 'email') ?? '').toLowerCase()
    if (email === admin.email) throw new HttpError(400, "You can't remove yourself.")
    if (bootstrapAdmins().includes(email)) {
      throw new HttpError(400, 'This admin is set in OPS_ADMINS on the server — remove them there.')
    }
    const db = await getDb()
    await db.query('delete from users where email = $1', [email])
    res.status(200).json({ ok: true })
  },
})
