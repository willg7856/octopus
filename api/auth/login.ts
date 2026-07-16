import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  checkCredentials,
  displayName,
  MAX_AGE_SEC,
  sessionCookie,
  signSession,
} from '../_lib/session'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' })
    return
  }

  if (!checkCredentials(email, password)) {
    res.status(401).json({ error: 'Invalid email or password' })
    return
  }

  const session = {
    email,
    name: displayName(email),
    exp: Date.now() + MAX_AGE_SEC * 1000,
  }

  res.setHeader('Set-Cookie', sessionCookie(signSession(session)))
  res.status(200).json({ user: { email: session.email, name: session.name } })
}
