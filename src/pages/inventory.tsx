import { useMemo } from 'react'
import { CollectionPage, type Column, type Filter } from '../components/CollectionPage'
import { useEditor } from '../components/Editor'
import { RefLink } from '../components/fields'
import { RecordDetail } from '../components/RecordDetail'
import { Badge, Button, LinkButton } from '../components/ui'
import { fmtAgo, fmtDate, fmtMoney, fmtQty, movementDelta, personName, stockLevel, useOnOrder, useStock } from '../lib/derive'
import { href } from '../lib/router'
import { byType, ITEM_KINDS, MOVEMENT_KINDS, labelOf, toneOf } from '../lib/schema'
import { useRecords, useStore } from '../lib/store'
import type { Item, Movement, Order, Rec } from '../lib/types'

const ITEM = byType.get('item')!
const LOG = byType.get('movement')!

export function StockBadge({ item, qty }: { item: Item; qty: number }) {
  const lvl = stockLevel(item, qty)
  if (lvl === 'out') return <Badge tone="bad">Out</Badge>
  if (lvl === 'low') return <Badge tone="warn">Low</Badge>
  return null
}

export function InventoryList() {
  const stock = useStock()
  const onOrder = useOnOrder()
  const openEditor = useEditor()

  const columns: Column<Item>[] = useMemo(
    () => [
      {
        key: 'stock',
        label: 'In stock',
        className: 'num',
        sort: (r) => stock.get(r.id) ?? 0,
        render: (r) => {
          const q = stock.get(r.id) ?? 0
          return (
            <span className="stock-cell">
              <StockBadge item={r.data} qty={q} />
              <span className="num strong">{fmtQty(q, r.data.unit)}</span>
            </span>
          )
        },
      },
      {
        key: 'onOrder',
        label: 'On order',
        className: 'num hide-s',
        sort: (r) => onOrder.get(r.id) ?? 0,
        render: (r) => (onOrder.get(r.id) ? <span className="num">{fmtQty(onOrder.get(r.id)!, r.data.unit)}</span> : <span className="muted">—</span>),
      },
      {
        key: 'kind',
        label: 'Type',
        className: 'hide-s',
        sort: (r) => r.data.kind ?? '',
        render: (r) => <Badge tone={toneOf(ITEM_KINDS, r.data.kind)}>{labelOf(ITEM_KINDS, r.data.kind)}</Badge>,
      },
      { key: 'location', label: 'Location', sort: (r) => r.data.location ?? '', render: (r) => r.data.location ?? <span className="muted">—</span> },
      {
        key: 'actions',
        label: '',
        className: 'row-actions',
        render: (r) => (
          <span className="row gap-xs" onClick={(e) => e.stopPropagation()}>
            {r.data.kind === 'made' && (
              <Button small onClick={() => openEditor({ type: 'movement', initial: { item: r.id, kind: 'made', process: r.data.process } })}>
                Log build
              </Button>
            )}
            <Button small onClick={() => openEditor({ type: 'movement', initial: { item: r.id, kind: 'used' } })}>
              Use
            </Button>
          </span>
        ),
      },
    ],
    [stock, onOrder, openEditor],
  )

  const filters: Filter<Item>[] = useMemo<Filter<Item>[]>(
    () => [
      { key: 'all', label: 'All', test: () => true },
      {
        key: 'low',
        label: 'Needs reorder',
        test: (r) => ['low', 'out'].includes(stockLevel(r.data, stock.get(r.id) ?? 0)) && r.data.minQty != null,
      },
      { key: 'made', label: 'Made', test: (r) => r.data.kind === 'made' },
      { key: 'bought', label: 'Bought', test: (r) => r.data.kind === 'bought' || r.data.kind === 'consumable' || r.data.kind === 'raw' },
      { key: 'tool', label: 'Tools', test: (r) => r.data.kind === 'tool' },
    ],
    [stock],
  )

  return <CollectionPage c={ITEM} columns={columns} filters={filters} />
}

