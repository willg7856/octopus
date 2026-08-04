import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  canManageAccounts,
  envAllowlist,
  isEnvLockedEmail,
  loadAccessList,
  saveAccessList,
} from '../_lib/accessStore.js'
import { readCookie, verifySession } from '../_lib/session.js'

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
      const access = await loadAccessList()
      const envUsers = envAllowlist()
      const shared = access.users
      const canManage = canManageAccounts(session.email)
      res.status(200).json({
        canManage,
        envUsers,
        sharedUsers: shared,
        users: [...new Set([...envUsers, ...shared])].sort((a, b) =>
          a.localeCompare(b),
        ),
        updatedAt: access.updatedAt,
        updatedBy: access.updatedBy,
        openAccess: envUsers.length === 0 && shared.length === 0,
      })
      return
    }

    if (req.method === 'POST') {
      if (!canManageAccounts(session.email)) {
        res.status(403).json({ error: 'Admin access required to add accounts' })
        return
      }
      const email = normalizeEmail(String(req.body?.email || ''))
      if (!email || !isValidEmail(email)) {
        res.status(400).json({ error: 'Valid email required' })
        return
      }
      if (isEnvLockedEmail(email)) {
        res.status(200).json({
          ok: true,
          already: true,
          message: 'That email is already allowed via OPS_USERS',
          ...(await snapshot()),
        })
        return
      }
      const access = await loadAccessList()
      if (access.users.includes(email)) {
        res.status(200).json({
          ok: true,
          already: true,
          message: 'That email is already on the shared list',
          ...(await snapshot()),
        })
        return
      }
      await saveAccessList([...access.users, email], session.name || session.email)
      res.status(200).json({
        ok: true,
        added: email,
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

    res.setHeader('Allow', 'GET, POST, DELETE')
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
    updatedAt: access.updatedAt,
    updatedBy: access.updatedBy,
    openAccess: envUsers.length === 0 && shared.length === 0,
  }
}
