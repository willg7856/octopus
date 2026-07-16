export type AuthUser = {
  email: string
  name: string
}

const LOCAL_KEY = 'octopus-local-session'

async function parseJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function localFallbackEnabled() {
  return import.meta.env.DEV
}

function localPassword() {
  return import.meta.env.VITE_OPS_PASSWORD || 'goods-shed'
}

export async function fetchSession(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (res.ok) {
      const data = await parseJson(res)
      return data?.user ?? null
    }
  } catch {
    /* fall through for local */
  }

  if (!localFallbackEnabled()) return null
  try {
    const raw = sessionStorage.getItem(LOCAL_KEY)
    if (!raw) return null
    const user = JSON.parse(raw) as AuthUser
    return user?.email ? user : null
  } catch {
    return null
  }
}

export async function login(
  email: string,
  password: string,
): Promise<{ user?: AuthUser; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await parseJson(res)
    if (res.ok && data?.user) return { user: data.user }
    if (res.status !== 404) {
      return { error: data?.error || 'Sign in failed' }
    }
  } catch {
    /* local fallback below */
  }

  if (localFallbackEnabled()) {
    if (password !== localPassword()) {
      return { error: 'Invalid email or password' }
    }
    const name = email
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    const user = { email: email.trim().toLowerCase(), name }
    sessionStorage.setItem(LOCAL_KEY, JSON.stringify(user))
    return { user }
  }

  return { error: 'Sign in unavailable' }
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(LOCAL_KEY)
  } catch {
    /* ignore */
  }
}
