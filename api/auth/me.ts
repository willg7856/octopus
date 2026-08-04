import type { VercelRequest, VercelResponse } from '@vercel/node'
import { canManageAccounts } from '../_lib/accessStore.js'
import { readCookie, verifySession } from '../_lib/session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = verifySession(readCookie(req))
  if (!session) {
    res.status(401).json({ user: null })
    return
  }

  res.status(200).json({
    user: {
      email: session.email,
      name: session.name,
      canManageAccounts: canManageAccounts(session.email),
    },
  })
}
