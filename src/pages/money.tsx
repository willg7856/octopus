import { useMemo } from 'react'
import { newId } from '../lib/api'
import { CollectionPage, type Column, type Filter } from '../components/CollectionPage'
import { useDialog } from '../components/Dialog'
import { useEditor } from '../components/Editor'
import { RefLink } from '../components/fields'
import { RecordDetail } from '../components/RecordDetail'
import { Badge, Button, Empty, LinkButton, Meter, Stat, useToast } from '../components/ui'
import {
  daysUntil,
  fmtDate,
  fmtMoney,
  OPEN_STATUSES,
  orderTotal,
  useBudgetSummary,
  type BudgetSummary,
} from '../lib/derive'
import { href } from '../lib/router'
import { byType, labelOf, ORDER_STATUSES, toneOf } from '../lib/schema'
import { useStore } from '../lib/store'
import type { Op, Order, OrderStatus, Rec } from '../lib/types'

const ORDER = byType.get('order')!
const BUDGET = byType.get('budget')!

const today = () => new Date().toISOString().slice(0, 10)

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={toneOf(ORDER_STATUSES, status)}>{labelOf(ORDER_STATUSES, status)}</Badge>
}

export function DueText({ order }: { order: Order }) {
  if (!OPEN_STATUSES.has(order.status) || !order.expectedAt) return null
  const d = daysUntil(order.expectedAt)!
  if (d < 0) return <span className="text-bad small">{-d}d overdue</span>
  if (d === 0) return <span className="text-warn small">due today</span>
  return <span className="muted small">due in {d}d</span>
}

export function OrdersList() {
  const columns: Column<Order>[] = [
    { key: 'status', label: 'Status', sort: (r) => ORDER_STATUSES.findIndex((s) => s.value === r.data.status), render: (r) => <StatusBadge status={r.data.status} /> },
    { key: 'supplier', label: 'Supplier', className: 'hide-s', render: (r) => <RefLink id={r.data.supplier} /> },
    { key: 'total', label: 'Total', className: 'num', sort: (r) => orderTotal(r.data), render: (r) => <span className="num strong">{fmtMoney(orderTotal(r.data))}</span> },
    { key: 'budget', label: 'Budget', className: 'hide-s', render: (r) => <RefLink id={r.data.budget} /> },
    {
      key: 'expectedAt',
      label: 'Expected',
      sort: (r) => r.data.expectedAt ?? '',
      render: (r) => (
        <span className="stack-xs">
          <span className="nowrap">{fmtDate(r.data.expectedAt)}</span>
          <DueText order={r.data} />
        </span>
      ),
    },
  ]
  const filters: Filter<Order>[] = [
    { key: 'open', label: 'Open', test: (r) => OPEN_STATUSES.has(r.data.status) },
    { key: 'requested', label: 'To approve', test: (r) => r.data.status === 'requested' },
    { key: 'incoming', label: 'Incoming', test: (r) => r.data.status === 'ordered' || r.data.status === 'shipped' },
    { key: 'received', label: 'Received', test: (r) => r.data.status === 'received' },
    { key: 'all', label: 'All', test: () => true },
  ]
  return <CollectionPage c={ORDER} columns={columns} filters={filters} defaultSort={{ key: 'status', dir: 1 }} />
}

/** Next step for an order, as a single obvious button. */
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  requested: { to: 'approved', label: 'Approve' },
  approved: { to: 'ordered', label: 'Mark ordered' },
  ordered: { to: 'shipped', label: 'Mark shipped' },
}

