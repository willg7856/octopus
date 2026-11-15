import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { fmtDate, fmtMoney, lineTotal } from '../lib/derive'
import { href } from '../lib/router'
import { byType, labelOf, recordTitle, toneOf, initialData, type Field } from '../lib/schema'
import { useRecords, useStore } from '../lib/store'
import type { Data, OrderLine, Rec } from '../lib/types'
import { Icon } from './Icon'
import { Badge, Button, useToast } from './ui'

/* ======================= display ======================= */

export function RefLink({ id }: { id: unknown }) {
  const { records } = useStore()
  if (!id) return <span className="muted">—</span>
  const rec = records.get(String(id))
  if (!rec) return <span className="muted">(removed)</span>
  const c = byType.get(rec.type)
  return (
    <a className="ref-link" href={href(c?.key, rec.id)} onClick={(e) => e.stopPropagation()}>
      {recordTitle(rec)}
    </a>
  )
}

export function FieldValue({ field, value }: { field: Field; value: unknown }): ReactNode {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <span className="muted">—</span>
  }
  switch (field.type) {
    case 'select':
      return <Badge tone={toneOf(field.options, value)}>{labelOf(field.options, value)}</Badge>
    case 'money':
      return <span className="num">{fmtMoney(value)}</span>
    case 'number':
      return <span className="num">{String(value)}</span>
    case 'date':
      return <span className="nowrap">{fmtDate(value)}</span>
    case 'url':
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="ext-link" onClick={(e) => e.stopPropagation()}>
          {prettyUrl(String(value))} <Icon name="external" size={12} />
        </a>
      )
    case 'email':
      return <a href={`mailto:${value}`} onClick={(e) => e.stopPropagation()}>{String(value)}</a>
    case 'phone':
      return <a href={`tel:${String(value).replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()}>{String(value)}</a>
    case 'ref':
      return <RefLink id={value} />
    case 'tags':
      return (
        <span className="tags">
          {(value as string[]).map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </span>
      )
    case 'textarea':
      return <span className="prewrap">{String(value)}</span>
    case 'lines':
      return <LinesView lines={value as OrderLine[]} />
    default:
      return <>{String(value)}</>
  }
}

export function prettyUrl(u: string): string {
  try {
    const url = new URL(u)
    const p = url.pathname.length > 24 ? `${url.pathname.slice(0, 22)}…` : url.pathname
    return url.host.replace(/^www\./, '') + (p === '/' ? '' : p)
  } catch {
    return u
  }
}

function LinesView({ lines }: { lines: OrderLine[] }) {
  return (
    <table className="lines-view">
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td>{l.item ? <RefLink id={l.item} /> : null}{l.item && l.description ? ' — ' : ''}{l.description}</td>
            <td className="num">×{l.qty ?? 0}</td>
            <td className="num">{fmtMoney(l.unitPrice)}</td>
            <td className="num strong">{fmtMoney(lineTotal(l))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ======================= inputs ======================= */

interface InputProps {
  field: Field
  value: unknown
  onChange: (v: unknown) => void
  data: Data
  autoFocus?: boolean
}

export function FieldInput({ field, value, onChange, autoFocus }: InputProps) {
  const id = useId()
  const suggestions = useSuggestions(field)
  const common = { id, autoFocus, placeholder: field.placeholder }
  let input: ReactNode
  switch (field.type) {
    case 'textarea':
      input = (
        <textarea {...common} rows={field.rows ?? 3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      )
      break
    case 'number':
    case 'money':
      input = (
        <div className={field.type === 'money' ? 'input-money' : undefined}>
          <input
            {...common}
            type="number"
            inputMode="decimal"
            step={field.type === 'money' ? '0.01' : 'any'}
            value={value == null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
      )
      break
    case 'date':
      input = <input {...common} type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)} />
      break
    case 'select':
      input = (
        <select id={id} autoFocus={autoFocus} value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          {!field.required && <option value="">—</option>}
          {field.options!.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )
      break
    case 'ref':
      input = <RefPicker id={id} field={field} value={value as string | undefined} onChange={onChange} autoFocus={autoFocus} />
      break
    case 'tags':
      input = (
        <input
          {...common}
          value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(splitTags(e.target.value))}
        />
      )
      break
    case 'lines':
      input = <LinesEditor value={(value as OrderLine[]) ?? []} onChange={onChange} />
      break
    default:
      input = (
        <>
          <input
            {...common}
            type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            list={suggestions.length ? `${id}-list` : undefined}
          />
          {suggestions.length > 0 && (
            <datalist id={`${id}-list`}>
              {suggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
          )}
        </>
      )
  }
  return (
    <div className={`field${field.half ? ' half' : ''}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="req"> *</span>}
      </label>
      {input}
      {field.help && <p className="help">{field.help}</p>}
    </div>
  )
}

