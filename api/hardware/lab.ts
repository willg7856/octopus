import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readCookie, verifySession } from '../_lib/session.js'
import {
  loadSharedLab,
  resetSharedLab,
  saveSharedLab,
  storageMode,
  type HardwareLabState,
} from '../_lib/hardwareStore.js'

function requireUser(req: VercelRequest, res: VercelResponse) {
  const session = verifySession(readCookie(req))
  if (!session) {
    res.status(401).json({ error: 'Sign in required' })
    return null
  }
  return session
}

function isLabState(value: unknown): value is HardwareLabState {
  if (!value || typeof value !== 'object') return false
  const lab = value as HardwareLabState
  return (
    Array.isArray(lab.units) &&
    Array.isArray(lab.progress) &&
    Array.isArray(lab.tests) &&
    Array.isArray(lab.processes)
  )
}

function canAdminReset(email: string | undefined): boolean {
  if (!email) return false
  const admins = (process.env.OPS_ADMINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return admins.includes(email.trim().toLowerCase())
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireUser(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const lab = await loadSharedLab()
      res.status(200).json({
        lab,
        storage: storageMode(),
      })
      return
    }

    if (req.method === 'PUT') {
      const body = req.body ?? {}
      const expectedRevision = Number(body.revision)
      if (!Number.isFinite(expectedRevision)) {
        res.status(400).json({ error: 'revision is required' })
        return
      }
      if (!isLabState(body.lab)) {
        res.status(400).json({ error: 'lab payload is required' })
        return
      }

      const result = await saveSharedLab(
        body.lab,
        expectedRevision,
        user.name || user.email,
      )
      if (!result.ok) {
        res.status(409).json({
          error: 'Inventory was updated by someone else. Reloaded latest.',
          lab: result.lab,
          storage: storageMode(),
        })
        return
      }

      res.status(200).json({ lab: result.lab, storage: storageMode() })
      return
    }

    if (req.method === 'DELETE') {
      // Destructive seed reset — admins only (OPS_ADMINS). Prefer PUT for normal edits.
      if (!canAdminReset(user.email)) {
        res.status(403).json({ error: 'Admin access required to reset shared lab' })
        return
      }
      const lab = await resetSharedLab(user.name || user.email)
      res.status(200).json({ lab, storage: storageMode() })
      return
    }

    res.setHeader('Allow', 'GET, PUT, DELETE')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('hardware lab API failed', error)
    const message = error instanceof Error ? error.message : 'Shared inventory failed'
    res.status(500).json({ error: message })
  }
}