export function ItemDetail({ id }: { id: string }) {
  const stock = useStock()
  const onOrder = useOnOrder()
  const openEditor = useEditor()
  const movements = useRecords<Movement>('movement')
  const orders = useRecords<Order>('order')
  const { records } = useStore()

  const log = useMemo(
    () =>
      movements
        .filter((m) => m.data.item === id)
        .sort((a, b) => (b.data.date ?? b.createdAt).localeCompare(a.data.date ?? a.createdAt) || b.createdAt.localeCompare(a.createdAt)),
    [movements, id],
  )
  const openOrders = orders.filter(
    (o) => ['requested', 'approved', 'ordered', 'shipped'].includes(o.data.status) && o.data.lines?.some((l) => l.item === id),
  )

  return (
    <RecordDetail
      c={ITEM}
      id={id}
      badge={(r) => <StockBadge item={r.data as Item} qty={stock.get(r.id) ?? 0} />}
      actions={(r) => {
        const item = r.data as Item
        const qty = stock.get(r.id) ?? 0
        const suggested = Math.max(1, (item.minQty ?? 0) * 2 - qty)
        return (
          <>
            {item.orderUrl && <LinkButton href={item.orderUrl} external icon="external">Supplier page</LinkButton>}
            <Button
              icon="cart"
              onClick={() =>
                openEditor({
                  type: 'order',
                  heading: `Order more ${item.name}`,
                  initial: {
                    title: `Restock ${item.name}`,
                    supplier: item.supplier,
                    lines: [{ item: r.id, qty: suggested, unitPrice: item.unitCost }],
                  },
                })
              }
            >
              Order more
            </Button>
          </>
        )
      }}
    >
      {(r) => {
        const item = r.data as Item
        const qty = stock.get(r.id) ?? 0
        const value = item.unitCost != null ? qty * item.unitCost : null
        return (
          <>
            <section className="stock-panel card">
              <div className="stock-figures">
                <div>
                  <span className="stat-label">In stock</span>
                  <span className="stat-value">{fmtQty(qty, item.unit)}</span>
                  {item.minQty != null && <span className="stat-sub">Reorder at {item.minQty}</span>}
                </div>
                <div>
                  <span className="stat-label">On order</span>
                  <span className="stat-value">{fmtQty(onOrder.get(r.id) ?? 0, item.unit)}</span>
                  {openOrders.length > 0 && (
                    <span className="stat-sub">
                      {openOrders.map((o) => (
                        <a key={o.id} href={href('orders', o.id)}>{o.data.title}</a>
                      ))}
                    </span>
                  )}
                </div>
                <div>
                  <span className="stat-label">Stock value</span>
                  <span className="stat-value">{value != null ? fmtMoney(value, true) : '—'}</span>
                  {item.unitCost != null && <span className="stat-sub">{fmtMoney(item.unitCost)} each</span>}
                </div>
              </div>
              <div className="row gap-s wrap">
                {item.kind === 'made' && (
                  <Button variant="primary" icon="wrench" onClick={() => openEditor({ type: 'movement', initial: { item: r.id, kind: 'made', process: item.process } })}>
                    Log a build
                  </Button>
                )}
                <Button onClick={() => openEditor({ type: 'movement', initial: { item: r.id, kind: 'received' } })}>Receive</Button>
                <Button onClick={() => openEditor({ type: 'movement', initial: { item: r.id, kind: 'used' } })}>Use</Button>
                <Button onClick={() => openEditor({ type: 'movement', initial: { item: r.id, kind: 'adjusted', qty: 0 } })}>Correct count</Button>
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">Log <span className="muted small">— every change to stock</span></h2>
              {log.length === 0 ? (
                <p className="muted">Nothing logged yet. Stock is 0 until something is made, received or counted.</p>
              ) : (
                <MovementTable rows={log} showItem={false} records={records} />
              )}
            </section>
          </>
        )
      }}
    </RecordDetail>
  )
}

