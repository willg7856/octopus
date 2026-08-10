import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import { useConfirm } from './ConfirmDialog'
import { SyncBar } from './SyncBar'
import {
  HARDWARE_KIND_LABELS,
  INVENTORY_KINDS,
  STOCK_STATUS_LABELS,
  STOCK_STATUS_ORDER,
  applyInventoryStockRules,
  formatMoney,
  hardwareStatusForStock,
  isInventoryKind,
  isOrderOverdue,
  newId,
  sortUnits,
  stockStatusAfterReceive,
  stockStatusLabel,
  stockStatusOf,
  unitOnOrderQty,
  unitPriceOf,
  unitQuantity,
} from '../hardwareData'
import type {
  HardwareKind,
  HardwareProgressNote,
  HardwareUnit,
  StockStatus,
} from '../types'
import { useLabStore } from '../useLabStore'
import { SyncStatusBanners } from './SyncStatusBanners'

const KIND_OPTIONS = INVENTORY_KINDS.map(
  (kind) => [kind, HARDWARE_KIND_LABELS[kind]] as const,
)
const STATUS_OPTIONS = STOCK_STATUS_ORDER.map(
  (status) => [status, STOCK_STATUS_LABELS[status]] as const,
)

type AttentionFilter = 'all' | 'attention' | 'low' | 'on-order' | 'overdue' | 'quarantine'
type InventoryKind = 'part' | 'consumable' | 'tool' | 'electronics' | 'other'
type KindFilter = 'all' | InventoryKind

const ATTENTION_STATUSES: StockStatus[] = [
  'low',
  'on-order',
  'quarantine',
  'depleted',
]

function matchesAttention(unit: HardwareUnit, filter: AttentionFilter) {
  const status = stockStatusOf(unit)
  if (filter === 'all') return true
  if (filter === 'attention') {
    return ATTENTION_STATUSES.includes(status) || isOrderOverdue(unit)
  }
  if (filter === 'overdue') return isOrderOverdue(unit)
  return status === filter
}

function matchesKind(unit: HardwareUnit, filter: KindFilter) {
  if (filter === 'all') return true
  return unit.kind === filter
}

