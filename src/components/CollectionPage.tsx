import { useMemo, useRef, useState, type ReactNode } from 'react'
import { newId } from '../lib/api'
import { csvToData, downloadText, parseCsv, toCsv } from '../lib/csv'
import { fmtAgo } from '../lib/derive'
import { href, navigate, setParam, useRoute } from '../lib/router'
import { recordTitle, type Collection } from '../lib/schema'
import { useRecords, useStore } from '../lib/store'
import type { Data, Op, Rec } from '../lib/types'
import { useEditor } from './Editor'
import { FieldValue } from './fields'
import { Icon } from './Icon'
import { Button, Empty, useToast } from './ui'

export interface Column<D = Data> {
  key: string
  label: string
  render: (r: Rec<D>) => ReactNode
  sort?: (r: Rec<D>) => string | number
  className?: string
}

export interface Filter<D = Data> {
  key: string
  label: string
  test: (r: Rec<D>) => boolean
}

interface Props<D> {
  c: Collection
  /** Replaces the default columns (title column is always first). */
  columns?: Column<D>[]
  /** Quick filter chips. The first one is the default. */
  filters?: Filter<D>[]
  /** Render as cards instead of a table. */
  card?: (r: Rec<D>) => ReactNode
  headerActions?: ReactNode
  above?: ReactNode
  newInitial?: Data
  defaultSort?: { key: string; dir: 1 | -1 }
  /** Rows are clickable to a detail page (default) — set false to open the editor instead. */
  detail?: boolean
  /** Show the record title as the first column (default true). */
  titleColumn?: boolean
}

