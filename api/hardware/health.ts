import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from '../_lib/session.js'
import {
  storageEnvFlags,
  storageMode,
  storageSetupHint,
} from '../_lib/hardwareStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = await requireUser(req, res)
  if (!session) return

  const mode = storageMode()

  res.status(200).json({
    mode,
    hint: mode === 'redis' ? null : storageSetupHint(),
    env: storageEnvFlags(),
  })
}
