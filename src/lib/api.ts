import type { HistoryEntry, Op, Rec, TeamMember, User } from './types'

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.body = body
  }
  get isConflict() {
    return this.status === 409
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, 'Can’t reach Octopus. Check your connection — nothing was saved.')
  }
  let body: Record<string, unknown> = {}
  try {
    body = await res.json()
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    throw new ApiError(res.status, String(body.error ?? `Request failed (${res.status})`), body)
  }
  return body as T
}

const json = (b: unknown) => JSON.stringify(b)

export const api = {
  me: () => call<{ user: User }>('/api/auth/me'),
  login: (email: string, password: string) =>
    call<{ user: User }>('/api/auth/login', { method: 'POST', body: json({ email, password }) }),
  logout: () => call('/api/auth/logout', { method: 'POST', body: '{}' }),
  changePassword: (current: string, next: string) =>
    call('/api/auth/password', { method: 'POST', body: json({ current, next }) }),

  records: (since?: number) =>
    call<{ records: Rec[]; rev: number }>(`/api/records${since != null ? `?since=${since}` : ''}`),
  apply: (ops: Op[]) =>
    call<{ records: Rec[] }>('/api/records', { method: 'POST', body: json({ ops }) }),

  history: (params: { record?: string; deleted?: boolean; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.record) qs.set('record', params.record)
    if (params.deleted) qs.set('deleted', '1')
    if (params.limit) qs.set('limit', String(params.limit))
    return call<{ entries: HistoryEntry[] }>(`/api/history?${qs}`)
  },

  users: () => call<{ users: TeamMember[] }>('/api/users'),
  addUser: (u: { email: string; name?: string; role: string; password?: string }) =>
    call<{ user: TeamMember }>('/api/users', { method: 'POST', body: json(u) }),
  updateUser: (u: { email: string; name?: string; role?: string; disabled?: boolean; password?: string | null }) =>
    call<{ user: TeamMember }>('/api/users', { method: 'PATCH', body: json(u) }),
  removeUser: (email: string) =>
    call(`/api/users?email=${encodeURIComponent(email)}`, { method: 'DELETE' }),
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
}
