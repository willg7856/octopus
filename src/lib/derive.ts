import { useMemo } from 'react'
import { useRecords } from './store'
import type { Budget, Item, Movement, Order, OrderLine, Rec } from './types'

/** Signed effect of a log entry on stock. */
export function movementDelta(m: Movement): number {
  const q = Number(m.qty) || 0
  if (m.kind === 'used' || m.kind === 'scrapped') return -Math.abs(q)
  if (m.kind === 'adjusted') return q
  return Math.abs(q)
}

export function useStock(): Map<string, number> {
  const movements = useRecords<Movement>('movement')
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const r of movements) m.set(r.data.item, (m.get(r.data.item) ?? 0) + movementDelta(r.data))
    return m
  }, [movements])
}

export type StockLevel = 'out' | 'low' | 'ok' | 'untracked'

export function stockLevel(item: Item, qty: number): StockLevel {
  if (item.kind === 'tool' && item.minQty == null) return 'untracked'
  if (qty <= 0) return 'out'
  if (item.minQty != null && qty <= item.minQty) return 'low'
  return 'ok'
}

/** Items at or below reorder level, plus quantity already on open orders. */
export function useReorderList() {
  const items = useRecords<Item>('item')
  const stock = useStock()
  const onOrder = useOnOrder()
  return useMemo(
    () =>
      items
        .map((r) => ({ rec: r, qty: stock.get(r.id) ?? 0, onOrder: onOrder.get(r.id) ?? 0 }))
        .filter(({ rec, qty }) => rec.data.minQty != null && qty <= rec.data.minQty)
        .sort((a, b) => a.qty - (a.rec.data.minQty ?? 0) - (b.qty - (b.rec.data.minQty ?? 0))),
    [items, stock, onOrder],
  )
}

export const OPEN_STATUSES = new Set(['requested', 'approved', 'ordered', 'shipped'])
export const COMMITTED_STATUSES = new Set(['approved', 'ordered', 'shipped'])

export function useOnOrder(): Map<string, number> {
  const orders = useRecords<Order>('order')
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const o of orders) {
      if (!COMMITTED_STATUSES.has(o.data.status)) continue
      for (const l of o.data.lines ?? []) if (l.item) m.set(l.item, (m.get(l.item) ?? 0) + (Number(l.qty) || 0))
    }
    return m
  }, [orders])
}

export function lineTotal(l: OrderLine): number {
  return (Number(l.qty) || 0) * (Number(l.unitPrice) || 0)
}

export function orderTotal(o: Order): number {
  return (o.lines ?? []).reduce((s, l) => s + lineTotal(l), 0) + (Number(o.shipping) || 0)
}

export interface BudgetSummary {
  rec: Rec<Budget> | null
  allocated: number
  committed: number
  spent: number
  requested: number
  orders: Rec<Order>[]
}

export function useBudgetSummary(): BudgetSummary[] {
  const budgets = useRecords<Budget>('budget')
  const orders = useRecords<Order>('order')
  return useMemo(() => {
    const map = new Map<string, BudgetSummary>()
    const unassigned: BudgetSummary = { rec: null, allocated: 0, committed: 0, spent: 0, requested: 0, orders: [] }
    for (const b of budgets) {
      map.set(b.id, { rec: b, allocated: Number(b.data.amount) || 0, committed: 0, spent: 0, requested: 0, orders: [] })
    }
    for (const o of orders) {
      const s = (o.data.budget && map.get(o.data.budget)) || unassigned
      const t = orderTotal(o.data)
      s.orders.push(o)
      if (o.data.status === 'received') s.spent += t
      else if (COMMITTED_STATUSES.has(o.data.status)) s.committed += t
      else if (o.data.status === 'requested') s.requested += t
    }
    const out = [...map.values()].sort((a, b) =>
      String(a.rec?.data.name).localeCompare(String(b.rec?.data.name)),
    )
    if (unassigned.orders.length) out.push(unassigned)
    return out
  }, [budgets, orders])
}

/* ---------- formatting ---------- */

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const moneyRound = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

export function fmtMoney(n: unknown, round = false): string {
  const v = Number(n)
  if (n == null || n === '' || Number.isNaN(v)) return '—'
  return (round ? moneyRound : money).format(v)
}

export function fmtQty(n: number, unit?: string): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
  return unit && unit !== 'ea' ? `${s} ${unit}` : s
}

/** Formats a date (YYYY-MM-DD or ISO timestamp) as DD/MM/YYYY. */
export function fmtDate(s: unknown): string {
  if (!s) return '—'
  const str = String(s)
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return str
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Parses DD/MM/YYYY (also D/M/YY, dashes or dots) into YYYY-MM-DD. Returns null if invalid. */
export function parseDate(input: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\s*$/.exec(input)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  let year = Number(m[3])
  if (m[3]!.length === 2) year += 2000
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Parses a time typed as 12- or 24-hour ("2:30 pm", "2pm", "14:30", "1430", "9") into "HH:MM".
 * Returns null if it isn't a valid time.
 */
export function parseTime(input: string): string | null {
  const m = /^\s*(\d{1,2})(?:[:.h]?(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(input)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const ap = m[3]?.toLowerCase()
  if (min > 59) return null
  if (ap) {
    if (h < 1 || h > 12) return null
    if (ap === 'a') h = h === 12 ? 0 : h
    else h = h === 12 ? 12 : h + 12
  } else if (h > 23) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** "14:30" → "2:30 pm"; "00:00" → "12:00 am". Leaves unparseable text as it was. */
export function fmtTime12(t: unknown): string {
  if (!t) return ''
  const hhmm = parseTime(String(t))
  if (!hhmm) return String(t)
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

export function fmtAgo(s: string | null | undefined): string {
  if (!s) return '—'
  const sec = (Date.now() - new Date(s).getTime()) / 1000
  if (sec < 45) return 'just now'
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
  if (sec < 86400 * 7) return `${Math.round(sec / 86400)}d ago`
  return fmtDate(s)
}

export function daysUntil(date: string | undefined): number | null {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

export function personName(email: string | null | undefined): string {
  if (!email) return 'Someone'
  return email
    .split('@')[0]!
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}
