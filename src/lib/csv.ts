import { fmtDate, fmtTime12, parseDate, parseTime } from './derive'
import { recordTitle, type Collection } from './schema'
import type { Data, OrderLine, Rec } from './types'

function cell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(c: Collection, rows: Rec[], all: Map<string, Rec>): string {
  const fields = c.fields.filter((f) => f.type !== 'lines')
  const hasLines = c.fields.some((f) => f.type === 'lines')
  const head = ['id', ...fields.map((f) => f.label), ...(hasLines ? ['Items'] : []), 'Updated', 'Updated by']
  const lines = rows.map((r) => {
    const vals = fields.map((f) => {
      const v = r.data[f.key]
      if (f.type === 'ref') return v ? recordTitle(all.get(String(v))) : ''
      if (f.type === 'tags') return Array.isArray(v) ? v.join(', ') : ''
      if (f.type === 'date') return v ? fmtDate(v) : ''
      if (f.type === 'time') return v ? fmtTime12(v) : ''
      return v
    })
    if (hasLines) {
      const ls = (r.data.lines as OrderLine[] | undefined) ?? []
      vals.push(
        ls.map((l) => `${l.qty ?? 0} × ${l.item ? recordTitle(all.get(l.item)) : l.description ?? ''} @ ${l.unitPrice ?? 0}`).join('; '),
      )
    }
    return [r.id, ...vals, fmtDate(r.updatedAt), r.updatedBy ?? ''].map(cell).join(',')
  })
  return [head.map(cell).join(','), ...lines].join('\n')
}

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/**
 * Turns CSV rows into record data for a collection. Columns are matched by field label or
 * key (case-insensitive). Ref columns match existing records by title. Returns rows plus
 * a list of the columns that were ignored, so the user can see what didn't map.
 */
export function csvToData(c: Collection, rows: string[][], all: Map<string, Rec>) {
  const [head = [], ...body] = rows
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const map = head.map((h) => c.fields.find((f) => norm(f.label) === norm(h) || norm(f.key) === norm(h)))
  const ignored = head.filter((_, i) => !map[i] && norm(head[i]!) !== 'id')
  const titleIndex = new Map<string, string>()
  for (const r of all.values()) titleIndex.set(`${r.type}:${recordTitle(r).toLowerCase()}`, r.id)
  const out: Data[] = body.map((cols) => {
    const d: Data = {}
    map.forEach((f, i) => {
      const raw = (cols[i] ?? '').trim()
      if (!f || !raw) return
      if (f.type === 'number' || f.type === 'money') {
        const n = Number(raw.replace(/[$,\s]/g, ''))
        if (!Number.isNaN(n)) d[f.key] = n
      } else if (f.type === 'tags') d[f.key] = raw.split(',').map((s) => s.trim()).filter(Boolean)
      else if (f.type === 'ref') {
        const id = titleIndex.get(`${f.ref}:${raw.toLowerCase()}`)
        if (id) d[f.key] = id
      } else if (f.type === 'select') {
        const opt = f.options?.find((o) => norm(o.value) === norm(raw) || norm(o.label) === norm(raw))
        if (opt) d[f.key] = opt.value
      } else if (f.type === 'date') {
        const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : parseDate(raw)
        if (iso) d[f.key] = iso
      } else if (f.type === 'time') {
        const t = parseTime(raw)
        if (t) d[f.key] = t
      } else if (f.type !== 'lines') d[f.key] = raw
    })
    return d
  })
  return { rows: out.filter((d) => Object.keys(d).length > 0), ignored }
}
