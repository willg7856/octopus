import { useState } from 'react'
import { ApiError } from '../lib/api'
import { useStore } from '../lib/store'
import type { Rec } from '../lib/types'
import { Button, useToast } from './ui'

/**
 * Push a countdown back quickly: type hours and/or minutes and press Add (or use a quick button).
 * On Hold the time goes on the stopped clock; otherwise T-0 moves later. Octopus's server does the
 * maths (see addTime in api/_lib/melbourne.ts), so every site moves together.
 */

const QUICK = [5, 10, 15, 30, 60]

const label = (min: number) => {
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
}

export function AddTime({ rec, compact = false }: { rec: Rec; compact?: boolean }) {
  const { update } = useStore()
  const toast = useToast()
  const [hours, setHours] = useState('')
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState(false)
  const held = (rec.data as Record<string, unknown>).status === 'hold'

  const typed = Math.round((Number(hours) || 0) * 60 + (Number(minutes) || 0))
  const valid = typed > 0 && typed <= 7 * 24 * 60

  const add = async (min: number) => {
    if (min <= 0) return
    setBusy(true)
    try {
      let wasHeld = held
      const send = (r: Rec) => {
        wasHeld = (r.data as Record<string, unknown>).status === 'hold'
        return update(r, { ...(r.data as Record<string, unknown>), addMs: min * 60_000 })
      }
      try {
        await send(rec)
      } catch (e) {
        // Someone else saved this test a moment ago: add to their latest copy instead.
        const latest = e instanceof ApiError && e.isConflict ? (e.body.current as Rec[] | undefined)?.find((r) => r.id === rec.id) : undefined
        if (!latest) throw e
        await send(latest)
      }
      toast(wasHeld ? `Added ${label(min)} to the hold` : `T-0 moved ${label(min)} later`, { tone: 'good' })
      setHours('')
      setMinutes('')
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={`addtime${compact ? ' compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) add(typed)
      }}
    >
      <span className="addtime-label muted small">{held ? 'Add to the hold' : 'Add time'}</span>
      <label className="addtime-field">
        <input type="number" inputMode="decimal" min="0" step="any" placeholder="0" value={hours}
          onChange={(e) => setHours(e.target.value)} aria-label="Hours to add" />
        <span>h</span>
      </label>
      <label className="addtime-field">
        <input type="number" inputMode="numeric" min="0" step="1" placeholder="0" value={minutes}
          onChange={(e) => setMinutes(e.target.value)} aria-label="Minutes to add" />
        <span>min</span>
      </label>
      <Button small variant="primary" type="submit" disabled={!valid || busy}>{busy ? 'Adding…' : 'Add'}</Button>
      {!compact && (
        <span className="addtime-quick" role="group" aria-label="Quick add">
          {QUICK.map((m) => (
            <button key={m} type="button" className="chip" disabled={busy} onClick={() => add(m)}>+{m >= 60 ? `${m / 60} h` : `${m} min`}</button>
          ))}
        </span>
      )}
    </form>
  )
}