export function splitTags(v: unknown): string[] {
  if (Array.isArray(v)) return v
  return String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Existing values for this field across records of all types, for datalist suggestions. */
function useSuggestions(field: Field): string[] {
  const { records } = useStore()
  return useMemo(() => {
    if (!field.suggest) return []
    const set = new Set<string>()
    for (const r of records.values()) {
      const v = r.data[field.key]
      if (typeof v === 'string' && v.trim()) set.add(v.trim())
    }
    return [...set].sort().slice(0, 200)
  }, [records, field])
}

/* ---------- ref picker: searchable, with quick-create ---------- */

export function RefPicker({
  id,
  field,
  value,
  onChange,
  autoFocus,
}: {
  id?: string
  field: Field
  value: string | undefined
  onChange: (v: string | undefined) => void
  autoFocus?: boolean
}) {
  const all = useRecords(field.ref!)
  const { records, create } = useStore()
  const toast = useToast()
  const c = byType.get(field.ref!)!
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const current = value ? records.get(value) : undefined

  const options = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const base = field.refFilter ? all.filter((r) => field.refFilter!(r.data)) : all
    const pool = needle && field.refFilter ? all : base // when typing, search everything of this type
    return pool
      .filter((r) => {
        if (!needle) return true
        return `${c.title(r.data)} ${c.subtitle?.(r.data) ?? ''}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => c.title(a.data).localeCompare(c.title(b.data)))
      .slice(0, 50)
  }, [all, q, c, field])

  useEffect(() => setHi(0), [q])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const canCreate = q.trim().length > 1 && !options.some((o) => c.title(o.data).toLowerCase() === q.trim().toLowerCase())
  const titleKey = c.fields[0]!.key

  const pick = (r: Rec) => {
    onChange(r.id)
    setQ('')
    setOpen(false)
  }

  const quickCreate = async () => {
    const name = q.trim()
    setOpen(false)
    try {
      const extra: Data = { [titleKey]: name }
      if (field.refFilter && field.ref === 'contact') extra.kind = 'supplier'
      const rec = await create(c.type, initialData(c, extra))
      onChange(rec.id)
      setQ('')
      toast(`Added ${c.singular.toLowerCase()} “${name}”`, { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  const total = options.length + (canCreate ? 1 : 0)

  return (
    <div className="combo" ref={boxRef}>
      <div className="combo-input">
        <input
          id={id}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={current ? recordTitle(current) : `Search ${c.label.toLowerCase()}…`}
          className={current && !q ? 'has-value' : undefined}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setHi((h) => Math.min(h + 1, total - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => Math.max(h - 1, 0))
            } else if (e.key === 'Enter' && open) {
              e.preventDefault()
              if (hi < options.length) pick(options[hi]!)
              else if (canCreate) quickCreate()
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation()
              setOpen(false)
            }
          }}
        />
        {current && !q && (
          <button type="button" className="combo-clear" aria-label="Clear" onClick={() => onChange(undefined)}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      {open && (
        <ul className="combo-list" role="listbox">
          {options.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === hi}
              className={i === hi ? 'hi' : undefined}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(r)
              }}
              onMouseEnter={() => setHi(i)}
            >
              <span>{c.title(r.data)}</span>
              {c.subtitle?.(r.data) && <span className="muted small">{c.subtitle(r.data)}</span>}
            </li>
          ))}
          {canCreate && (
            <li
              className={`combo-create${hi === options.length ? ' hi' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                quickCreate()
              }}
              onMouseEnter={() => setHi(options.length)}
            >
              <Icon name="plus" size={14} /> Add new {c.singular.toLowerCase()} “{q.trim()}”
            </li>
          )}
          {total === 0 && <li className="muted combo-empty">Type to search or add a {c.singular.toLowerCase()}</li>}
        </ul>
      )}
    </div>
  )
}

/* ---------- order lines ---------- */

const ITEM_FIELD: Field = { key: 'item', label: 'Item', type: 'ref', ref: 'item' }

function LinesEditor({ value, onChange }: { value: OrderLine[]; onChange: (v: OrderLine[]) => void }) {
  const { records } = useStore()
  const lines = value.length ? value : []
  const set = (i: number, patch: Partial<OrderLine>) => {
    const next = lines.map((l, j) => (j === i ? { ...l, ...patch } : l))
    onChange(next)
  }
  const total = lines.reduce((s, l) => s + lineTotal(l), 0)
  return (
    <div className="lines-editor">
      {lines.length > 0 && (
        <div className="lines-head">
          <span>Inventory item / description</span>
          <span>Qty</span>
          <span>Unit price</span>
          <span />
        </div>
      )}
      {lines.map((l, i) => (
        <div key={i} className="line-row">
          <div className="line-desc">
            <RefPicker
              field={ITEM_FIELD}
              value={l.item}
              onChange={(id) => {
                const item = id ? records.get(id) : undefined
                set(i, {
                  item: id,
                  unitPrice: l.unitPrice ?? (item?.data.unitCost as number | undefined),
                })
              }}
            />
            <input
              placeholder={l.item ? 'Note (optional)' : 'Description (not stocked)'}
              value={l.description ?? ''}
              onChange={(e) => set(i, { description: e.target.value })}
            />
          </div>
          <input
            type="number"
            inputMode="decimal"
            aria-label="Quantity"
            value={l.qty ?? ''}
            onChange={(e) => set(i, { qty: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
          <div className="input-money">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              aria-label="Unit price"
              value={l.unitPrice ?? ''}
              onChange={(e) => set(i, { unitPrice: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </div>
          <Button variant="ghost" icon="x" small aria-label="Remove line" onClick={() => onChange(lines.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="lines-foot">
        <Button small icon="plus" onClick={() => onChange([...lines, { qty: 1 }])}>
          Add line
        </Button>
        {lines.length > 0 && <span className="muted">Items total <strong className="num">{fmtMoney(total)}</strong></span>}
      </div>
    </div>
  )
}
