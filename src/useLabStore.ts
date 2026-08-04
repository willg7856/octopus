import { useEffect, useRef, useState } from 'react'
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

export type LabUpdater =
  | HardwareLabState
  | ((prev: HardwareLabState) => HardwareLabState)

function toLabState(shared: SharedHardwareLab): HardwareLabState {
  return {
    units: shared.units,
    progress: shared.progress,
    tests: shared.tests,
    processes: shared.processes,
  }
}

export function formatUpdatedLabel(updatedAt: string | null, updatedBy: string | null) {
  if (!updatedAt) return null
  const when = formatRelativeTime(updatedAt)
  if (updatedBy) return `Updated by ${updatedBy} · ${when}`
  return `Updated ${when}`
}

function formatRelativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
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
  const [conflict, setConflict] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const revisionRef = useRef(1)
  const labRef = useRef<HardwareLabState>(lab)
  const syncRef = useRef<LabSyncState>(sync)
  const commitChain = useRef(Promise.resolve(true))
  const savingRef = useRef(false)
  const pendingCount = useRef(0)

  syncRef.current = sync

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  function applyShared(shared: SharedHardwareLab) {
    const state = toLabState(shared)
    labRef.current = state
    setLab(state)
    setRevision(shared.revision)
    revisionRef.current = shared.revision
    setUpdatedAt(shared.updatedAt)
    setUpdatedBy(shared.updatedBy)
    setSync('shared')
    setSyncError(null)
  }

  async function refresh(opts?: { quiet?: boolean }) {
    if (savingRef.current) return
    const result = await fetchSharedHardwareLab()
    if (result.ok) {
      // Don't clobber a newer local revision mid-edit race
      if (result.lab.revision < revisionRef.current) return
      applyShared(result.lab)
      if (!opts?.quiet) flash('Team lab loaded')
      return
    }

    if (import.meta.env.DEV && (result.status === 0 || result.status === 404)) {
      const local = loadHardwareLab()
      labRef.current = local
      setLab(local)
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

  useEffect(() => {
    if (sync !== 'shared') return

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh({ quiet: true })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refresh({ quiet: true })
      }
    }, 20000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [sync])

  async function commit(next: LabUpdater, message: string) {
    const run = async () => {
      const resolved =
        typeof next === 'function' ? next(labRef.current) : next

      if (syncRef.current === 'local') {
        saveHardwareLab(resolved)
        labRef.current = resolved
        setLab(resolved)
        setConflict(false)
        flash(message)
        return true
      }

      pendingCount.current += 1
      savingRef.current = true
      setSaving(true)
      setConflict(false)
      const expected = revisionRef.current
      const result = await saveSharedHardwareLab(resolved, expected)
      pendingCount.current = Math.max(0, pendingCount.current - 1)
      if (pendingCount.current === 0) {
        savingRef.current = false
        setSaving(false)
      }

      if ('conflict' in result && result.conflict) {
        applyShared(result.lab)
        setConflict(true)
        flash('Someone else saved first — your edit was not applied. Re-try after reviewing.')
        return false
      }

      if (!result.ok) {
        flash(result.error)
        return false
      }

      applyShared(result.lab)
      setConflict(false)
      flash(message)
      return true
    }

    const queued = commitChain.current.then(run, run)
    commitChain.current = queued.then(
      () => true,
      () => true,
    )
    return queued
  }

  async function reset() {
    if (syncRef.current === 'local') {
      const next = resetHardwareLab()
      labRef.current = next
      setLab(next)
      flash('Reset to seed data')
      return
    }

    savingRef.current = true
    setSaving(true)
    const result = await resetSharedHardwareLab()
    savingRef.current = false
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
    conflict,
    toast,
    refresh,
    commit,
    reset,
  }
}
