import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  canManageAccounts,
  clearUserPassword,
  emailsWithPersonalPassword,
  envAllowlist,
  isEnvLockedEmail,
  loadAccessList,
  saveAccessList,
  setUserPassword,
} from '../_lib/accessStore.js'
import {
  hashPassword,
  readCookie,
  verifySession,
} from '../_lib/session.js'

const MIN_PASSWORD_LENGTH = 6

function requireUser(req: VercelRequest, res: VercelResponse) {
  const session = verifySession(readCookie(req))
  if (!session) {
    res.status(401).json({ error: 'Sign in required' })
    return null
  }
  return session
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = requireUser(req, res)
  if (!session) return

  try {
    if (req.method === 'GET') {
      if (!canManageAccounts(session.email)) {
        res.status(403).json({ error: 'Admin access required' })
        return
      }
      res.status(200).json({
        canManage: true,
        ...(await snapshot()),
      })
      return
    }

    if (req.method === 'POST') {
      if (!canManageAccounts(session.email)) {
        res.status(403).json({ error: 'Admin access required to add accounts' })
        return
      }
      const email = normalizeEmail(String(req.body?.email || ''))
      const password =
        req.body?.password == null ? '' : String(req.body.password)
      if (!email || !isValidEmail(email)) {
        res.status(400).json({ error: 'Valid email required' })
        return
      }
      if (password && password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        })
        return
      }
      if (isEnvLockedEmail(email)) {
        if (password) {
          await setUserPassword(
            email,
            hashPassword(password),
            session.name || session.email,
          )
          res.status(200).json({
            ok: true,
            already: true,
            message: 'OPS_USERS email — personal password updated',
            ...(await snapshot()),
          })
          return
        }
        res.status(200).json({
          ok: true,
          already: true,
          message: 'That email is already allowed via OPS_USERS',
          ...(await snapshot()),
        })
        return
      }
      const access = await loadAccessList()
      if (!access.users.includes(email)) {
        await saveAccessList(
          [...access.users, email],
          session.name || session.email,
        )
      }
      if (password) {
        await setUserPassword(
          email,
          hashPassword(password),
          session.name || session.email,
        )
      }
      res.status(200).json({
        ok: true,
        added: email,
        message: password
          ? `Added ${email} with a personal password`
          : undefined,
        ...(await snapshot()),
      })
      return
    }

    if (req.method === 'PATCH') {
      if (!canManageAccounts(session.email)) {
        res.status(403).json({ error: 'Admin access required to change passwords' })
        return
      }
      const email = normalizeEmail(String(req.body?.email || ''))
      if (!email || !isValidEmail(email)) {
        res.status(400).json({ error: 'Valid email required' })
        return
      }

      const allowed = await snapshot()
      if (!allowed.users.includes(email)) {
        res.status(400).json({
          error: 'Add this email to the allowlist before setting a password',
        })
        return
      }

      if (req.body?.clearPassword === true) {
        await clearUserPassword(email, session.name || session.email)
        res.status(200).json({
          ok: true,
          cleared: email,
          message: `${email} now uses the shared team password`,
          ...(await snapshot()),
        })
        return
      }

      const password = String(req.body?.password || '')
      if (password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        })
        return
      }
      await setUserPassword(
        email,
        hashPassword(password),
        session.name || session.email,
      )
      res.status(200).json({
        ok: true,
        updated: email,
        message: `Password set for ${email}`,
        ...(await snapshot()),
      })
      return
    }

    if (req.method === 'DELETE') {
      if (!canManageAccounts(session.email)) {
        res.status(403).json({ error: 'Admin access required to remove accounts' })
        return
      }
      const email = normalizeEmail(String(req.body?.email || req.query?.email || ''))
      if (!email) {
        res.status(400).json({ error: 'Email required' })
        return
      }
      if (isEnvLockedEmail(email)) {
        res.status(400).json({
          error:
            'That email is locked in OPS_USERS env — remove it from Vercel env to revoke',
        })
        return
      }
      const access = await loadAccessList()
      await saveAccessList(
        access.users.filter((u) => u !== email),
        session.name || session.email,
      )
      res.status(200).json({
        ok: true,
        removed: email,
        ...(await snapshot()),
      })
      return
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('auth users API failed', error)
    const message = error instanceof Error ? error.message : 'Account list failed'
    res.status(500).json({ error: message })
  }
}

async function snapshot() {
  const access = await loadAccessList()
  const envUsers = envAllowlist()
  const shared = access.users
  return {
    envUsers,
    sharedUsers: shared,
    users: [...new Set([...envUsers, ...shared])].sort((a, b) =>
      a.localeCompare(b),
    ),
    passwordSet: emailsWithPersonalPassword(access),
    updatedAt: access.updatedAt,
    updatedBy: access.updatedBy,
    openAccess: envUsers.length === 0 && shared.length === 0,
  }
}
