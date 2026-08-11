import type { VercelRequest, VercelResponse } from '@vercel/node'
import { canManageAccounts } from '../_lib/accessStore.js'
import { requireUser } from '../_lib/session.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = await requireUser(req, res)
  if (!session) {
    // requireUser already sent 401 with { error }; keep me shape for the client
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
