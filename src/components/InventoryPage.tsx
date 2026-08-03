import { useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import {
  HARDWARE_KIND_LABELS,
  HARDWARE_STATUS_LABELS,
  INVENTORY_KINDS,
  isInventoryKind,
  newId,
  sortUnits,
  unitQuantity,
} from '../hardwareData'
import type {
  HardwareKind,
  HardwareProgressNote,
  HardwareStatus,
  HardwareUnit,
} from '../types'
import { useLabStore } from '../useLabStore'

const KIND_OPTIONS = INVENTORY_KINDS.map(
  (kind) => [kind, HARDWARE_KIND_LABELS[kind]] as const,
)
const STATUS_OPTIONS = Object.entries(HARDWARE_STATUS_LABELS) as [
  HardwareStatus,
  string,
][]

export function InventoryPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, toast } = store
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const units = useMemo(
    () => sortUnits(lab.units.filter((u) => isInventoryKind(u.kind))),
    [lab.units],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return units
    return units.filter((u) =>
      [u.name, u.serial, u.location, u.owner, u.partNumber, u.kind, u.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [units, query])

  const selected =
    units.find((u) => u.id === selectedId) ?? filtered[0] ?? null

  function saveUnit(
    input: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string },
  ) {
    const kind = isInventoryKind(input.kind) ? input.kind : 'other'
    const updatedAt = new Date().toISOString()
    if (input.id) {
      void store.commit(
        {
          ...lab,
          units: lab.units.map((u) =>
            u.id === input.id ? { ...u, ...input, kind, updatedAt } : u,
          ),
        },
        'Saved',
      )
      return
    }

    const next: HardwareUnit = {
      ...input,
      kind,
      id: newId('hw'),
      updatedAt,
    }
    const note: HardwareProgressNote = {
      id: newId('pg'),
      unitId: next.id,
      date: updatedAt.slice(0, 10),
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
    setSelectedId(next.id)
    setAdding(false)
  }

  function removeUnit(id: string) {
    const unit = lab.units.find((u) => u.id === id)
    if (!unit || !window.confirm(`Remove ${unit.name}?`)) return
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
  }

  return (
    <main className="simple-page" aria-label="Inventory">
      <header className="simple-head">
        <div>
          <h2>Inventory</h2>
          <p className="simple-muted">Parts, consumables, tools, and other stock.</p>
        </div>
        <div className="simple-head-actions">
          {saving ? <span className="simple-sync">Saving…</span> : null}
          {sync === 'shared' && !saving ? (
            <span className="simple-sync simple-sync-ok">Live</span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void store.refresh({ quiet: true })}
            disabled={sync === 'loading'}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => {
              setAdding(true)
              setSelectedId(null)
            }}
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

      {sync === 'loading' ? (
        <p className="simple-muted">Loading…</p>
      ) : (
        <div className="simple-split">
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
                  <button
                    type="button"
                    className="simple-list-row"
                    data-selected={
                      !adding && selected?.id === unit.id ? 'true' : 'false'
                    }
                    onClick={() => {
                      setAdding(false)
                      setSelectedId(unit.id)
                    }}
                  >
                    <span>
                      <strong>{unit.name}</strong>
                      <span className="simple-muted">
                        {HARDWARE_KIND_LABELS[unit.kind]} · qty{' '}
                        {unitQuantity(unit)}
                        {unit.location ? ` · ${unit.location}` : ''}
                      </span>
                    </span>
                    <span className="simple-muted">{unit.serial}</span>
                  </button>
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
            {adding ? (
              <UnitForm
                key="new"
                submitLabel="Add"
                onCancel={() => setAdding(false)}
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
    </main>
  )
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
  const [name, setName] = useState(initial?.name ?? '')
  const [serial, setSerial] = useState(initial?.serial ?? '')
  const [kind, setKind] = useState<HardwareKind>(
    initial && isInventoryKind(initial.kind) ? initial.kind : 'part',
  )
  const [status, setStatus] = useState<HardwareStatus>(
    initial?.status ?? 'flight-ready',
  )
  const [location, setLocation] = useState(initial?.location ?? '')
  const [quantity, setQuantity] = useState(
    String(initial ? unitQuantity(initial) : 1),
  )
  const [partNumber, setPartNumber] = useState(initial?.partNumber ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !serial.trim()) return
    const qty = Number(quantity)
    onSave({
      id: initial?.id,
      name: name.trim(),
      serial: serial.trim(),
      kind,
      status,
      location: location.trim() || undefined,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      hwRev: initial?.hwRev?.trim() || '—',
      fwVersion: initial?.fwVersion,
      partNumber: partNumber.trim() || undefined,
      owner: initial?.owner,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <form className="simple-form" onSubmit={handleSubmit}>
      <h3>{initial ? initial.name : 'New stock item'}</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        SKU / serial
        <input
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          required
        />
      </label>
      <div className="simple-form-row">
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as HardwareKind)}
          >
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as HardwareStatus)}
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
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <label>
          Qty
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
      </div>
      <label>
        Part number
        <input
          value={partNumber}
          onChange={(e) => setPartNumber(e.target.value)}
        />
      </label>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="simple-form-actions">
        <button type="submit" className="btn btn-accent">
          {submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {onDelete ? (
          <button type="button" className="btn btn-ghost" onClick={onDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </form>
  )
}
