import type { HardwareLabState } from './hardwareData'

export type SharedHardwareLab = HardwareLabState & {
  revision: number
  updatedAt: string
  updatedBy: string
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

export async function fetchSharedHardwareLab(): Promise<
  | { ok: true; lab: SharedHardwareLab; storage: string }
  | { ok: false; error: string; status: number }
> {
  try {
    const res = await fetch('/api/hardware/lab', { credentials: 'include' })
    const data = await parseJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || 'Could not load shared inventory',
        status: res.status,
      }
    }
    const lab = asShared(data?.lab)
    if (!lab) {
      return { ok: false, error: 'Shared inventory response was empty', status: 500 }
    }
    return { ok: true, lab, storage: data?.storage || 'redis' }
  } catch {
    return { ok: false, error: 'Could not reach inventory API', status: 0 }
  }
}

export async function saveSharedHardwareLab(
  lab: HardwareLabState,
  revision: number,
): Promise<
  | { ok: true; lab: SharedHardwareLab }
  | { ok: false; conflict: true; lab: SharedHardwareLab }
  | { ok: false; conflict?: false; error: string }
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

    if (res.status === 409 && shared) {
      return { ok: false, conflict: true, lab: shared }
    }
    if (!res.ok || !shared) {
      return { ok: false, error: data?.error || 'Could not save inventory' }
    }
    return { ok: true, lab: shared }
  } catch {
    return { ok: false, error: 'Could not reach inventory API' }
  }
}

export async function resetSharedHardwareLab(): Promise<
  | { ok: true; lab: SharedHardwareLab }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/hardware/lab', {
      method: 'DELETE',
      credentials: 'include',
    })
    const data = await parseJson(res)
    const shared = asShared(data?.lab)
    if (!res.ok || !shared) {
      return { ok: false, error: data?.error || 'Could not reset inventory' }
    }
    return { ok: true, lab: shared }
  } catch {
    return { ok: false, error: 'Could not reach inventory API' }
  }
}
