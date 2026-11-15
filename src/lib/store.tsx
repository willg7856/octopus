import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError, newId } from './api'
import type { Data, Op, Rec, User } from './types'

export type SyncStatus = 'loading' | 'live' | 'saving' | 'offline' | 'error'

interface StoreValue {
  user: User
  records: Map<string, Rec>
  status: SyncStatus
  error: string | null
  lastSync: Date | null
  /** Applies changes atomically. Rejects (and rolls back locally) if the server refuses. */
  commit(ops: Op[]): Promise<Rec[]>
  create(type: string, data: Data): Promise<Rec>
  update(rec: Rec, data: Data): Promise<Rec>
  remove(rec: Rec): Promise<void>
  restore(id: string): Promise<void>
  refresh(full?: boolean): Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

const POLL_MS = 15_000
const FULL_RELOAD_MS = 5 * 60_000

export function StoreProvider({ user, children }: { user: User; children: ReactNode }) {
  const [records, setRecords] = useState<Map<string, Rec>>(new Map())
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const revRef = useRef<number | null>(null)
  const lastFull = useRef(0)
  const inflight = useRef(0)

  const refresh = useCallback(async (full = false) => {
    try {
      const doFull = full || revRef.current == null || Date.now() - lastFull.current > FULL_RELOAD_MS
      const res = await api.records(doFull ? undefined : revRef.current!)
      revRef.current = res.rev
      setRecords((prev) => {
        const next = doFull ? new Map<string, Rec>() : new Map(prev)
        if (doFull) {
          // Keep optimistic records whose save hasn't landed yet.
          for (const r of prev.values()) if (r.pending) next.set(r.id, r)
        }
        for (const r of res.records) {
          const local = next.get(r.id)
          if (local?.pending && local.version >= r.version) continue
          if (r.deletedAt) next.delete(r.id)
          else next.set(r.id, r)
        }
        return next
      })
      if (doFull) lastFull.current = Date.now()
      setLastSync(new Date())
      setError(null)
      setStatus(inflight.current > 0 ? 'saving' : 'live')
    } catch (e) {
      const err = e as ApiError
      if (err.status === 401) {
        window.location.reload()
        return
      }
      setStatus(err.status === 0 ? 'offline' : 'error')
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    refresh(true)
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
    }
  }, [refresh])

  const recordsRef = useRef(records)
  recordsRef.current = records

  const commit = useCallback(
    async (ops: Op[]) => {
      const snapshot = new Map(recordsRef.current)
      const now = new Date().toISOString()
      // Optimistic local apply so the UI responds instantly.
      setRecords((prev) => {
        const next = new Map(prev)
        for (const op of ops) {
          const cur = next.get(op.id)
          if (op.op === 'create') {
            next.set(op.id, {
              id: op.id, type: op.type, data: op.data, version: 0, rev: 0,
              createdAt: now, createdBy: user.email, updatedAt: now, updatedBy: user.email,
              deletedAt: null, pending: true,
            })
          } else if (op.op === 'update' && cur) {
            next.set(op.id, { ...cur, data: op.data, updatedAt: now, updatedBy: user.email, pending: true })
          } else if (op.op === 'delete') {
            next.delete(op.id)
          }
        }
        return next
      })
      inflight.current++
      setStatus('saving')
      try {
        const res = await api.apply(ops)
        setRecords((prev) => {
          const next = new Map(prev)
          for (const r of res.records) {
            if (r.deletedAt) next.delete(r.id)
            else next.set(r.id, r)
          }
          return next
        })
        return res.records
      } catch (e) {
        const err = e as ApiError
        // Roll back, then take the server's current copies so the user sees the truth.
        setRecords(() => {
          const next = new Map(snapshot)
          const current = (err.body?.current as Rec[] | undefined) ?? []
          for (const r of current) {
            if (r.deletedAt) next.delete(r.id)
            else next.set(r.id, r)
          }
          return next
        })
        if (err.status === 401) window.location.reload()
        throw err
      } finally {
        inflight.current--
        setStatus((s) => (inflight.current > 0 ? 'saving' : s === 'saving' ? 'live' : s))
      }
    },
    [user.email],
  )

  const value = useMemo<StoreValue>(
    () => ({
      user,
      records,
      status,
      error,
      lastSync,
      commit,
      refresh,
      async create(type, data) {
        const [r] = await commit([{ op: 'create', id: newId(), type, data }])
        return r!
      },
      async update(rec, data) {
        const [r] = await commit([{ op: 'update', id: rec.id, version: rec.version, data }])
        return r!
      },
      async remove(rec) {
        await commit([{ op: 'delete', id: rec.id, version: rec.version }])
      },
      async restore(id) {
        await commit([{ op: 'restore', id }])
      },
    }),
    [user, records, status, error, lastSync, commit, refresh],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext)
  if (!v) throw new Error('useStore outside StoreProvider')
  return v
}

export function useRecords<D = Data>(type: string): Rec<D>[] {
  const { records } = useStore()
  return useMemo(() => {
    const out: Rec<D>[] = []
    for (const r of records.values()) if (r.type === type) out.push(r as Rec<D>)
    return out
  }, [records, type])
}

export function useRecord<D = Data>(id: string | undefined): Rec<D> | undefined {
  const { records } = useStore()
  return id ? (records.get(id) as Rec<D> | undefined) : undefined
}
