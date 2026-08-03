import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readCookie, verifySession } from '../_lib/session.js'
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

  const session = verifySession(readCookie(req))
  if (!session) {
    res.status(401).json({ error: 'Sign in required' })
    return
  }

  const mode = storageMode()

  res.status(200).json({
    mode,
    hint: mode === 'blob' ? null : storageSetupHint(),
    env: storageEnvFlags(),
  })
}
