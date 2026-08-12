import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchSharedHardwareLab,
  resetSharedHardwareLab,
  saveSharedHardwareLab,
  type SharedHardwareLab,
} from './hardwareApi'
import {
  loadHardwareLab,
  normalizeHardwareLabState,
  resetHardwareLab,
  saveHardwareLab,
  type HardwareLabState,
} from './hardwareData'

export type LabSyncState = 'loading' | 'shared' | 'local' | 'error'

export type LabUpdater =
  | HardwareLabState
  | ((prev: HardwareLabState) => HardwareLabState)

export type LabStore = {
  lab: HardwareLabState
  revision: number
  updatedAt: string | null
  updatedBy: string | null
  sync: LabSyncState
  syncError: string | null
  /** True after at least one successful load (shared or local). */
  hasLoaded: boolean
  saving: boolean
  conflict: boolean
  canRetryConflict: boolean
  toast: string | null
  refresh: (opts?: { quiet?: boolean }) => Promise<void>
  commit: (next: LabUpdater, message: string) => Promise<boolean>
  retryConflict: () => Promise<boolean>
  dismissConflict: () => void
  reset: () => Promise<void>
}

function toLabState(shared: SharedHardwareLab): HardwareLabState {
  return normalizeHardwareLabState({
    units: shared.units,
    progress: shared.progress,
    tests: shared.tests,
    processes: shared.processes,
  })
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

const LabContext = createContext<LabStore | null>(null)

export function LabProvider({
  children,
  onAuthRequired,
}: {
  children: ReactNode
  onAuthRequired?: () => void
}) {
  const store = useLabStoreState(onAuthRequired)
  return createElement(LabContext.Provider, { value: store }, children)
}

export function useLabStore(): LabStore {
  const ctx = useContext(LabContext)
  if (!ctx) {
    throw new Error('useLabStore must be used within LabProvider')
  }
  return ctx
}

function useLabStoreState(onAuthRequired?: () => void): LabStore {
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
  const [hasLoaded, setHasLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [canRetryConflict, setCanRetryConflict] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const revisionRef = useRef(1)
  const labRef = useRef<HardwareLabState>(lab)
  const syncRef = useRef<LabSyncState>(sync)
  const hasLoadedRef = useRef(false)
  const commitChain = useRef(Promise.resolve(true))
  const savingRef = useRef(false)
  const pendingCount = useRef(0)
  const pendingUpdaterRef = useRef<LabUpdater | null>(null)
  const onAuthRequiredRef = useRef(onAuthRequired)
  onAuthRequiredRef.current = onAuthRequired

  syncRef.current = sync

  function flash(message: string) {
    const text = message.trim()
    if (!text) return
    setToast(text)
    window.setTimeout(() => setToast(null), 2800)
  }

  function handleAuthRequired() {
    setSync('error')
    setSyncError('Sign in required')
    onAuthRequiredRef.current?.()
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
    hasLoadedRef.current = true
    setHasLoaded(true)
  }

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (savingRef.current) return
    const result = await fetchSharedHardwareLab()
    if (result.ok) {
      // Don't clobber a newer local revision mid-edit race
      if (result.lab.revision < revisionRef.current) return
      applyShared(result.lab)
      if (!opts?.quiet) flash('Team lab loaded')
      return
    }

    if (result.authRequired) {
      handleAuthRequired()
      return
    }

    if (import.meta.env.DEV && (result.status === 0 || result.status === 404)) {
      const local = loadHardwareLab()
      labRef.current = local
      setLab(local)
      setSync('local')
      setSyncError(null)
      hasLoadedRef.current = true
      setHasLoaded(true)
      return
    }

    // Keep previously loaded data visible; mark error so UI can warn + retry.
    setSync('error')
    setSyncError(result.error)
  }, [])

  useEffect(() => {
    void refresh({ quiet: true })
  }, [refresh])

  useEffect(() => {
    // Keep polling while live OR recovering from a transient error.
    if (sync !== 'shared' && sync !== 'error') return

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
  }, [sync, refresh])

  const dismissConflict = useCallback(() => {
    pendingUpdaterRef.current = null
    setConflict(false)
    setCanRetryConflict(false)
  }, [])

  const commit = useCallback(async (next: LabUpdater, message: string) => {
    const run = async () => {
      const attemptSave = async (
        updater: LabUpdater,
        autoRetried: boolean,
      ): Promise<boolean> => {
        const previous = labRef.current
        const resolved =
          typeof updater === 'function' ? updater(previous) : updater

        // Updater decided nothing changed — avoid a save flicker.
        if (resolved === previous) return true

        if (syncRef.current === 'local') {
          saveHardwareLab(resolved)
          labRef.current = resolved
          setLab(resolved)
          dismissConflict()
          flash(message)
          return true
        }

        // Block edits until we've successfully loaded at least once
        if (!hasLoadedRef.current || syncRef.current === 'loading') {
          flash('Lab is still loading — try again in a moment')
          return false
        }

        // Optimistic UI so status / timeline buttons respond immediately.
        labRef.current = resolved
        setLab(resolved)

        pendingCount.current += 1
        savingRef.current = true
        setSaving(true)
        setConflict(false)
        setCanRetryConflict(false)
        const expected = revisionRef.current
        const result = await saveSharedHardwareLab(resolved, expected)
        pendingCount.current = Math.max(0, pendingCount.current - 1)
        if (pendingCount.current === 0) {
          savingRef.current = false
          setSaving(false)
        }

        if ('authRequired' in result && result.authRequired) {
          labRef.current = previous
          setLab(previous)
          handleAuthRequired()
          flash(result.error)
          return false
        }

        if ('conflict' in result && result.conflict) {
          applyShared(result.lab)
          // Functional edits: auto-retry once against the fresh shared lab so
          // two people touching different tabs often succeed without a click.
          if (typeof updater === 'function' && !autoRetried) {
            flash('Someone else saved first — retrying your edit…')
            return attemptSave(updater, true)
          }
          pendingUpdaterRef.current = updater
          setConflict(true)
          setCanRetryConflict(typeof updater === 'function')
          flash(
            typeof updater === 'function'
              ? 'Someone else saved first — review, then retry your edit.'
              : 'Someone else saved first — your edit was not applied. Re-apply after reviewing.',
          )
          return false
        }

        if (!result.ok) {
          labRef.current = previous
          setLab(previous)
          flash(result.error)
          return false
        }

        applyShared(result.lab)
        pendingUpdaterRef.current = null
        setConflict(false)
        setCanRetryConflict(false)
        flash(message)
        return true
      }

      return attemptSave(next, false)
    }

    const queued = commitChain.current.then(run, run)
    commitChain.current = queued.then(
      () => true,
      () => true,
    )
    return queued
  }, [dismissConflict])

  const retryConflict = useCallback(async () => {
    const updater = pendingUpdaterRef.current
    if (!updater || typeof updater !== 'function') {
      flash('Nothing to retry — re-apply your edit manually')
      return false
    }
    pendingUpdaterRef.current = null
    setConflict(false)
    setCanRetryConflict(false)
    return commit(updater, 'Edit retried')
  }, [commit])

  const reset = useCallback(async () => {
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
      if (result.authRequired) handleAuthRequired()
      flash(result.error)
      return
    }
    applyShared(result.lab)
    flash('Shared lab reset to seed')
  }, [])

  return useMemo(
    () => ({
      lab,
      revision,
      updatedAt,
      updatedBy,
      sync,
      syncError,
      hasLoaded,
      saving,
      conflict,
      canRetryConflict,
      toast,
      refresh,
      commit,
      retryConflict,
      dismissConflict,
      reset,
    }),
    [
      lab,
      revision,
      updatedAt,
      updatedBy,
      sync,
      syncError,
      hasLoaded,
      saving,
      conflict,
      canRetryConflict,
      toast,
      refresh,
      commit,
      retryConflict,
      dismissConflict,
      reset,
    ],
  )
}
