import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readCookie, verifySession } from '../_lib/session.js'
import { redisSetupHint, storageMode } from '../_lib/hardwareStore.js'

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

  const hasUpstashUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim())
  const hasUpstashToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim())
  const hasKvUrl = Boolean(process.env.KV_REST_API_URL?.trim())
  const hasKvToken = Boolean(process.env.KV_REST_API_TOKEN?.trim())

  let mode: 'redis' | 'file' | 'error' = 'error'
  let error: string | null = null
  try {
    mode = storageMode()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  res.status(200).json({
    mode,
    error,
    hint: error ? redisSetupHint() : null,
    env: {
      UPSTASH_REDIS_REST_URL: hasUpstashUrl,
      UPSTASH_REDIS_REST_TOKEN: hasUpstashToken,
      KV_REST_API_URL: hasKvUrl,
      KV_REST_API_TOKEN: hasKvToken,
      VERCEL: process.env.VERCEL === '1',
    },
  })
}
