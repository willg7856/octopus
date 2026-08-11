import { useMemo, useState } from 'react'
import { useConfirm } from './ConfirmDialog'
import {
  HARDWARE_KIND_LABELS,
  installInventoryOnHardware,
  isInventoryKind,
  returnInventoryQtyFromHardware,
  sortUnits,
  unitQuantity,
  unlinkInventoryFromHardware,
  type HardwareLabState,
} from '../hardwareData'
import type { HardwareUnit } from '../types'
import type { LabStore } from '../useLabStore'

type HardwarePartsPanelProps = {
  hardware: HardwareUnit
  inventory: HardwareUnit[]
  allUnits: HardwareUnit[]
  store: LabStore
  disabled?: boolean
  onOpenInventory?: (inventoryId: string) => void
}

function parseQty(raw: string | undefined, fallback = 1) {
  const parsed = raw != null && raw !== '' ? Number(raw) : fallback
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback
}

export function HardwarePartsPanel({
  hardware,
  inventory,
  allUnits,
  store,
  disabled,
  onOpenInventory,
}: HardwarePartsPanelProps) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [qtyById, setQtyById] = useState<Record<string, string>>({})
  const q = query.trim().toLowerCase()

  const parts = useMemo(() => {
    const byId = new Map(allUnits.map((u) => [u.id, u]))
    const seen = new Set<string>()
    const list: HardwareUnit[] = []

    for (const u of allUnits) {
      if (u.installedOnUnitId === hardware.id && isInventoryKind(u.kind)) {
        seen.add(u.id)
        list.push(u)
      }
    }
    for (const id of hardware.linkedInventoryIds ?? []) {
      if (seen.has(id)) continue
      const u = byId.get(id)
      if (u && isInventoryKind(u.kind)) {
        seen.add(id)
        list.push(u)
      }
    }
    return sortUnits(list)
  }, [allUnits, hardware.id, hardware.linkedInventoryIds])

  const partIds = useMemo(() => new Set(parts.map((p) => p.id)), [parts])

  const availableToAdd = useMemo(() => {
    return sortUnits(
      inventory.filter((u) => {
        // Fully reserved on this unit — nothing left to draw from the line.
        if (u.installedOnUnitId === hardware.id) return false
        if (u.installedOnUnitId && u.installedOnUnitId !== hardware.id) {
          // show busy items so the operator can see why Install is disabled
        }
        const onHand = unitQuantity(u)
        // Already on this unit but still has stock — allow installing more.
        if (partIds.has(u.id) && onHand <= 0) return false
        if (!q) return onHand > 0 || Boolean(u.installedOnUnitId)
        return [u.name, u.serial, u.partNumber, HARDWARE_KIND_LABELS[u.kind]]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      }),
    )
  }, [inventory, partIds, q, hardware.id])

  function setQty(id: string, value: string) {
    setQtyById((prev) => ({ ...prev, [id]: value }))
  }

  function bumpQty(id: string, delta: number, max: number) {
    const cur = parseQty(qtyById[id], 1)
    const next = Math.min(Math.max(1, cur + delta), Math.max(1, max))
    setQty(id, String(next))
  }

  function saveUnits(nextUnits: HardwareUnit[], message: string) {
    setError(null)
    void store.commit(
      (prev: HardwareLabState) => ({ ...prev, units: nextUnits }),
      message,
    )
  }

  function installPart(inventoryId: string) {
    const item = allUnits.find((u) => u.id === inventoryId)
    const onHand = item ? unitQuantity(item) : 0
    const qty = Math.min(Math.max(1, parseQty(qtyById[inventoryId], 1)), Math.max(1, onHand))
    const result = installInventoryOnHardware(
      allUnits,
      hardware.id,
      inventoryId,
      onHand <= 1 ? 1 : qty,
    )
    if (result.error) {
      setError(result.error)
      return
    }
    saveUnits(result.units, qty > 1 ? `Installed ${qty}` : 'Installed / reserved')
    setQuery('')
    setQtyById((prev) => {
      const next = { ...prev }
      delete next[inventoryId]
      return next
    })
  }

  function returnPartQty(inventoryId: string) {
    const drawn = hardware.linkedInventoryDraws?.[inventoryId] ?? 0
    const item = allUnits.find((u) => u.id === inventoryId)
    const reservedHere = item?.installedOnUnitId === hardware.id
    const maxReturn = reservedHere ? unitQuantity(item!) : Math.max(1, drawn)
    const qty = Math.min(
      Math.max(1, parseQty(qtyById[inventoryId], 1)),
      maxReturn,
    )
    const result = returnInventoryQtyFromHardware(
      allUnits,
      hardware.id,
      inventoryId,
      qty,
    )
    if (result.error) {
      setError(result.error)
      return
    }
    saveUnits(
      result.units,
      reservedHere || qty >= drawn ? 'Returned to stock' : `Returned ${qty}`,
    )
    setQtyById((prev) => {
      const next = { ...prev }
      delete next[inventoryId]
      return next
    })
  }

  async function returnAll(inventoryId: string) {
    const part = allUnits.find((u) => u.id === inventoryId)
    const ok = await confirm(
      `Return “${part?.name ?? 'this part'}” to stock and remove it from this unit?`,
    )
    if (!ok) return
    saveUnits(
      unlinkInventoryFromHardware(allUnits, hardware.id, inventoryId),
      'Returned to stock',
    )
  }

  const suggestions = availableToAdd.slice(0, q ? 8 : 6)

  return (
    <section className="hw-parts" aria-label="Parts from inventory">
      <h4>Parts</h4>
      <p className="simple-muted">
        Choose how many to install from inventory. Multi-qty lines stay in stock
        for other hardware — add or return qty anytime.
      </p>

      {error ? (
        <p className="simple-error" role="alert">
          {error}
        </p>
      ) : null}

      {parts.length === 0 ? (
        <p className="simple-muted">No parts installed yet.</p>
      ) : (
        <ul className="hw-parts-list">
          {parts.map((part) => {
            const installedHere = part.installedOnUnitId === hardware.id
            const drawn = hardware.linkedInventoryDraws?.[part.id] ?? 0
            const installedElsewhere =
              Boolean(part.installedOnUnitId) && !installedHere
            const elsewhere = installedElsewhere
              ? allUnits.find((u) => u.id === part.installedOnUnitId)
              : null
            const onHand = unitQuantity(part)
            const qtyMax = installedHere
              ? Math.max(1, onHand)
              : Math.max(1, drawn > 0 ? Math.max(drawn, onHand) : onHand)
            const qtyVal = String(
              Math.min(parseQty(qtyById[part.id], 1), qtyMax),
            )
            return (
              <li key={part.id} className="hw-parts-row">
                <div className="hw-parts-main">
                  {onOpenInventory ? (
                    <button
                      type="button"
                      className="hw-parts-name-btn"
                      onClick={() => onOpenInventory(part.id)}
                    >
                      <strong>{part.name}</strong>
                    </button>
                  ) : (
                    <strong>{part.name}</strong>
                  )}
                  <span className="simple-muted">
                    {HARDWARE_KIND_LABELS[part.kind]} · {onHand} on hand
                    {installedHere
                      ? ' · reserved here'
                      : drawn > 0
                        ? ` · using ${drawn}`
                        : installedElsewhere
                          ? ` · on ${elsewhere?.name ?? 'other unit'}`
                          : ' · not reserved yet'}
                  </span>
                </div>
                <span
                  className="status-badge"
                  data-kind="stock"
                  data-status={
                    installedHere || installedElsewhere
                      ? 'reserved'
                      : drawn > 0
                        ? 'low'
                        : 'in-stock'
                  }
                >
                  {installedHere
                    ? 'Installed'
                    : drawn > 0
                      ? `Using ${drawn}`
                      : installedElsewhere
                        ? 'Reserved elsewhere'
                        : 'Needs install'}
                </span>
                <div className="hw-parts-actions">
                  {installedHere ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={disabled}
                      onClick={() => void returnAll(part.id)}
                    >
                      Return
                    </button>
                  ) : drawn > 0 ? (
                    <>
                      <QtyStepper
                        id={part.id}
                        value={qtyVal}
                        max={qtyMax}
                        disabled={disabled}
                        onChange={setQty}
                        onBump={bumpQty}
                        label={`Quantity for ${part.name}`}
                      />
                      <button
                        type="button"
                        className="btn btn-accent"
                        disabled={disabled || onHand <= 0}
                        onClick={() => installPart(part.id)}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={disabled}
                        onClick={() => returnPartQty(part.id)}
                      >
                        Return
                      </button>
                    </>
                  ) : (
                    <>
                      {!installedElsewhere && onHand > 0 ? (
                        <>
                          <QtyStepper
                            id={part.id}
                            value={qtyVal}
                            max={Math.max(1, onHand)}
                            disabled={disabled}
                            onChange={setQty}
                            onBump={bumpQty}
                            label={`Quantity of ${part.name} to install`}
                          />
                          <button
                            type="button"
                            className="btn btn-accent"
                            disabled={disabled}
                            onClick={() => installPart(part.id)}
                          >
                            Install
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={disabled}
                        onClick={() => void returnAll(part.id)}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="hw-parts-add">
        <input
          className="simple-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search inventory to install…"
          aria-label="Search inventory to install parts"
          disabled={disabled}
        />
        <ul className="hw-parts-suggest">
          {suggestions.length === 0 ? (
            <li className="simple-muted">
              {q
                ? 'No matching inventory items.'
                : 'No available inventory items.'}
            </li>
          ) : (
            suggestions.map((part) => {
              const busy =
                Boolean(part.installedOnUnitId) &&
                part.installedOnUnitId !== hardware.id
              const host = busy
                ? allUnits.find((u) => u.id === part.installedOnUnitId)
                : null
              const onHand = unitQuantity(part)
              const alreadyUsing = hardware.linkedInventoryDraws?.[part.id] ?? 0
              const qtyVal = String(
                Math.min(parseQty(qtyById[part.id], 1), Math.max(1, onHand)),
              )
              return (
                <li key={part.id}>
                  <span>
                    <strong>{part.name}</strong>
                    <span className="simple-muted">
                      {HARDWARE_KIND_LABELS[part.kind]} · {onHand} on hand
                      {alreadyUsing > 0 ? ` · using ${alreadyUsing}` : ''}
                      {busy ? ` · on ${host?.name ?? 'other unit'}` : ''}
                    </span>
                  </span>
                  <span className="hw-parts-actions">
                    {onHand >= 1 && !busy ? (
                      <QtyStepper
                        id={part.id}
                        value={qtyVal}
                        max={Math.max(1, onHand)}
                        disabled={disabled || busy}
                        onChange={setQty}
                        onBump={bumpQty}
                        label={`Quantity of ${part.name} to install`}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={disabled || busy || onHand <= 0}
                      onClick={() => installPart(part.id)}
                    >
                      {alreadyUsing > 0 ? 'Add' : 'Install'}
                    </button>
                  </span>
                </li>
              )
            })
          )}
        </ul>
        {!q ? (
          <p className="simple-muted hw-parts-add-hint">
            Set qty, then Install / Add. Return uses the same qty control on
            installed lines.
          </p>
        ) : null}
      </div>
      {confirmDialog}
    </section>
  )
}

function QtyStepper({
  id,
  value,
  max,
  disabled,
  onChange,
  onBump,
  label,
}: {
  id: string
  value: string
  max: number
  disabled?: boolean
  onChange: (id: string, value: string) => void
  onBump: (id: string, delta: number, max: number) => void
  label: string
}) {
  return (
    <span className="hw-parts-qty-stepper">
      <button
        type="button"
        className="btn btn-ghost hw-parts-qty-btn"
        disabled={disabled || parseQty(value, 1) <= 1}
        onClick={() => onBump(id, -1, max)}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <input
        className="hw-parts-qty"
        type="number"
        min={1}
        max={max}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(id, e.target.value)}
        aria-label={label}
      />
      <button
        type="button"
        className="btn btn-ghost hw-parts-qty-btn"
        disabled={disabled || parseQty(value, 1) >= max}
        onClick={() => onBump(id, 1, max)}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </span>
  )
}