export function CollectionPage<D = Data>({
  c,
  columns,
  filters,
  card,
  headerActions,
  above,
  newInitial,
  defaultSort,
  detail = true,
  titleColumn = true,
}: Props<D>) {
  const rows = useRecords<D>(c.type)
  const { records, commit } = useStore()
  const openEditor = useEditor()
  const toast = useToast()
  const { params } = useRoute()
  const q = params.get('q') ?? ''
  const filterKey = params.get('f') ?? filters?.[0]?.key
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>(defaultSort ?? { key: '_title', dir: 1 })
  const fileRef = useRef<HTMLInputElement>(null)

  const cols: Column<D>[] = useMemo(
    () =>
      columns ??
      c.columns.flatMap((k) => {
        const f = c.fields.find((x) => x.key === k)
        if (!f) return []
        return {
          key: k,
          label: f.label,
          render: (r: Rec<D>) => <FieldValue field={f} value={(r.data as Data)[k]} />,
          sort: (r: Rec<D>) => {
            const v = (r.data as Data)[k]
            return typeof v === 'number' ? v : String(v ?? '')
          },
        }
      }),
    [columns, c],
  )

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filter = filters?.find((f) => f.key === filterKey)
    let out = rows.filter((r) => {
      if (filter && !filter.test(r)) return false
      if (!needle) return true
      const d = r.data as Data
      const hay = `${c.title(d)} ${c.subtitle?.(d) ?? ''} ${c.searchText?.(d) ?? ''} ${c.columns
        .map((k) => {
          const f = c.fields.find((x) => x.key === k)
          const v = d[k]
          if (f?.type === 'ref' && v) {
            return recordTitle(records.get(String(v)))
          }
          return typeof v === 'string' || typeof v === 'number' ? v : ''
        })
        .join(' ')}`.toLowerCase()
      return needle.split(/\s+/).every((w) => hay.includes(w))
    })
    const sorter =
      sort.key === '_title'
        ? (r: Rec<D>) => c.title(r.data as Data).toLowerCase()
        : sort.key === '_updated'
          ? (r: Rec<D>) => r.updatedAt
          : cols.find((x) => x.key === sort.key)?.sort
    if (sorter) {
      out = [...out].sort((a, b) => {
        const x = sorter(a)
        const y = sorter(b)
        if (x === y) return 0
        if (x === '' || x == null) return 1
        if (y === '' || y == null) return -1
        return (x < y ? -1 : 1) * sort.dir
      })
    }
    return out
  }, [rows, q, filters, filterKey, sort, cols, c, records])

  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))

  const openRow = (r: Rec<D>) => {
    if (detail) navigate(href(c.key, r.id))
    else openEditor({ type: c.type, record: r as Rec })
  }

  const exportCsv = () => {
    downloadText(`octopus-${c.key}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(c, visible as Rec[], records))
  }

  const importCsv = async (file: File) => {
    const text = await file.text()
    const { rows: data, ignored } = csvToData(c, parseCsv(text), records)
    if (!data.length) {
      toast('No rows matched this module’s columns.', { tone: 'bad' })
      return
    }
    const msg = `Import ${data.length} ${c.label.toLowerCase()}?${ignored.length ? `\n\nThese columns don’t match and will be skipped: ${ignored.join(', ')}` : ''}`
    if (!window.confirm(msg)) return
    try {
      for (let i = 0; i < data.length; i += 100) {
        const ops: Op[] = data.slice(i, i + 100).map((d) => ({ op: 'create', id: newId(), type: c.type, data: d }))
        await commit(ops)
      }
      toast(`Imported ${data.length} ${c.label.toLowerCase()}`, { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{c.label}</h1>
          <p className="muted">{c.blurb}</p>
        </div>
        <div className="row gap-s wrap">
          {headerActions}
          <Button variant="primary" icon="plus" onClick={() => openEditor({ type: c.type, initial: newInitial })}>
            Add {c.singular.toLowerCase()}
          </Button>
        </div>
      </header>

      {above}

      <div className="toolbar">
        <label className="search-inline">
          <Icon name="search" size={15} />
          <input
            type="search"
            className="search-field"
            placeholder={`Filter ${c.label.toLowerCase()}…`}
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
          />
        </label>
        {filters && (
          <div className="chips" role="tablist">
            {filters.map((f) => {
              const n = rows.filter(f.test).length
              return (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={f.key === filterKey}
                  className={`chip${f.key === filterKey ? ' on' : ''}`}
                  onClick={() => setParam('f', f.key === filters[0]!.key ? null : f.key)}
                >
                  {f.label} <span className="chip-n">{n}</span>
                </button>
              )
            })}
          </div>
        )}
        <div className="toolbar-end">
          <Button small variant="ghost" icon="download" onClick={exportCsv} title="Download the rows shown as CSV">
            CSV
          </Button>
          <Button small variant="ghost" icon="upload" onClick={() => fileRef.current?.click()} title="Import rows from a CSV file">
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importCsv(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty
          title={`No ${c.label.toLowerCase()} yet`}
          action={
            <Button variant="primary" icon="plus" onClick={() => openEditor({ type: c.type, initial: newInitial })}>
              Add the first {c.singular.toLowerCase()}
            </Button>
          }
        >
          {c.blurb} You can also import a CSV.
        </Empty>
      ) : visible.length === 0 ? (
        <Empty title="Nothing matches">Try a different search or filter.</Empty>
      ) : card ? (
        <div className="cards">{visible.map((r) => <div key={r.id}>{card(r)}</div>)}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {titleColumn && <SortTh label="Name" k="_title" sort={sort} onSort={toggleSort} />}
                {cols.map((col) => (
                  <SortTh key={col.key} label={col.label} k={col.key} sort={sort} onSort={col.sort ? toggleSort : undefined} className={col.className} />
                ))}
                <SortTh label="Updated" k="_updated" sort={sort} onSort={toggleSort} className="hide-s" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => openRow(r)}
                  onKeyDown={(e) => e.key === 'Enter' && openRow(r)}
                  className={r.pending ? 'pending' : undefined}
                >
                  {titleColumn && (
                    <td className="cell-title">
                      <span className="strong">{c.title(r.data as Data)}</span>
                      {c.subtitle?.(r.data as Data) && <span className="muted small">{c.subtitle(r.data as Data)}</span>}
                    </td>
                  )}
                  {cols.map((col) => (
                    <td key={col.key} className={col.className}>{col.render(r)}</td>
                  ))}
                  <td className="muted small nowrap hide-s">{fmtAgo(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small count-line">
        {visible.length === rows.length ? `${rows.length} total` : `${visible.length} of ${rows.length} shown`}
      </p>
    </div>
  )
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  className,
}: {
  label: string
  k: string
  sort: { key: string; dir: 1 | -1 }
  onSort?: (k: string) => void
  className?: string
}) {
  const active = sort.key === k
  return (
    <th className={className} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      {onSort ? (
        <button className="th-btn" onClick={() => onSort(k)}>
          {label}
          {active && <span className="sort-arrow">{sort.dir === 1 ? '↑' : '↓'}</span>}
        </button>
      ) : (
        label
      )}
    </th>
  )
}