export function InventoryPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, saving, conflict, toast, updatedAt, updatedBy, hasLoaded } =
    store
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AttentionFilter>('all')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [programFilter, setProgramFilter] = useState<string>('all')
  const [adding, setAdding] = useState(false)
  const [mobileMode, setMobileMode] = useState<'list' | 'detail'>('list')

  const units = useMemo(
    () => sortUnits(lab.units.filter((u) => isInventoryKind(u.kind))),
    [lab.units],
  )

  const attentionCounts = useMemo(() => {
    let attention = 0
    let low = 0
    let onOrder = 0
    let overdue = 0
    let quarantine = 0
    for (const unit of units) {
      if (!matchesKind(unit, kindFilter)) continue
      const status = stockStatusOf(unit)
      const overdueOrder = isOrderOverdue(unit)
      if (ATTENTION_STATUSES.includes(status) || overdueOrder) attention += 1
      if (status === 'low') low += 1
      if (status === 'on-order') onOrder += 1
      if (overdueOrder) overdue += 1
      if (status === 'quarantine') quarantine += 1
    }
    return { attention, low, onOrder, overdue, quarantine }
  }, [units, kindFilter])

  const kindCounts = useMemo(() => {
    const counts: Record<KindFilter, number> = {
      all: 0,
      part: 0,
      consumable: 0,
      tool: 0,
      electronics: 0,
      other: 0,
    }
    for (const unit of units) {
      if (!matchesAttention(unit, filter)) continue
      counts.all += 1
      if (
        unit.kind === 'part' ||
        unit.kind === 'consumable' ||
        unit.kind === 'tool' ||
        unit.kind === 'electronics' ||
        unit.kind === 'other'
      ) {
        counts[unit.kind] += 1
      }
    }
    return counts
  }, [units, filter])

  const programOptions = useMemo(() => {
    const set = new Set<string>()
    for (const unit of units) {
      const program = unit.program?.trim()
      if (program) set.add(program)
    }
    // Also offer vehicle names from hardware as convenient program tags
    for (const unit of lab.units) {
      if (unit.kind === 'vehicle' && unit.name.trim()) set.add(unit.name.trim())
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [units, lab.units])


  const inventoryTotals = useMemo(() => {
    let onHand = 0
    let onOrder = 0
    let onHandValue = 0
    let onOrderValue = 0
    let priced = 0
    for (const unit of units) {
      const hand = unitQuantity(unit)
      const ordered = unitOnOrderQty(unit)
      const price = unitPriceOf(unit)
      onHand += hand
      onOrder += ordered
      if (price != null) {
        priced += 1
        onHandValue += hand * price
        onOrderValue += ordered * price
      }
    }
    return {
      items: units.length,
      onHand,
      onOrder,
      onHandValue,
      onOrderValue,
      priced,
    }
  }, [units])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return units.filter((u) => {
      if (!matchesAttention(u, filter)) return false
      if (!matchesKind(u, kindFilter)) return false
      if (programFilter === 'none' && u.program?.trim()) return false
      if (
        programFilter !== 'all' &&
        programFilter !== 'none' &&
        (u.program?.trim() || '') !== programFilter
      ) {
        return false
      }
      if (!q) return true
      return [
        u.name,
        u.serial,
        u.location,
        u.owner,
        u.partNumber,
        u.kind,
        u.status,
        u.orderUrl,
        u.program,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [units, query, filter, kindFilter, programFilter])

  const selected =
    units.find((u) => u.id === selectedId) ??
    (mobileMode === 'detail' ? null : filtered[0] ?? null)

  function openDetail(id: string | null, isAdding = false) {
    setAdding(isAdding)
    setSelectedId(id)
    setMobileMode('detail')
  }

  function patchUnit(
    id: string,
    patch: (unit: HardwareUnit) => HardwareUnit,
    message: string,
    noteText?: string,
  ) {
    void store.commit((prev) => {
      const current = prev.units.find((u) => u.id === id)
      if (!current || !isInventoryKind(current.kind)) return prev
      const nextUnit = patch(current)
      const progressNote: HardwareProgressNote | null = noteText
        ? {
            id: newId('pg'),
            unitId: id,
            date: nextUnit.updatedAt.slice(0, 10),
            status: nextUnit.status,
            note: noteText,
            author: user?.name,
          }
        : null
      return {
        ...prev,
        units: prev.units.map((u) => (u.id === id ? nextUnit : u)),
        progress: progressNote
          ? [progressNote, ...prev.progress]
          : prev.progress,
      }
    }, message)
  }

  function adjustQty(id: string, delta: number) {
    patchUnit(
      id,
      (unit) => {
        const qty = Math.max(0, unitQuantity(unit) + delta)
        const stockStatus = applyInventoryStockRules(
          stockStatusOf(unit),
          qty,
          unit.minQty,
        )
        return {
          ...unit,
          quantity: qty,
          stockStatus,
          status: hardwareStatusForStock(stockStatus),
          updatedAt: new Date().toISOString(),
        }
      },
      delta >= 0 ? `Qty +${delta}` : `Qty ${delta}`,
      delta >= 0 ? `Qty +${delta}` : `Qty ${delta}`,
    )
  }

  function receiveOne(id: string) {
    patchUnit(
      id,
      (unit) => {
        const onHand = unitQuantity(unit) + 1
        const status = stockStatusOf(unit)
        const inPipeline =
          status === 'on-order' ||
          status === 'receiving' ||
          status === 'incoming'
        const outstanding = unitOnOrderQty(unit)
        const fromOrder = outstanding > 0 ? outstanding : inPipeline ? 1 : 0
        const nextOnOrder = Math.max(0, fromOrder - 1)
        const updatedAt = new Date().toISOString()

        if (nextOnOrder > 0) {
          return {
            ...unit,
            quantity: onHand,
            onOrderQty: nextOnOrder,
            stockStatus: status === 'incoming' ? 'receiving' : 'on-order',
            status: hardwareStatusForStock(
              status === 'incoming' ? 'receiving' : 'on-order',
            ),
            updatedAt,
          }
        }

        const stockStatus = stockStatusAfterReceive(onHand, unit.minQty)
        const { orderedAt: _o, expectedAt: _e, ...rest } = unit
        return {
          ...rest,
          quantity: onHand,
          onOrderQty: undefined,
          stockStatus,
          status: hardwareStatusForStock(stockStatus),
          updatedAt,
        }
      },
      'Received +1',
      'Received +1 into on hand',
    )
  }

  function saveUnit(
    input: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string },
  ) {
    const kind = isInventoryKind(input.kind) ? input.kind : 'other'
    const qty =
      typeof input.quantity === 'number' && Number.isFinite(input.quantity)
        ? input.quantity
        : 1
    const onOrder =
      typeof input.onOrderQty === 'number' &&
      Number.isFinite(input.onOrderQty) &&
      input.onOrderQty > 0
        ? Math.floor(input.onOrderQty)
        : 0
    let stockStatus = applyInventoryStockRules(
      input.stockStatus ?? 'in-stock',
      qty,
      input.minQty,
    )
    // Having outstanding order qty should keep the item in the order pipeline.
    if (
      onOrder > 0 &&
      (stockStatus === 'in-stock' ||
        stockStatus === 'low' ||
        stockStatus === 'depleted' ||
        stockStatus === 'on-order' ||
        stockStatus === 'receiving' ||
        stockStatus === 'incoming')
    ) {
      if (
        stockStatus !== 'on-order' &&
        stockStatus !== 'receiving' &&
        stockStatus !== 'incoming'
      ) {
        stockStatus = 'on-order'
      }
    }
    const price =
      typeof input.unitPrice === 'number' &&
      Number.isFinite(input.unitPrice) &&
      input.unitPrice >= 0
        ? input.unitPrice
        : undefined
    const updatedAtNow = new Date().toISOString()
    const resolved = {
      ...input,
      kind,
      stockStatus,
      status: hardwareStatusForStock(stockStatus),
      quantity: qty,
      onOrderQty: onOrder > 0 ? onOrder : undefined,
      unitPrice: price,
      updatedAt: updatedAtNow,
    }

    if (input.id) {
      void store.commit(
        (prev) => ({
          ...prev,
          units: prev.units.map((u) =>
            u.id === input.id ? { ...u, ...resolved } : u,
          ),
        }),
        'Saved',
      )
      return
    }

    const next: HardwareUnit = {
      ...resolved,
      id: newId('hw'),
    }
    const note: HardwareProgressNote = {
      id: newId('pg'),
      unitId: next.id,
      date: updatedAtNow.slice(0, 10),
      status: next.status,
      note: 'Added to inventory',
      author: user?.name,
    }
    void store.commit(
      (prev) => ({
        ...prev,
        units: [...prev.units, next],
        progress: [note, ...prev.progress],
      }),
      'Added',
    )
    openDetail(next.id)
  }

  async function removeUnit(id: string) {
    const unit = lab.units.find((u) => u.id === id)
    if (!unit) return
    const ok = await confirm(`Remove “${unit.name}” from inventory?`)
    if (!ok) return
    void store.commit(
      (prev) => ({
        ...prev,
        units: prev.units.filter((u) => u.id !== id),
        progress: prev.progress.filter((p) => p.unitId !== id),
        tests: prev.tests.map((t) => ({
          ...t,
          unitIds: t.unitIds.filter((uid) => uid !== id),
        })),
        processes: prev.processes.map((p) => ({
          ...p,
          steps: p.steps.map((s) => ({
            ...s,
            linkedUnitIds: (s.linkedUnitIds ?? []).filter((uid) => uid !== id),
          })),
        })),
      }),
      'Removed',
    )
    setSelectedId(null)
    setMobileMode('list')
  }

  const filterChips: { id: AttentionFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All status' },
    {
      id: 'attention',
      label: 'Needs attention',
      count: attentionCounts.attention,
    },
    { id: 'low', label: 'Low', count: attentionCounts.low },
    { id: 'on-order', label: 'On order', count: attentionCounts.onOrder },
    { id: 'overdue', label: 'Overdue', count: attentionCounts.overdue },
    {
      id: 'quarantine',
      label: 'Quarantine',
      count: attentionCounts.quarantine,
    },
  ]

  const kindChips: { id: KindFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All types', count: kindCounts.all },
    ...(
      ['part', 'consumable', 'tool', 'electronics', 'other'] as const
    ).map((kind) => ({
      id: kind as KindFilter,
      label: HARDWARE_KIND_LABELS[kind],
      count: kindCounts[kind],
    })),
  ]

  const programChips: { id: string; label: string }[] = [
    { id: 'all', label: 'All programs' },
    { id: 'none', label: 'No program' },
    ...programOptions.map((program) => ({ id: program, label: program })),
  ]

  return (
    <main className="simple-page" aria-label="Inventory">
      <header className="simple-head">
        <div>
          <div className="simple-title-row">
            <h2>Inventory</h2>
            {sync !== 'loading' ? (
              <p className="inv-total-count" aria-live="polite">
                <strong>{inventoryTotals.items}</strong>
                {inventoryTotals.items === 1 ? ' item' : ' items'}
                <span className="inv-total-sep" aria-hidden="true">
                  ·
                </span>
                <span>
                  {inventoryTotals.onHand} on hand
                  {inventoryTotals.onOrder > 0
                    ? ` · ${inventoryTotals.onOrder} on order`
                    : ''}
                </span>
                {inventoryTotals.priced > 0 ? (
                  <>
                    <span className="inv-total-sep" aria-hidden="true">
                      ·
                    </span>
                    <span title="Sum of on-hand qty × unit price for priced items">
                      {formatMoney(inventoryTotals.onHandValue)} on hand
                      {inventoryTotals.onOrderValue > 0
                        ? ` · ${formatMoney(inventoryTotals.onOrderValue)} on order`
                        : ''}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <p className="simple-muted">
            Stock room — parts, consumables, tools, electronics. Different fields than Hardware.
          </p>
        </div>
        <div className="simple-head-actions">
          <SyncBar
            sync={sync}
            saving={saving}
            conflict={conflict}
            updatedAt={updatedAt}
            updatedBy={updatedBy}
            lab={lab}
            onRefresh={() => void store.refresh({ quiet: true })}
          />
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => openDetail(null, true)}
            disabled={!hasLoaded}
          >
            Add item
          </button>
        </div>
      </header>

      <SyncStatusBanners store={store} />

      {sync === 'loading' || (sync === 'error' && !hasLoaded) ? (
        <p className="simple-muted">
          {sync === 'loading'
            ? 'Loading…'
            : 'Could not load shared lab. Retry above — do not add items until it recovers.'}
        </p>
      ) : (
        <div className="simple-split" data-mode={mobileMode}>
          <section className="simple-list-panel">
            <div className="inv-filters-desktop">
              <div
                className="inv-filter-row"
                role="toolbar"
                aria-label="Type filters"
              >
                {kindChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className="inv-filter-chip"
                    aria-pressed={kindFilter === chip.id}
                    onClick={() => setKindFilter(chip.id)}
                  >
                    {chip.label}
                    {chip.count != null && chip.count > 0 ? (
                      <span className="inv-filter-count">{chip.count}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div
                className="inv-filter-row"
                role="toolbar"
                aria-label="Program filters"
              >
                {programChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className="inv-filter-chip"
                    aria-pressed={programFilter === chip.id}
                    onClick={() => setProgramFilter(chip.id)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div
                className="inv-filter-row"
                role="toolbar"
                aria-label="Stock status filters"
              >
                {filterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className="inv-filter-chip"
                    aria-pressed={filter === chip.id}
                    onClick={() => setFilter(chip.id)}
                  >
                    {chip.label}
                    {chip.count != null && chip.count > 0 ? (
                      <span className="inv-filter-count">{chip.count}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
            <details className="inv-filters-mobile">
              <summary>
                Filters
                {filter !== 'all' ||
                kindFilter !== 'all' ||
                programFilter !== 'all'
                  ? ' · active'
                  : ''}
              </summary>
              <div
                className="inv-filter-row"
                role="toolbar"
                aria-label="Type filters"
              >
                {kindChips.map((chip) => (
                  <button
                    key={`m-${chip.id}`}
                    type="button"
                    className="inv-filter-chip"
                    aria-pressed={kindFilter === chip.id}
                    onClick={() => setKindFilter(chip.id)}
                  >
                    {chip.label}
                    {chip.count != null && chip.count > 0 ? (
                      <span className="inv-filter-count">{chip.count}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div
                className="inv-filter-row"
                role="toolbar"
                aria-label="Program filters"
              >
                {programChips.map((chip) => (
                  <button
                    key={`m-${chip.id}`}
                    type="button"
                    className="inv-filter-chip"
                    aria-pressed={programFilter === chip.id}
                    onClick={() => setProgramFilter(chip.id)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <div
                className="inv-filter-row"
                role="toolbar"
                aria-label="Stock status filters"
              >
                {filterChips.map((chip) => (
                  <button
                    key={`m-${chip.id}`}
                    type="button"
                    className="inv-filter-chip"
                    aria-pressed={filter === chip.id}
                    onClick={() => setFilter(chip.id)}
                  >
                    {chip.label}
                    {chip.count != null && chip.count > 0 ? (
                      <span className="inv-filter-count">{chip.count}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </details>
            <input
              className="simple-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search inventory"
            />
            <ul className="simple-list">
              {filtered.map((unit) => {
                const status = stockStatusOf(unit)
                const onOrder = unitOnOrderQty(unit)
                const price = unitPriceOf(unit)
                const overdue = isOrderOverdue(unit)
                const canReceive =
                  onOrder > 0 ||
                  status === 'on-order' ||
                  status === 'receiving' ||
                  status === 'incoming'
                return (
                  <li key={unit.id}>
                    <div
                      className="simple-list-row inv-list-row"
                      data-selected={
                        !adding && selected?.id === unit.id ? 'true' : 'false'
                      }
                      data-overdue={overdue ? 'true' : undefined}
                    >
                      <button
                        type="button"
                        className="simple-list-main"
                        onClick={() => openDetail(unit.id)}
                      >
                        <span>
                          <strong>{unit.name}</strong>
                          <span className="simple-muted">
                            {HARDWARE_KIND_LABELS[unit.kind]}
                            {unit.program?.trim()
                              ? ` · ${unit.program.trim()}`
                              : ''}{' '}
                            · on hand {unitQuantity(unit)}
                            {onOrder > 0 ? ` · on order ${onOrder}` : ''}
                            {price != null ? ` · ${formatMoney(price)}/ea` : ''}
                            {unit.minQty != null ? ` · min ${unit.minQty}` : ''}
                            {unit.location ? ` · ${unit.location}` : ''}
                            {unit.expectedAt ? (
                              <>
                                {' · '}
                                <span
                                  className={
                                    overdue ? 'inv-eta-overdue' : undefined
                                  }
                                >
                                  {overdue ? 'Overdue ' : 'ETA '}
                                  {formatOrderDate(unit.expectedAt)}
                                </span>
                              </>
                            ) : unit.orderedAt ? (
                              ` · ordered ${formatOrderDate(unit.orderedAt)}`
                            ) : (
                              ''
                            )}
                          </span>
                        </span>
                        <span
                          className="status-badge"
                          data-kind="stock"
                          data-status={overdue ? 'quarantine' : status}
                        >
                          {overdue ? 'Overdue' : stockStatusLabel(status)}
                        </span>
                      </button>
                      <div className="inv-qty-actions">
                        <button
                          type="button"
                          className="inv-qty-btn"
                          aria-label={`Decrease ${unit.name} on hand`}
                          disabled={unitQuantity(unit) <= 0}
                          onClick={(e) => {
                            e.stopPropagation()
                            adjustQty(unit.id, -1)
                          }}
                        >
                          −
                        </button>
                        <span
                          className="inv-qty-value"
                          title={
                            onOrder > 0
                              ? `On hand ${unitQuantity(unit)} · on order ${onOrder}`
                              : `On hand ${unitQuantity(unit)}`
                          }
                        >
                          {unitQuantity(unit)}
                          {onOrder > 0 ? (
                            <span className="inv-qty-on-order">/{onOrder}</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="inv-qty-btn"
                          aria-label={`Increase ${unit.name} on hand`}
                          onClick={(e) => {
                            e.stopPropagation()
                            adjustQty(unit.id, 1)
                          }}
                        >
                          +
                        </button>
                        {canReceive ? (
                          <button
                            type="button"
                            className="inv-qty-btn inv-qty-receive"
                            aria-label={`Receive one ${unit.name} from on order`}
                            onClick={(e) => {
                              e.stopPropagation()
                              receiveOne(unit.id)
                            }}
                          >
                            Recv
                          </button>
                        ) : null}
                        {unit.orderUrl ? (
                          <a
                            className="inv-order-link"
                            href={normalizeOrderUrl(unit.orderUrl)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Order
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
              {filtered.length === 0 ? (
                <li className="simple-muted">
                  {query.trim() ||
                  filter !== 'all' ||
                  kindFilter !== 'all' ||
                  programFilter !== 'all'
                    ? 'No stock matches that filter.'
                    : 'No stock yet — add parts, consumables, tools, or electronics.'}
                </li>
              ) : null}
            </ul>
          </section>

          <section className="simple-detail">
            <button
              type="button"
              className="btn btn-ghost simple-back"
              onClick={() => {
                setAdding(false)
                setMobileMode('list')
              }}
            >
              ← Back to list
            </button>
            {adding ? (
              <UnitForm
                key="new"
                submitLabel="Add"
                programOptions={programOptions}
                onCancel={() => {
                  setAdding(false)
                  setMobileMode('list')
                }}
                onSave={saveUnit}
              />
            ) : selected ? (
              <UnitForm
                key={selected.id}
                initial={selected}
                submitLabel="Save"
                programOptions={programOptions}
                onSave={saveUnit}
                onDelete={() => removeUnit(selected.id)}
              />
            ) : (
              <p className="simple-muted">Select an item or add one.</p>
            )}
          </section>
        </div>
      )}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
      {confirmDialog}
    </main>
  )
}

function fieldsFromUnit(unit?: HardwareUnit) {
  const kindRaw = unit && isInventoryKind(unit.kind) ? unit.kind : 'part'
  const kind = (
    kindRaw === 'part' ||
    kindRaw === 'consumable' ||
    kindRaw === 'tool' ||
    kindRaw === 'electronics' ||
    kindRaw === 'other'
      ? kindRaw
      : 'part'
  ) as HardwareKind
  return {
    name: unit?.name ?? '',
    serial: unit?.serial ?? '',
    kind,
    stockStatus: (unit ? stockStatusOf(unit) : 'in-stock') as StockStatus,
    location: unit?.location ?? '',
    quantity: String(unit ? unitQuantity(unit) : 1),
    onOrderQty: String(unit ? unitOnOrderQty(unit) : 0),
    minQty: unit?.minQty != null ? String(unit.minQty) : '',
    unitPrice:
      unit && unitPriceOf(unit) != null ? String(unitPriceOf(unit)) : '',
    partNumber: unit?.partNumber ?? '',
    supplier: unit?.owner ?? '',
    orderUrl: unit?.orderUrl ?? '',
    orderedAt: unit?.orderedAt ?? '',
    expectedAt: unit?.expectedAt ?? '',
    program: unit?.program ?? '',
    notes: unit?.notes ?? '',
  }
}

function UnitForm({
  initial,
  submitLabel,
  programOptions,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: HardwareUnit
  submitLabel: string
  programOptions: string[]
  onSave: (unit: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string }) => void
  onDelete?: () => void
  onCancel?: () => void
}) {
  const isNew = !initial
  const [editing, setEditing] = useState(isNew)
  const [fields, setFields] = useState(() => fieldsFromUnit(initial))
  const {
    name,
    serial,
    kind,
    stockStatus,
    location,
    quantity,
    onOrderQty,
    minQty,
    unitPrice,
    partNumber,
    supplier,
    orderUrl,
    orderedAt,
    expectedAt,
    program,
    notes,
  } = fields

  // Keep the locked view in sync with list actions (Recv, +/−) while not editing.
  useEffect(() => {
    if (!initial || editing) return
    setFields(fieldsFromUnit(initial))
  }, [
    editing,
    initial?.id,
    initial?.updatedAt,
    initial?.quantity,
    initial?.onOrderQty,
    initial?.stockStatus,
    initial?.unitPrice,
    initial?.orderedAt,
    initial?.expectedAt,
    initial?.name,
    initial?.program,
  ])

  function setField<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit() {
    setFields(fieldsFromUnit(initial))
    setEditing(true)
  }

  function cancelEdit() {
    if (isNew) {
      onCancel?.()
      return
    }
    setFields(fieldsFromUnit(initial))
    setEditing(false)
  }

  const showOrderFields =
    stockStatus === 'on-order' ||
    stockStatus === 'receiving' ||
    stockStatus === 'incoming' ||
    Number(onOrderQty) > 0 ||
    Boolean(orderedAt || expectedAt)

  function handleStockStatusChange(next: StockStatus) {
    setFields((prev) => {
      const patch = { ...prev, stockStatus: next }
      if (next === 'on-order' || next === 'receiving' || next === 'incoming') {
        if (!prev.orderedAt) patch.orderedAt = todayDateInput()
        if (!prev.onOrderQty || prev.onOrderQty === '0') patch.onOrderQty = '1'
      }
      return patch
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editing || !name.trim() || !serial.trim()) return
    const qty = Number(quantity)
    const ordered = Number(onOrderQty)
    const min = minQty.trim() === '' ? undefined : Number(minQty)
    const price = unitPrice.trim() === '' ? undefined : Number(unitPrice)
    const inOrderPipeline =
      stockStatus === 'on-order' ||
      stockStatus === 'receiving' ||
      stockStatus === 'incoming' ||
      (Number.isFinite(ordered) && ordered > 0)
    onSave({
      id: initial?.id,
      name: name.trim(),
      serial: serial.trim(),
      kind,
      status: hardwareStatusForStock(stockStatus),
      stockStatus,
      location: location.trim() || undefined,
      quantity: Number.isFinite(qty) && qty >= 0 ? qty : 1,
      onOrderQty:
        Number.isFinite(ordered) && ordered > 0 ? Math.floor(ordered) : 0,
      minQty:
        min != null && Number.isFinite(min) && min >= 0 ? min : undefined,
      unitPrice:
        price != null && Number.isFinite(price) && price >= 0
          ? price
          : undefined,
      hwRev: '—',
      fwVersion: undefined,
      partNumber: partNumber.trim() || undefined,
      owner: supplier.trim() || undefined,
      orderUrl: orderUrl.trim() || undefined,
      orderedAt:
        inOrderPipeline || orderedAt.trim()
          ? normalizeDateInput(orderedAt) ||
            (inOrderPipeline ? todayDateInput() : undefined)
          : undefined,
      expectedAt: normalizeDateInput(expectedAt),
      program: program.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    if (!isNew) setEditing(false)
  }

  const orderHref = orderUrl.trim() ? normalizeOrderUrl(orderUrl.trim()) : null

  return (
    <form
      className="simple-form"
      data-editing={editing ? 'true' : 'false'}
      onSubmit={handleSubmit}
    >
      <div className="simple-form-title-row">
        <div>
          <h3>{initial ? initial.name : 'New stock item'}</h3>
          <p className="simple-muted">
            {editing
              ? 'Edit stock details, then Save to lock the form.'
              : 'Viewing saved details. Click Edit to make changes.'}
          </p>
        </div>
        {!isNew && !editing ? (
          <button
            type="button"
            className="btn btn-accent"
            onClick={startEdit}
          >
            Edit
          </button>
        ) : null}
      </div>
      {orderHref ? (
        <div className="inv-order-panel">
          <a
            className="btn btn-accent inv-order-cta"
            href={orderHref}
            target="_blank"
            rel="noreferrer"
          >
            Order more
          </a>
          <span className="simple-muted">Opens the saved vendor link.</span>
        </div>
      ) : null}
      <fieldset className="simple-form-fields" disabled={!editing}>
        <label>
          Item name
          <input
            value={name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="AN-4 bolts"
            required={editing}
          />
        </label>
        <div className="simple-form-row">
          <label>
            SKU / barcode
            <input
              value={serial}
              onChange={(e) => setField('serial', e.target.value)}
              placeholder="INV-AN4-BOLT"
              required={editing}
            />
          </label>
          <label>
            Catalog / PN
            <input
              value={partNumber}
              onChange={(e) => setField('partNumber', e.target.value)}
              placeholder="AN4-14A"
            />
          </label>
        </div>
        <div className="simple-form-row">
          <label>
            Type
            <select
              value={kind}
              onChange={(e) => setField('kind', e.target.value as HardwareKind)}
            >
              {KIND_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stock status
            <select
              value={stockStatus}
              onChange={(e) =>
                handleStockStatusChange(e.target.value as StockStatus)
              }
            >
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="simple-form-row">
          <label>
            Qty on hand
            <input
              type="number"
              min={0}
              step={1}
              value={quantity}
              onChange={(e) => setField('quantity', e.target.value)}
            />
          </label>
          <label>
            Qty on order
            <input
              type="number"
              min={0}
              step={1}
              value={onOrderQty}
              onChange={(e) => setField('onOrderQty', e.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        <div className="simple-form-row">
          <label>
            Unit price (AUD)
            <input
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setField('unitPrice', e.target.value)}
              placeholder="e.g. 12.50"
            />
          </label>
          <label>
            Min qty (auto low)
            <input
              type="number"
              min={0}
              step={1}
              value={minQty}
              onChange={(e) => setField('minQty', e.target.value)}
              placeholder="e.g. 10"
            />
          </label>
        </div>
        {!editing && unitPrice.trim() && Number(unitPrice) >= 0 ? (
          <p className="simple-muted inv-value-line">
            Est. on hand{' '}
            {formatMoney(Number(quantity || 0) * Number(unitPrice))}
            {Number(onOrderQty) > 0
              ? ` · on order ${formatMoney(Number(onOrderQty) * Number(unitPrice))}`
              : ''}
          </p>
        ) : null}
        <label>
          Bin / location
          <input
            value={location}
            onChange={(e) => setField('location', e.target.value)}
            placeholder="Goods Shed · fastener bin"
          />
        </label>
        <label>
          Supplier / source
          <input
            value={supplier}
            onChange={(e) => setField('supplier', e.target.value)}
            placeholder="McMaster, DigiKey, in-house…"
          />
        </label>
        <label>
          Program / vehicle
          <input
            list="inv-program-options"
            value={program}
            onChange={(e) => setField('program', e.target.value)}
            placeholder="B1M, STRAVOX, TVC…"
          />
          <datalist id="inv-program-options">
            {programOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <span className="simple-muted">
            Optional tag for filtering stock by campaign or vehicle.
          </span>
        </label>
        <div className="inv-link-section">
          <h4>Order</h4>
          <p className="simple-muted">
            Outstanding qty on order, vendor link, and delivery dates. Recv moves
            one from on order → on hand.
          </p>
          {showOrderFields ? (
            <div className="simple-form-row">
              <label>
                Order date
                <input
                  type="date"
                  value={orderedAt}
                  onChange={(e) => setField('orderedAt', e.target.value)}
                />
              </label>
              <label>
                Expected delivery
                <input
                  type="date"
                  value={expectedAt}
                  onChange={(e) => setField('expectedAt', e.target.value)}
                />
              </label>
            </div>
          ) : null}
          <label>
            URL
            <input
              type="url"
              value={orderUrl}
              onChange={(e) => setField('orderUrl', e.target.value)}
              placeholder="https://www.mcmaster.com/…"
              inputMode="url"
            />
          </label>
        </div>
        <label>
          Notes
          <input
            value={notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Expiry, cal due…"
          />
        </label>
      </fieldset>
      <div className="simple-form-actions">
        {editing ? (
          <>
            <button type="submit" className="btn btn-accent">
              {submitLabel}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
              Cancel
            </button>
          </>
        ) : null}
        {onDelete && editing ? (
          <button type="button" className="btn btn-ghost" onClick={onDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </form>
  )
}

function normalizeOrderUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeDateInput(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined
}

function formatOrderDate(isoDate: string) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number)
    if (!y || !m || !d) return isoDate
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return isoDate
  }
}
