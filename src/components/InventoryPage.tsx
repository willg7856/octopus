import { useMemo, useState, type FormEvent } from 'react'
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
  stockStatusLabel,
  stockStatusOf,
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

export function InventoryPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, conflict, toast, updatedAt, updatedBy } =
    store
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [mobileMode, setMobileMode] = useState<'list' | 'detail'>('list')

  const units = useMemo(
    () => sortUnits(lab.units.filter((u) => isInventoryKind(u.kind))),
    [lab.units],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return units
    return units.filter((u) =>
      [u.name, u.serial, u.location, u.owner, u.partNumber, u.kind, u.status, u.orderUrl]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [units, query])

  const selected =
    units.find((u) => u.id === selectedId) ??
    (mobileMode === 'detail' ? null : filtered[0] ?? null)

  function openDetail(id: string | null, isAdding = false) {
    setAdding(isAdding)
    setSelectedId(id)
    setMobileMode('detail')
  }

  function saveUnit(
    input: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string },
  ) {
    if (saving) return
    const kind = isInventoryKind(input.kind) ? input.kind : 'other'
    const qty =
      typeof input.quantity === 'number' && Number.isFinite(input.quantity)
        ? input.quantity
        : 1
    const stockStatus = applyInventoryStockRules(
      input.stockStatus ?? 'in-stock',
      qty,
      input.minQty,
    )
    const updatedAtNow = new Date().toISOString()
    const resolved = {
      ...input,
      kind,
      stockStatus,
      status: hardwareStatusForStock(stockStatus),
      quantity: qty,
      updatedAt: updatedAtNow,
    }

    if (input.id) {
      void store.commit(
        {
          ...lab,
          units: lab.units.map((u) =>
            u.id === input.id ? { ...u, ...resolved } : u,
          ),
        },
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
      {
        ...lab,
        units: [...lab.units, next],
        progress: [note, ...lab.progress],
      },
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
      {
        ...lab,
        units: lab.units.filter((u) => u.id !== id),
        progress: lab.progress.filter((p) => p.unitId !== id),
        tests: lab.tests.map((t) => ({
          ...t,
          unitIds: t.unitIds.filter((uid) => uid !== id),
        })),
        processes: lab.processes.map((p) => ({
          ...p,
          steps: p.steps.map((s) => ({
            ...s,
            linkedUnitIds: (s.linkedUnitIds ?? []).filter((uid) => uid !== id),
          })),
        })),
      },
      'Removed',
    )
    setSelectedId(null)
    setMobileMode('list')
  }

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
            disabled={saving}
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
            <input
              className="simple-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search inventory"
            />
            <ul className="simple-list">
              {filtered.map((unit) => (
                <li key={unit.id}>
                  <div
                    className="simple-list-row"
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
                          {HARDWARE_KIND_LABELS[unit.kind]} · qty{' '}
                          {unitQuantity(unit)}
                          {unit.minQty != null ? ` · min ${unit.minQty}` : ''}
                          {unit.location ? ` · ${unit.location}` : ''}
                        </span>
                      </span>
                      <span
                        className="status-badge"
                        data-kind="stock"
                        data-status={stockStatusOf(unit)}
                      >
                        {stockStatusLabel(stockStatusOf(unit))}
                      </span>
                    </button>
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
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="simple-muted">
                  {query.trim()
                    ? 'No stock matches that search.'
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
                disabled={saving}
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
                disabled={saving}
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

function UnitForm({
  initial,
  submitLabel,
  onSave,
  onDelete,
  onCancel,
  disabled,
}: {
  initial?: HardwareUnit
  submitLabel: string
  onSave: (unit: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string }) => void
  onDelete?: () => void
  onCancel?: () => void
  disabled?: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [serial, setSerial] = useState(initial?.serial ?? '')
  const [kind, setKind] = useState<HardwareKind>(
    initial && isInventoryKind(initial.kind) ? initial.kind : 'part',
  )
  const [stockStatus, setStockStatus] = useState<StockStatus>(
    initial ? stockStatusOf(initial) : 'in-stock',
  )
  const [location, setLocation] = useState(initial?.location ?? '')
  const [quantity, setQuantity] = useState(
    String(initial ? unitQuantity(initial) : 1),
  )
  const [minQty, setMinQty] = useState(
    initial?.minQty != null ? String(initial.minQty) : '',
  )
  const [partNumber, setPartNumber] = useState(initial?.partNumber ?? '')
  const [supplier, setSupplier] = useState(initial?.owner ?? '')
  const [orderUrl, setOrderUrl] = useState(initial?.orderUrl ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !serial.trim() || disabled) return
    const qty = Number(quantity)
    const min = minQty.trim() === '' ? undefined : Number(minQty)
    onSave({
      id: initial?.id,
      name: name.trim(),
      serial: serial.trim(),
      kind,
      status: hardwareStatusForStock(stockStatus),
      stockStatus,
      location: location.trim() || undefined,
      quantity: Number.isFinite(qty) && qty >= 0 ? qty : 1,
      minQty:
        min != null && Number.isFinite(min) && min >= 0 ? min : undefined,
      hwRev: '—',
      fwVersion: undefined,
      partNumber: partNumber.trim() || undefined,
      owner: supplier.trim() || undefined,
      orderUrl: orderUrl.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  const orderHref = orderUrl.trim() ? normalizeOrderUrl(orderUrl.trim()) : null

  return (
    <form className="simple-form" onSubmit={handleSubmit}>
      <h3>{initial ? initial.name : 'New stock item'}</h3>
      <p className="simple-muted">
        Track bin stock — quantity, SKU, min qty, and stock status. Not vehicle
        hardware.
      </p>
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
      <label>
        Item name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="AN-4 bolts"
          required
          disabled={disabled}
        />
      </label>
      <div className="simple-form-row">
        <label>
          SKU / barcode
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="INV-AN4-BOLT"
            required
            disabled={disabled}
          />
        </label>
        <label>
          Catalog / PN
          <input
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
            placeholder="AN4-14A"
            disabled={disabled}
          />
        </label>
      </div>
      <div className="simple-form-row">
        <label>
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as HardwareKind)}
            disabled={disabled}
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
            onChange={(e) => setStockStatus(e.target.value as StockStatus)}
            disabled={disabled}
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
            onChange={(e) => setQuantity(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          Min qty (auto low)
          <input
            type="number"
            min={0}
            step={1}
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            placeholder="e.g. 10"
            disabled={disabled}
          />
        </label>
      </div>
      <label>
        Bin / location
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Goods Shed · fastener bin"
          disabled={disabled}
        />
      </label>
      <label>
        Supplier / source
        <input
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="McMaster, DigiKey, in-house…"
          disabled={disabled}
        />
      </label>
      <div className="inv-link-section">
        <h4>Order link</h4>
        <p className="simple-muted">
          Paste a McMaster, DigiKey, or vendor URL so anyone can reorder fast.
        </p>
        <label>
          URL
          <input
            type="url"
            value={orderUrl}
            onChange={(e) => setOrderUrl(e.target.value)}
            placeholder="https://www.mcmaster.com/…"
            inputMode="url"
            disabled={disabled}
          />
        </label>
      </div>
      <label>
        Notes
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Expiry, cal due…"
          disabled={disabled}
        />
      </label>
      <div className="simple-form-actions">
        <button type="submit" className="btn btn-accent" disabled={disabled}>
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onDelete}
            disabled={disabled}
          >
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
