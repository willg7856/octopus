import { useMemo, useState } from 'react'
import {
  HARDWARE_KIND_LABELS,
  isInventoryKind,
  isSystemKind,
  sortUnits,
  unitQuantity,
} from '../hardwareData'
import type { HardwareUnit } from '../types'

type InventoryLinkPickerProps = {
  units: HardwareUnit[]
  selectedIds: string[]
  /** Required unless using onQuantitiesChange (which syncs ids automatically). */
  onChange?: (ids: string[]) => void
  disabled?: boolean
  /** When true, also list hardware system units (for Production steps). */
  includeHardware?: boolean
  /** When false, hide inventory items (hardware-only picker). Default true. */
  includeInventory?: boolean
  /**
   * Quantities for selected inventory items. When set with onQuantitiesChange,
   * adding an already-selected item increases qty instead of toggling off.
   */
  quantities?: Record<string, number>
  onQuantitiesChange?: (qty: Record<string, number>) => void
  legend?: string
  hint?: string
}

function matchesQuery(unit: HardwareUnit, q: string) {
  if (!q) return true
  return [
    unit.name,
    unit.serial,
    unit.partNumber,
    unit.program,
    unit.location,
    HARDWARE_KIND_LABELS[unit.kind],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)
}

function qtyOf(quantities: Record<string, number> | undefined, id: string) {
  const n = quantities?.[id]
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

export function InventoryLinkPicker({
  units,
  selectedIds,
  onChange,
  disabled,
  includeHardware = false,
  includeInventory = true,
  quantities,
  onQuantitiesChange,
  legend = 'Parts from inventory',
  hint = 'Optional. Linking tracks what this uses — it does not change stock qty.',
}: InventoryLinkPickerProps) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const allowQty = Boolean(onQuantitiesChange)

  const inventory = useMemo(
    () =>
      includeInventory
        ? sortUnits(units.filter((u) => isInventoryKind(u.kind)))
        : [],
    [units, includeInventory],
  )
  const hardware = useMemo(
    () =>
      includeHardware
        ? sortUnits(units.filter((u) => isSystemKind(u.kind)))
        : [],
    [units, includeHardware],
  )

  const suggestions = useMemo(() => {
    if (!q) return [] as HardwareUnit[]
    const hw = hardware.filter((u) => matchesQuery(u, q))
    const inv = inventory.filter((u) => matchesQuery(u, q))
    return [...hw, ...inv].slice(0, 8)
  }, [hardware, inventory, q])

  const selectedUnits = useMemo(() => {
    const byId = new Map(units.map((u) => [u.id, u]))
    return selectedIds
      .map((id) => byId.get(id))
      .filter(Boolean) as HardwareUnit[]
  }, [selectedIds, units])

  function setQtyMap(nextQty: Record<string, number>) {
    const cleaned: Record<string, number> = {}
    for (const [id, raw] of Object.entries(nextQty)) {
      const n = Math.floor(raw)
      if (Number.isFinite(n) && n > 0) cleaned[id] = n
    }
    onQuantitiesChange?.(cleaned)
    onChange?.(Object.keys(cleaned))
  }

  function addUnit(id: string) {
    if (allowQty) {
      const current = { ...(quantities ?? {}) }
      // Migrate bare selected ids into qty map
      for (const sid of selectedIds) {
        if (current[sid] == null) current[sid] = 1
      }
      current[id] = (current[id] ?? 0) + 1
      setQtyMap(current)
      setQuery('')
      return
    }
    if (!selectedIds.includes(id)) onChange?.([...selectedIds, id])
    setQuery('')
  }

  function removeUnit(id: string) {
    if (allowQty) {
      const current = { ...(quantities ?? {}) }
      for (const sid of selectedIds) {
        if (current[sid] == null) current[sid] = 1
      }
      delete current[id]
      setQtyMap(current)
      return
    }
    onChange?.(selectedIds.filter((x) => x !== id))
  }

  function setUnitQty(id: string, next: number) {
    if (!allowQty) return
    const current = { ...(quantities ?? {}) }
    for (const sid of selectedIds) {
      if (current[sid] == null) current[sid] = 1
    }
    if (next <= 0) delete current[id]
    else current[id] = next
    setQtyMap(current)
  }

  const emptyCatalog = inventory.length === 0 && hardware.length === 0

  const emptyMessage = (() => {
    if (includeHardware && includeInventory) {
      return 'No hardware or inventory units yet.'
    }
    if (includeHardware) return 'No hardware units yet — add them under Hardware.'
    return 'No inventory items yet — add stock first.'
  })()

  const searchPlaceholder = (() => {
    if (includeHardware && includeInventory) return 'Search to add hardware or inventory…'
    if (includeHardware) return 'Search to add hardware…'
    return 'Search to add materials…'
  })()

  return (
    <fieldset className="hw-link-fieldset" disabled={disabled}>
      <legend>{legend}</legend>
      {hint ? <p className="simple-muted hw-link-hint">{hint}</p> : null}

      {selectedUnits.length > 0 ? (
        <ul className="hw-link-selected-list" aria-label="Selected items">
          {selectedUnits.map((unit) => {
            const qty = qtyOf(quantities, unit.id)
            return (
              <li key={unit.id} className="hw-link-selected-row">
                <span className="hw-link-selected-main">
                  <strong>{unit.name}</strong>
                  <span className="simple-muted">
                    {HARDWARE_KIND_LABELS[unit.kind]}
                    {isInventoryKind(unit.kind)
                      ? ` · ${unitQuantity(unit)} on hand`
                      : ''}
                  </span>
                </span>
                {allowQty && isInventoryKind(unit.kind) ? (
                  <span className="hw-link-qty">
                    <button
                      type="button"
                      className="hw-link-qty-btn"
                      aria-label={`Decrease ${unit.name}`}
                      disabled={disabled}
                      onClick={() => setUnitQty(unit.id, qty - 1)}
                    >
                      −
                    </button>
                    <input
                      className="hw-link-qty-input"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={qty}
                      disabled={disabled}
                      aria-label={`Quantity of ${unit.name}`}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (!Number.isFinite(n)) return
                        setUnitQty(unit.id, Math.floor(n))
                      }}
                    />
                    <button
                      type="button"
                      className="hw-link-qty-btn"
                      aria-label={`Increase ${unit.name}`}
                      disabled={disabled}
                      onClick={() => setUnitQty(unit.id, qty + 1)}
                    >
                      +
                    </button>
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost hw-link-remove"
                  disabled={disabled}
                  onClick={() => removeUnit(unit.id)}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {emptyCatalog ? (
        <p className="simple-muted">{emptyMessage}</p>
      ) : (
        <div className="hw-link-add">
          <input
            className="simple-search hw-link-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder.replace('…', '')}
            disabled={disabled}
          />
          {q ? (
            <ul className="hw-link-suggest">
              {suggestions.length === 0 ? (
                <li className="simple-muted">No items match that search.</li>
              ) : (
                suggestions.map((unit) => {
                  const selected = selectedIds.includes(unit.id)
                  const qty = qtyOf(quantities, unit.id)
                  return (
                    <li key={unit.id}>
                      <span>
                        <strong>{unit.name}</strong>
                        <span className="simple-muted">
                          {HARDWARE_KIND_LABELS[unit.kind]}
                          {isInventoryKind(unit.kind)
                            ? ` · ${unitQuantity(unit)} on hand`
                            : ''}
                          {selected && allowQty && isInventoryKind(unit.kind)
                            ? ` · already ×${qty}`
                            : selected
                              ? ' · added'
                              : ''}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-accent"
                        disabled={disabled || (!allowQty && selected)}
                        onClick={() => addUnit(unit.id)}
                      >
                        {allowQty &&
                        selected &&
                        isInventoryKind(unit.kind)
                          ? 'Add +1'
                          : selected
                            ? 'Added'
                            : 'Add'}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          ) : (
            <p className="simple-muted hw-link-search-hint">
              Type to search and add
              {allowQty ? ' — add the same item again to increase qty' : ''}.
            </p>
          )}
        </div>
      )}
    </fieldset>
  )
}

export function linkedInventoryNames(
  ids: string[] | undefined,
  units: HardwareUnit[],
  quantities?: Record<string, number>,
) {
  if (!ids?.length) return []
  const byId = new Map(units.map((u) => [u.id, u]))
  return ids
    .map((id) => {
      const unit = byId.get(id)
      if (!unit) return null
      const qty = qtyOf(quantities, id)
      return qty > 1 ? `${unit.name} ×${qty}` : unit.name
    })
    .filter(Boolean) as string[]
}

export function linkedUnitNames(
  ids: string[] | undefined,
  units: HardwareUnit[],
) {
  return linkedInventoryNames(ids, units)
}

/** Normalize production materials to a qty map (legacy ids → qty 1). */
export function materialsQtyMap(process: {
  linkedInventoryIds?: string[]
  linkedInventoryQty?: Record<string, number>
}): Record<string, number> {
  if (
    process.linkedInventoryQty &&
    Object.keys(process.linkedInventoryQty).length > 0
  ) {
    const out: Record<string, number> = {}
    for (const [id, raw] of Object.entries(process.linkedInventoryQty)) {
      const n = Math.floor(Number(raw))
      if (id && Number.isFinite(n) && n > 0) out[id] = n
    }
    return out
  }
  const out: Record<string, number> = {}
  for (const id of process.linkedInventoryIds ?? []) {
    if (id) out[id] = 1
  }
  return out
}
