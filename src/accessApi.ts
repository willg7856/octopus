export type AccessSnapshot = {
  canManage: boolean
  envUsers: string[]
  sharedUsers: string[]
  users: string[]
  updatedAt: string | null
  updatedBy: string | null
  openAccess: boolean
}

async function parseJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function asSnapshot(data: Partial<AccessSnapshot> | null | undefined): AccessSnapshot {
  return {
    canManage: Boolean(data?.canManage),
    envUsers: Array.isArray(data?.envUsers) ? data.envUsers : [],
    sharedUsers: Array.isArray(data?.sharedUsers) ? data.sharedUsers : [],
    users: Array.isArray(data?.users) ? data.users : [],
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
    updatedBy: typeof data?.updatedBy === 'string' ? data.updatedBy : null,
    openAccess: Boolean(data?.openAccess),
  }
}

export async function fetchAccessList(): Promise<
  | { ok: true; access: AccessSnapshot }
  | { ok: false; error: string; status: number }
> {
  try {
    const res = await fetch('/api/auth/users', { credentials: 'include' })
    const data = await parseJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || 'Could not load accounts',
        status: res.status,
      }
    }
    return { ok: true, access: asSnapshot(data) }
  } catch {
    return { ok: false, error: 'Could not reach accounts API', status: 0 }
  }
}

export async function addAccessUser(email: string): Promise<
  | { ok: true; access: AccessSnapshot; message?: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await parseJson(res)
    if (!res.ok) {
      return { ok: false, error: data?.error || 'Could not add account' }
    }
    return {
      ok: true,
      access: asSnapshot(data),
      message: data?.message,
    }
  } catch {
    return { ok: false, error: 'Could not reach accounts API' }
  }
}

export async function removeAccessUser(email: string): Promise<
  | { ok: true; access: AccessSnapshot }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/auth/users', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await parseJson(res)
    if (!res.ok) {
      return { ok: false, error: data?.error || 'Could not remove account' }
    }
    return { ok: true, access: asSnapshot(data) }
  } catch {
    return { ok: false, error: 'Could not reach accounts API' }
  }
}
