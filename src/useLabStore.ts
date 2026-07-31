import { useEffect, useState } from 'react'
import {
  fetchSharedHardwareLab,
  resetSharedHardwareLab,
  saveSharedHardwareLab,
  type SharedHardwareLab,
} from './hardwareApi'
import {
  loadHardwareLab,
  resetHardwareLab,
  saveHardwareLab,
  type HardwareLabState,
} from './hardwareData'

export type LabSyncState = 'loading' | 'shared' | 'local' | 'error'

function toLabState(shared: SharedHardwareLab): HardwareLabState {
  return {
    units: shared.units,
    progress: shared.progress,
    tests: shared.tests,
    processes: shared.processes,
  }
}

export function useLabStore() {
  const [lab, setLab] = useState<HardwareLabState>(() => ({
    units: [],
    progress: [],
    tests: [],
    processes: [],
  }))
  const [revision, setRevision] = useState(1)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [sync, setSync] = useState<LabSyncState>('loading')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2400)
  }

  function applyShared(shared: SharedHardwareLab) {
    setLab(toLabState(shared))
    setRevision(shared.revision)
    setUpdatedAt(shared.updatedAt)
    setUpdatedBy(shared.updatedBy)
    setSync('shared')
    setSyncError(null)
  }

  async function refresh(opts?: { quiet?: boolean }) {
    const result = await fetchSharedHardwareLab()
    if (result.ok) {
      applyShared(result.lab)
      if (!opts?.quiet) flash('Team lab loaded')
      return
    }

    if (import.meta.env.DEV && (result.status === 0 || result.status === 404)) {
      setLab(loadHardwareLab())
      setSync('local')
      setSyncError(null)
      return
    }

    setSync('error')
    setSyncError(result.error)
  }

  useEffect(() => {
    void refresh({ quiet: true })
  }, [])

  async function commit(next: HardwareLabState, message: string) {
    if (sync === 'local') {
      saveHardwareLab(next)
      setLab(next)
      flash(message)
      return true
    }

    setSaving(true)
    const result = await saveSharedHardwareLab(next, revision)
    setSaving(false)

    if ('conflict' in result && result.conflict) {
      applyShared(result.lab)
      flash('Someone else saved first — refreshed. Re-apply your change.')
      return false
    }

    if (!result.ok) {
      flash(result.error)
      return false
    }

    applyShared(result.lab)
    flash(message)
    return true
  }

  async function reset() {
    const sharedWarning =
      sync === 'shared'
        ? 'Reset the shared team lab to seed data? This affects everyone.'
        : 'Reset lab to seed data? Browser-only edits will be cleared.'
    if (!window.confirm(sharedWarning)) return

    if (sync === 'local') {
      const next = resetHardwareLab()
      setLab(next)
      flash('Reset to seed data')
      return
    }

    setSaving(true)
    const result = await resetSharedHardwareLab()
    setSaving(false)
    if (!result.ok) {
      flash(result.error)
      return
    }
    applyShared(result.lab)
    flash('Shared lab reset to seed')
  }

  return {
    lab,
    revision,
    updatedAt,
    updatedBy,
    sync,
    syncError,
    saving,
    toast,
    refresh,
    commit,
    reset,
  }
}
