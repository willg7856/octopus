import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ApiError } from '../lib/api'
import { byType, initialData, recordTitle, type Collection } from '../lib/schema'
import { useStore } from '../lib/store'
import type { Data, Rec } from '../lib/types'
import { FieldInput, splitTags } from './fields'
import { Icon } from './Icon'
import { Button, useToast } from './ui'

interface EditorRequest {
  type: string
  record?: Rec
  initial?: Data
  heading?: string
  onSaved?: (rec: Rec) => void
}

const EditorCtx = createContext<(req: EditorRequest) => void>(() => {})
export const useEditor = () => useContext(EditorCtx)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<EditorRequest | null>(null)
  const [key, setKey] = useState(0)
  const open = useCallback((r: EditorRequest) => {
    setReq(r)
    setKey((k) => k + 1)
  }, [])
  return (
    <EditorCtx.Provider value={open}>
      {children}
      {req && <EditorDrawer key={key} req={req} onClose={() => setReq(null)} reopen={open} />}
    </EditorCtx.Provider>
  )
}

function clean(c: Collection, d: Data): Data {
  const out: Data = {}
  for (const [k, v] of Object.entries(d)) {
    const f = c.fields.find((x) => x.key === k)
    let val = v
    if (f?.type === 'tags') val = splitTags(v)
    if (f?.type === 'lines') val = (v as Data[] | undefined)?.filter((l) => l.item || l.description)
    if (typeof val === 'string') val = val.trim()
    if (val === '' || val === undefined || (Array.isArray(val) && val.length === 0)) continue
    // Fields hidden by the current choices aren't saved (e.g. host on an AnyDesk machine).
    if (f?.hidden?.(d)) continue
    out[k] = val
  }
  return out
}

function EditorDrawer({ req, onClose, reopen }: { req: EditorRequest; onClose: () => void; reopen: (r: EditorRequest) => void }) {
  const c = byType.get(req.type)!
  const { create, update, remove, restore, records, user } = useStore()
  const toast = useToast()
  const editing = req.record
  const [data, setData] = useState<Data>(() => {
    if (editing) return { ...editing.data }
    const d = initialData(c, req.initial)
    // Who did it / who asked: default to the signed-in person.
    for (const k of ['by', 'requestedBy']) {
      if (c.fields.some((f) => f.key === k) && !d[k]) d[k] = user.name
    }
    return d
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Rec | null>(null)
  const [dirty, setDirty] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    if (dirty && !window.confirm('Discard your changes?')) return
    onClose()
  }, [dirty, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  const set = (k: string, v: unknown) => {
    setDirty(true)
    setData((d) => ({ ...d, [k]: v }))
  }

  const save = async (another = false) => {
    const missing = c.fields.filter((f) => f.required && !f.hidden?.(data) && (data[f.key] == null || data[f.key] === ''))
    if (missing.length) {
      setError(`Fill in: ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = clean(c, data)
      const base = conflict ?? editing
      const rec = base ? await update(base, payload) : await create(c.type, payload)
      const itemName = c.type === 'movement' ? recordTitle(records.get(String(rec.data.item))) : ''
      toast(
        c.type === 'movement'
          ? `${editing ? "Updated" : "Logged"}: ${c.title(rec.data).toLowerCase()} ${itemName}`
          : `${editing ? 'Saved' : 'Added'} ${c.title(rec.data)}`,
        { tone: 'good' },
      )
      req.onSaved?.(rec)
      setDirty(false)
      if (another) reopen({ ...req, record: undefined })
      else onClose()
    } catch (e) {
      const err = e as ApiError
      if (err.isConflict) {
        const cur = (err.body.current as Rec[] | undefined)?.find((r) => r.id === editing?.id)
        setConflict(cur ?? null)
        setError(
          cur?.deletedAt
            ? 'Someone deleted this while you were editing.'
            : `${cur?.updatedBy ?? 'Someone'} saved a change while you were editing. Your edits are still here.`,
        )
      } else {
        setError(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!editing) return
    const live = records.get(editing.id) ?? editing
    if (!window.confirm(`Delete “${recordTitle(live)}”? You can restore it from Activity.`)) return
    try {
      await remove(live)
      onClose()
      toast(`Deleted ${recordTitle(live)}`, {
        action: { label: 'Undo', run: () => restore(live.id).catch((e) => toast(e.message, { tone: 'bad' })) },
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const visible = c.fields.filter((f) => !f.hidden?.(data))

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={req.heading ?? c.singular} ref={panelRef}>
        <header className="drawer-head">
          <div>
            <p className="eyebrow">{editing ? `Edit ${c.singular.toLowerCase()}` : `New ${c.singular.toLowerCase()}`}</p>
            <h2>{req.heading ?? (editing ? c.title(editing.data) : `Add ${c.singular.toLowerCase()}`)}</h2>
          </div>
          <Button variant="ghost" icon="x" aria-label="Close" onClick={close} />
        </header>
        <form
          className="drawer-body form-grid"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {visible.map((f, i) => (
            <FieldInput key={f.key} field={f} data={data} value={data[f.key]} onChange={(v) => set(f.key, v)} autoFocus={i === 0 && !editing} />
          ))}
          <button type="submit" hidden />
        </form>
        {error && (
          <div className="drawer-error" role="alert">
            <Icon name="alert" />
            <div>
              <p>{error}</p>
              {conflict && !conflict.deletedAt && (
                <div className="row gap-s">
                  <Button small variant="primary" onClick={() => save()}>Save mine anyway</Button>
                  <Button
                    small
                    onClick={() => {
                      setData({ ...conflict.data })
                      setDirty(false)
                      setError(null)
                    }}
                  >
                    Load theirs
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        <footer className="drawer-foot">
          {editing ? (
            <Button variant="ghost" className="danger-text" icon="trash" onClick={doDelete}>Delete</Button>
          ) : (
            <span />
          )}
          <div className="row gap-s">
            {!editing && (
              <Button onClick={() => save(true)} disabled={saving}>Save & add another</Button>
            )}
            <Button variant="primary" onClick={() => save()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : `Add ${c.singular.toLowerCase()}`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
