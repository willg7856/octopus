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
  hardwareStatusForStock,
  isInventoryKind,
  newId,
  sortUnits,
  stockStatusAfterReceive,
  stockStatusLabel,
  stockStatusOf,
  unitOnOrderQty,
  unitQuantity,
} from '../hardwareData'
import type {
  HardwareKind,
  HardwareProgressNote,
  HardwareUnit,
  StockStatus,
} from '../types'
import { useLabStore } from '../useLabStore'

const KIND_OPTIONS = INVENTORY_KINDS.map(
  (kind) => [kind, HARDWARE_KIND_LABELS[kind]] as const,
)
const STATUS_OPTIONS = STOCK_STATUS_ORDER.map(
  (status) => [status, STOCK_STATUS_LABELS[status]] as const,
)

type AttentionFilter = 'all' | 'attention' | 'low' | 'on-order' | 'quarantine'

const ATTENTION_STATUSES: StockStatus[] = [
  'low',
  'on-order',
  'quarantine',
  'depleted',
]

function matchesAttention(unit: HardwareUnit, filter: AttentionFilter) {
  const status = stockStatusOf(unit)
  if (filter === 'all') return true
  if (filter === 'attention') return ATTENTION_STATUSES.includes(status)
  return status === filter
}

export function InventoryPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, conflict, toast, updatedAt, updatedBy } =
    store
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AttentionFilter>('all')
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
    let quarantine = 0
    for (const unit of units) {
      const status = stockStatusOf(unit)
      if (ATTENTION_STATUSES.includes(status)) attention += 1
      if (status === 'low') low += 1
      if (status === 'on-order') onOrder += 1
      if (status === 'quarantine') quarantine += 1
    }
    return { attention, low, onOrder, quarantine }
  }, [units])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return units.filter((u) => {
      if (!matchesAttention(u, filter)) return false
      if (!q) return true
      return [u.name, u.serial, u.location, u.owner, u.partNumber, u.kind, u.status, u.orderUrl]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [units, query, filter])

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
    const updatedAtNow = new Date().toISOString()
    const resolved = {
      ...input,
      kind,
      stockStatus,
      status: hardwareStatusForStock(stockStatus),
      quantity: qty,
      onOrderQty: onOrder > 0 ? onOrder : undefined,
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
    { id: 'all', label: 'All' },
    {
      id: 'attention',
      label: 'Needs attention',
      count: attentionCounts.attention,
    },
    { id: 'low', label: 'Low', count: attentionCounts.low },
    { id: 'on-order', label: 'On order', count: attentionCounts.onOrder },
    {
      id: 'quarantine',
      label: 'Quarantine',
      count: attentionCounts.quarantine,
    },
  ]

  return (
    <main className="simple-page" aria-label="Inventory">
      <header className="simple-head">
        <div>
          <h2>Inventory</h2>
          <p className="simple-muted">
            Stock room — parts, consumables, tools. Different fields than Hardware.
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
          >
            Add item
          </button>
        </div>
      </header>

      {sync === 'error' && syncError ? (
        <p className="simple-error" role="alert">
          {syncError}
        </p>
      ) : null}
      {conflict ? (
        <p className="simple-conflict" role="alert">
          Someone else saved first. Review the live data, then re-apply your edit.
        </p>
      ) : null}

      {sync === 'loading' ? (
        <p className="simple-muted">Loading…</p>
      ) : (
        <div className="simple-split" data-mode={mobileMode}>
          <section className="simple-list-panel">
            <div
              className="inv-filter-row"
              role="toolbar"
              aria-label="Stock filters"
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
                    >
                      <button
                        type="button"
                        className="simple-list-main"
                        onClick={() => openDetail(unit.id)}
                      >
                        <span>
                          <strong>{unit.name}</strong>
                          <span className="simple-muted">
                            {HARDWARE_KIND_LABELS[unit.kind]} · on hand{' '}
                            {unitQuantity(unit)}
                            {onOrder > 0 ? ` · on order ${onOrder}` : ''}
                            {unit.minQty != null ? ` · min ${unit.minQty}` : ''}
                            {unit.location ? ` · ${unit.location}` : ''}
                            {unit.expectedAt
                              ? ` · ETA ${formatOrderDate(unit.expectedAt)}`
                              : unit.orderedAt
                                ? ` · ordered ${formatOrderDate(unit.orderedAt)}`
                                : ''}
                          </span>
                        </span>
                        <span
                          className="status-badge"
                          data-kind="stock"
                          data-status={status}
                        >
                          {stockStatusLabel(status)}
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
                  {query.trim() || filter !== 'all'
                    ? 'No stock matches that filter.'
                    : 'No stock yet — add parts, consumables, or tools.'}
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
  return {
    name: unit?.name ?? '',
    serial: unit?.serial ?? '',
    kind: (unit && isInventoryKind(unit.kind) ? unit.kind : 'part') as HardwareKind,
    stockStatus: (unit ? stockStatusOf(unit) : 'in-stock') as StockStatus,
    location: unit?.location ?? '',
    quantity: String(unit ? unitQuantity(unit) : 1),
    onOrderQty: String(unit ? unitOnOrderQty(unit) : 0),
    minQty: unit?.minQty != null ? String(unit.minQty) : '',
    partNumber: unit?.partNumber ?? '',
    supplier: unit?.owner ?? '',
    orderUrl: unit?.orderUrl ?? '',
    orderedAt: unit?.orderedAt ?? '',
    expectedAt: unit?.expectedAt ?? '',
    notes: unit?.notes ?? '',
  }
}

function UnitForm({
  initial,
  submitLabel,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: HardwareUnit
  submitLabel: string
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
    partNumber,
    supplier,
    orderUrl,
    orderedAt,
    expectedAt,
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
    initial?.orderedAt,
    initial?.expectedAt,
    initial?.name,
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