export function useReceiveOrder() {
  const { commit, user } = useStore()
  const toast = useToast()
  const dialog = useDialog()
  return async (r: Rec<Order>) => {
    const stocked = (r.data.lines ?? []).filter((l) => l.item && Number(l.qty) > 0)
    const ok = await dialog.confirm({
      title: `Mark “${r.data.title}” received?`,
      message: stocked.length
        ? `This adds ${stocked.length} line${stocked.length > 1 ? 's' : ''} to stock and counts the order as spent.`
        : 'No lines are linked to inventory items, so stock won’t change.',
      confirmLabel: 'Mark received',
    })
    if (!ok) return
    const date = today()
    const ops: Op[] = [
      { op: 'update', id: r.id, version: r.version, data: { ...r.data, status: 'received', receivedAt: r.data.receivedAt ?? date } },
      ...stocked.map<Op>((l) => ({
        op: 'create',
        id: newId(),
        type: 'movement',
        data: { item: l.item, kind: 'received', qty: Number(l.qty), date, order: r.id, by: user.name },
      })),
    ]
    try {
      await commit(ops)
      toast(stocked.length ? `Received — stock updated for ${stocked.length} item${stocked.length > 1 ? 's' : ''}` : 'Marked received', { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }
}

export function OrderDetail({ id }: { id: string }) {
  const { update } = useStore()
  const toast = useToast()
  const receive = useReceiveOrder()
  const advance = async (r: Rec<Order>, to: OrderStatus) => {
    const patch: Partial<Order> = { status: to }
    if (to === 'ordered' && !r.data.orderedAt) patch.orderedAt = today()
    try {
      await update(r as Rec, { ...r.data, ...patch })
      toast(`${r.data.title}: ${labelOf(ORDER_STATUSES, to)}`, { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }
  return (
    <RecordDetail
      c={ORDER}
      id={id}
      badge={(r) => <StatusBadge status={String(r.data.status)} />}
      actions={(rr) => {
        const r = rr as Rec<Order>
        const next = NEXT[r.data.status]
        return (
          <>
            {r.data.url && <LinkButton href={r.data.url} external icon="external">Order page</LinkButton>}
            {r.data.status !== 'cancelled' && r.data.status !== 'received' && (
              <Button variant="ghost" onClick={() => advance(r, 'cancelled')}>Cancel order</Button>
            )}
            {next && <Button onClick={() => advance(r, next.to)}>{next.label}</Button>}
            {OPEN_STATUSES.has(r.data.status) && r.data.status !== 'requested' && (
              <Button variant="primary" icon="check" onClick={() => receive(r)}>Receive</Button>
            )}
          </>
        )
      }}
    >
      {(r) => {
        const o = r.data as unknown as Order
        return (
          <section className="card order-summary">
            <div className="stock-figures">
              <div>
                <span className="stat-label">Total</span>
                <span className="stat-value">{fmtMoney(orderTotal(o))}</span>
                {o.shipping ? <span className="stat-sub">incl. {fmtMoney(o.shipping)} shipping & fees</span> : null}
              </div>
              <div>
                <span className="stat-label">Expected</span>
                <span className="stat-value small-value">{fmtDate(o.expectedAt)}</span>
                <DueText order={o} />
              </div>
              <div>
                <span className="stat-label">Budget</span>
                <span className="stat-value small-value"><RefLink id={o.budget} /></span>
              </div>
            </div>
          </section>
        )
      }}
    </RecordDetail>
  )
}

/* ======================= budget ======================= */

export function BudgetPage() {
  const summary = useBudgetSummary()
  const openEditor = useEditor()
  const totals = summary.reduce(
    (t, s) => ({
      allocated: t.allocated + s.allocated,
      committed: t.committed + s.committed,
      spent: t.spent + s.spent,
      requested: t.requested + s.requested,
    }),
    { allocated: 0, committed: 0, spent: 0, requested: 0 },
  )
  const remaining = totals.allocated - totals.spent - totals.committed

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Budget</h1>
          <p className="muted">{BUDGET.blurb} Spent = received orders. Committed = approved, ordered or shipped.</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => openEditor({ type: 'budget' })}>Add budget line</Button>
      </header>

      <div className="stats">
        <Stat label="Allocated" value={fmtMoney(totals.allocated, true)} />
        <Stat label="Spent" value={fmtMoney(totals.spent, true)} />
        <Stat label="Committed" value={fmtMoney(totals.committed, true)} sub="approved & on order" />
        <Stat label="Remaining" value={fmtMoney(remaining, true)} tone={remaining < 0 ? 'bad' : undefined} sub={totals.requested ? `${fmtMoney(totals.requested, true)} awaiting approval` : undefined} />
      </div>

      {summary.length === 0 ? (
        <Empty title="No budget lines yet" action={<Button variant="primary" icon="plus" onClick={() => openEditor({ type: 'budget' })}>Add a budget line</Button>}>
          Add a line for each pot of money (e.g. “Propulsion — FY26”). Then pick it on orders to track spend.
        </Empty>
      ) : (
        <div className="budget-list">
          {summary.map((s) => <BudgetRow key={s.rec?.id ?? 'none'} s={s} />)}
        </div>
      )}
    </div>
  )
}

function BudgetRow({ s }: { s: BudgetSummary }) {
  const left = s.allocated - s.spent - s.committed
  const over = s.rec && left < 0
  const pct = s.allocated ? Math.round(((s.spent + s.committed) / s.allocated) * 100) : null
  return (
    <a className="card budget-row" href={s.rec ? href('budget', s.rec.id) : href('orders') + '?f=all'}>
      <div className="budget-row-head">
        <div>
          <span className="strong">{s.rec ? BUDGET.title(s.rec.data) : 'Not assigned to a budget'}</span>
          {s.rec && BUDGET.subtitle?.(s.rec.data) && <span className="muted small"> · {BUDGET.subtitle(s.rec.data)}</span>}
        </div>
        <div className="budget-row-figs">
          {s.rec ? (
            <>
              <span className={over ? 'text-bad strong' : 'strong'}>{fmtMoney(left, true)} {over ? 'over' : 'left'}</span>
              <span className="muted small">of {fmtMoney(s.allocated, true)}{pct != null ? ` · ${pct}% used` : ''}</span>
            </>
          ) : (
            <span className="muted small">{fmtMoney(s.spent + s.committed, true)} across {s.orders.length} orders</span>
          )}
        </div>
      </div>
      {s.rec && (
        <Meter
          max={s.allocated}
          parts={[
            { label: 'Spent', value: s.spent, tone: over ? 'bad' : 'accent' },
            { label: 'Committed', value: s.committed, tone: 'warn' },
          ]}
        />
      )}
      <div className="budget-legend small muted">
        <span><i className="dot bg-accent" /> Spent {fmtMoney(s.spent, true)}</span>
        <span><i className="dot bg-warn" /> Committed {fmtMoney(s.committed, true)}</span>
        {s.requested > 0 && <span>Requested {fmtMoney(s.requested, true)}</span>}
      </div>
    </a>
  )
}

export function BudgetDetail({ id }: { id: string }) {
  const summary = useBudgetSummary()
  const s = summary.find((x) => x.rec?.id === id)
  const orders = useMemo(
    () => [...(s?.orders ?? [])].sort((a, b) => (b.data.orderedAt ?? b.createdAt).localeCompare(a.data.orderedAt ?? a.createdAt)),
    [s],
  )
  return (
    <RecordDetail c={BUDGET} id={id}>
      {() =>
        s && (
          <>
            <BudgetRow s={s} />
            <section className="card">
              <h2 className="card-title">Orders against this budget</h2>
              {orders.length === 0 ? (
                <p className="muted">No orders yet. Pick this budget on an order to track it here.</p>
              ) : (
                <div className="table-wrap flat">
                  <table className="table compact">
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} onClick={() => (window.location.hash = href('orders', o.id))}>
                          <td className="strong">{o.data.title}</td>
                          <td><StatusBadge status={o.data.status} /></td>
                          <td className="nowrap hide-s">{fmtDate(o.data.orderedAt)}</td>
                          <td className="num strong">{fmtMoney(orderTotal(o.data))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )
      }
    </RecordDetail>
  )
}
