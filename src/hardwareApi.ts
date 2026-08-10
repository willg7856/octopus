import type { HardwareLabState } from './hardwareData'

export type SharedHardwareLab = HardwareLabState & {
  revision: number
  updatedAt: string
  updatedBy: string
}

export type LabApiError = {
  ok: false
  error: string
  status: number
  authRequired?: boolean
}

async function parseJson(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function asShared(lab: SharedHardwareLab | null | undefined): SharedHardwareLab | null {
  if (!lab || typeof lab !== 'object') return null
  if (
    !Array.isArray(lab.units) ||
    !Array.isArray(lab.progress) ||
    !Array.isArray(lab.tests)
  ) {
    return null
  }
  return {
    revision: Number(lab.revision) || 1,
    updatedAt: lab.updatedAt || new Date().toISOString(),
    updatedBy: lab.updatedBy || 'unknown',
    units: lab.units,
    progress: lab.progress,
    tests: lab.tests,
    processes: Array.isArray(lab.processes) ? lab.processes : [],
  }
}

function authError(data: { error?: string } | null): LabApiError {
  return {
    ok: false,
    error: data?.error || 'Sign in required',
    status: 401,
    authRequired: true,
  }
}

export async function fetchSharedHardwareLab(): Promise<
  | { ok: true; lab: SharedHardwareLab; storage: string }
  | LabApiError
> {
  try {
    const res = await fetch('/api/hardware/lab', { credentials: 'include' })
    const data = await parseJson(res)
    if (res.status === 401) return authError(data)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || 'Could not load shared lab',
        status: res.status,
      }
    }
    const lab = asShared(data?.lab)
    if (!lab) {
      return { ok: false, error: 'Shared lab response was empty', status: 500 }
    }
    return { ok: true, lab, storage: data?.storage || 'redis' }
  } catch {
    return { ok: false, error: 'Could not reach shared lab API', status: 0 }
  }
}

export async function saveSharedHardwareLab(
  lab: HardwareLabState,
  revision: number,
): Promise<
  | { ok: true; lab: SharedHardwareLab }
  | { ok: false; conflict: true; lab: SharedHardwareLab }
  | { ok: false; conflict?: false; error: string; authRequired?: boolean; status?: number }
> {
  try {
    const res = await fetch('/api/hardware/lab', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, lab }),
    })
    const data = await parseJson(res)
    const shared = asShared(data?.lab)

    if (res.status === 401) {
      return { ok: false, error: data?.error || 'Sign in required', authRequired: true, status: 401 }
    }
    if (res.status === 409 && shared) {
      return { ok: false, conflict: true, lab: shared }
    }
    if (!res.ok || !shared) {
      return { ok: false, error: data?.error || 'Could not save shared lab' }
    }
    return { ok: true, lab: shared }
  } catch {
    return { ok: false, error: 'Could not reach shared lab API' }
  }
}

export async function resetSharedHardwareLab(): Promise<
  | { ok: true; lab: SharedHardwareLab }
  | { ok: false; error: string; authRequired?: boolean }
> {
  try {
    const res = await fetch('/api/hardware/lab', {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await parseJson(res)
    if (res.status === 401) {
      return { ok: false, error: data?.error || 'Sign in required', authRequired: true }
    }
    const shared = asShared(data?.lab)
    if (!res.ok || !shared) {
      return { ok: false, error: data?.error || 'Could not reset shared lab' }
    }
    return { ok: true, lab: shared }
  } catch {
    return { ok: false, error: 'Could not reach shared lab API' }
  }
}
