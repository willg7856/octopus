import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { fmtAgo, personName } from '../lib/derive'
import { href } from '../lib/router'
import { type Collection } from '../lib/schema'
import { useRecord } from '../lib/store'
import type { Data, HistoryEntry, Rec } from '../lib/types'
import { useEditor } from './Editor'
import { FieldValue } from './fields'
import { Icon } from './Icon'
import { Button, Empty } from './ui'

interface Props {
  c: Collection
  id: string
  /** Buttons beside Edit. */
  actions?: (r: Rec) => ReactNode
  /** Panels shown above the field list. */
  children?: (r: Rec) => ReactNode
  /** Field keys to leave out of the generic field list (because a panel shows them). */
  hideFields?: string[]
  badge?: (r: Rec) => ReactNode
}

export function RecordDetail({ c, id, actions, children, hideFields = [], badge }: Props) {
  const rec = useRecord(id)
  const openEditor = useEditor()
  if (!rec) {
    return (
      <div className="page">
        <a className="back" href={href(c.key)}><Icon name="chevron" size={14} className="flip" /> {c.label}</a>
        <Empty title={`This ${c.singular.toLowerCase()} isn’t here`}>
          It may have been deleted — check <a href={href('activity')}>Activity</a> to restore it.
        </Empty>
      </div>
    )
  }
  const fields = c.fields.filter((f) => !hideFields.includes(f.key) && f.type !== 'textarea')
  const longFields = c.fields.filter((f) => !hideFields.includes(f.key) && f.type === 'textarea')
  return (
    <div className="page">
      <a className="back" href={href(c.key)}><Icon name="chevron" size={14} className="flip" /> {c.label}</a>
      <header className="page-head detail-head">
        <div>
          <p className="eyebrow">{c.singular}</p>
          <h1>
            {c.title(rec.data)} {badge?.(rec)}
          </h1>
          {c.subtitle?.(rec.data) && <p className="muted mono">{c.subtitle(rec.data)}</p>}
        </div>
        <div className="row gap-s wrap">
          {actions?.(rec)}
          <Button icon="edit" onClick={() => openEditor({ type: c.type, record: rec })}>Edit</Button>
        </div>
      </header>

      {children?.(rec)}

      <section className="card">
        <dl className="fields">
          {fields.map((f) => (
            <div key={f.key} className={f.type === 'lines' ? 'span-all' : undefined}>
              <dt>{f.label}</dt>
              <dd><FieldValue field={f} value={rec.data[f.key]} /></dd>
            </div>
          ))}
        </dl>
        {longFields
          .filter((f) => rec.data[f.key])
          .map((f) => (
            <div key={f.key} className="long-field">
              <h3>{f.label}</h3>
              <p className="prewrap">{String(rec.data[f.key])}</p>
            </div>
          ))}
      </section>

      <History rec={rec} c={c} />
    </div>
  )
}

function History({ rec, c }: { rec: Rec; c: Collection }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    let live = true
    api.history({ record: rec.id }).then(
      (r) => live && setEntries(r.entries),
      () => live && setEntries([]),
    )
    return () => {
      live = false
    }
  }, [open, rec.id, rec.version])

  return (
    <section className="history">
      <button className="history-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="clock" size={14} /> Added by {personName(rec.createdBy)} {fmtAgo(rec.createdAt)}
        {rec.version > 1 && <> · last change by {personName(rec.updatedBy)} {fmtAgo(rec.updatedAt)}</>}
        <span className="muted"> · {open ? 'hide' : 'show'} history</span>
      </button>
      {open && (
        <ol className="history-list">
          {entries == null && <li className="muted">Loading…</li>}
          {entries?.map((e, i) => {
            const prev = entries[i + 1]
            return (
              <li key={e.seq ?? i}>
                <span className="strong">{personName(e.by)}</span> {verb(e.action)}{' '}
                <span className="muted">{fmtAgo(e.at)}</span>
                {e.action === 'update' && prev && <ChangedFields c={c} before={prev.data} after={e.data} />}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

const verb = (a: string) => ({ create: 'added this', update: 'changed', delete: 'deleted this', restore: 'restored this' })[a] ?? a

function ChangedFields({ c, before, after }: { c: Collection; before: Data; after: Data }) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  const changed = [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
  if (!changed.length) return null
  return (
    <ul className="changes">
      {changed.map((k) => {
        const f = c.fields.find((x) => x.key === k)
        if (!f) return null
        const simple = !['lines', 'textarea'].includes(f.type)
        return (
          <li key={k}>
            <span className="muted">{f.label}:</span>{' '}
            {simple ? (
              <>
                <span className="was"><FieldValue field={f} value={before?.[k]} /></span> →{' '}
                <FieldValue field={f} value={after?.[k]} />
              </>
            ) : (
              'edited'
            )}
          </li>
        )
      })}
    </ul>
  )
}