function MovementTable({ rows, showItem, records }: { rows: Rec<Movement>[]; showItem: boolean; records: Map<string, Rec> }) {
  const openEditor = useEditor()
  return (
    <div className="table-wrap flat">
      <table className="table compact">
        <thead>
          <tr>
            <th>Date</th>
            <th>What</th>
            {showItem && <th>Item</th>}
            <th className="num">Change</th>
            <th className="hide-s">Details</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const d = movementDelta(m.data)
            const item = records.get(m.data.item)?.data as Item | undefined
            return (
              <tr key={m.id} tabIndex={0} onClick={() => openEditor({ type: 'movement', record: m as Rec })} className={m.pending ? 'pending' : undefined}>
                <td className="nowrap">{fmtDate(m.data.date ?? m.createdAt)}</td>
                <td><Badge tone={toneOf(MOVEMENT_KINDS, m.data.kind)}>{labelOf(MOVEMENT_KINDS, m.data.kind)}</Badge></td>
                {showItem && <td><RefLink id={m.data.item} /></td>}
                <td className={`num strong ${d < 0 ? 'text-bad' : 'text-good'}`}>
                  {d > 0 ? '+' : ''}
                  {fmtQty(d, item?.unit)}
                </td>
                <td className="hide-s small">
                  {[
                    m.data.process && <RefLink key="p" id={m.data.process} />,
                    m.data.order && <RefLink key="o" id={m.data.order} />,
                    m.data.serials && <span key="s" className="mono">{m.data.serials}</span>,
                    m.data.lot && <span key="l" className="mono">lot {m.data.lot}</span>,
                    m.data.notes && <span key="n" className="muted">{m.data.notes}</span>,
                  ]
                    .filter(Boolean)
                    .reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}
                </td>
                <td className="nowrap small">{m.data.by || personName(m.createdBy)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function LogList() {
  const { records } = useStore()
  const filters: Filter<Movement>[] = [
    { key: 'all', label: 'Everything', test: () => true },
    { key: 'made', label: 'Builds', test: (r) => r.data.kind === 'made' },
    { key: 'received', label: 'Received', test: (r) => r.data.kind === 'received' },
    { key: 'used', label: 'Used & scrapped', test: (r) => r.data.kind === 'used' || r.data.kind === 'scrapped' },
  ]
  const columns: Column<Movement>[] = [
    { key: 'date', label: 'Date', sort: (r) => r.data.date ?? r.createdAt, render: (r) => <span className="nowrap">{fmtDate(r.data.date ?? r.createdAt)}</span> },
    { key: 'kind', label: 'What', sort: (r) => r.data.kind, render: (r) => <Badge tone={toneOf(MOVEMENT_KINDS, r.data.kind)}>{labelOf(MOVEMENT_KINDS, r.data.kind)}</Badge> },
    { key: 'item', label: 'Item', sort: (r) => String(records.get(r.data.item)?.data.name ?? ''), render: (r) => <RefLink id={r.data.item} /> },
    {
      key: 'qty',
      label: 'Change',
      className: 'num',
      sort: (r) => movementDelta(r.data),
      render: (r) => {
        const d = movementDelta(r.data)
        return <span className={`num strong ${d < 0 ? 'text-bad' : 'text-good'}`}>{d > 0 ? '+' : ''}{d}</span>
      },
    },
    { key: 'process', label: 'Process / order', className: 'hide-s', render: (r) => (r.data.process ? <RefLink id={r.data.process} /> : r.data.order ? <RefLink id={r.data.order} /> : <span className="muted">—</span>) },
    { key: 'by', label: 'By', sort: (r) => r.data.by ?? r.createdBy ?? '', render: (r) => <span className="nowrap">{r.data.by || personName(r.createdBy)}</span> },
  ]
  return (
    <CollectionPage
      c={LOG}
      columns={columns}
      filters={filters}
      detail={false}
      titleColumn={false}
      defaultSort={{ key: 'date', dir: -1 }}
    />
  )
}

export function RecentBuilds({ processId }: { processId: string }) {
  const movements = useRecords<Movement>('movement')
  const builds = movements
    .filter((m) => m.data.process === processId && m.data.kind === 'made')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10)
  if (!builds.length) return <p className="muted">No builds logged against this process yet.</p>
  return (
    <ul className="plain-list">
      {builds.map((b) => (
        <li key={b.id}>
          <span className="strong">+{b.data.qty}</span> <RefLink id={b.data.item} />{' '}
          <span className="muted small">{b.data.by || personName(b.createdBy)} · {fmtAgo(b.createdAt)}</span>
        </li>
      ))}
    </ul>
  )
}

