import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readCookie, verifySession } from '../_lib/session.js'
import {
  storageEnvFlags,
  storageMode,
  storageSetupHint,
} from '../_lib/hardwareStore.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const session = verifySession(readCookie(req))
  if (!session) {
    res.status(401).json({ error: 'Sign in required' })
    return
  }

  let mode: ReturnType<typeof storageMode> | 'error' = 'error'
  let error: string | null = null
  try {
    mode = storageMode()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  res.status(200).json({
    mode,
    error,
    hint: error ? storageSetupHint() : null,
    env: storageEnvFlags(),
  })
}
