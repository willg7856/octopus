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
  onChange: (ids: string[]) => void
  disabled?: boolean
  /** When true, also list hardware system units (for Production steps). */
  includeHardware?: boolean
  /** When false, hide inventory items (hardware-only picker). Default true. */
  includeInventory?: boolean
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

export function InventoryLinkPicker({
  units,
  selectedIds,
  onChange,
  disabled,
  includeHardware = false,
  includeInventory = true,
  legend = 'Parts from inventory',
  hint = 'Optional. Linking tracks what this uses — it does not change stock qty.',
}: InventoryLinkPickerProps) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

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

  const filteredHardware = useMemo(
    () => hardware.filter((u) => matchesQuery(u, q)),
    [hardware, q],
  )
  const filteredInventory = useMemo(
    () => inventory.filter((u) => matchesQuery(u, q)),
    [inventory, q],
  )

  const selectedUnits = useMemo(() => {
    const byId = new Map(units.map((u) => [u.id, u]))
    return selectedIds
      .map((id) => byId.get(id))
      .filter(Boolean) as HardwareUnit[]
  }, [selectedIds, units])

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    )
  }

  const emptyCatalog = inventory.length === 0 && hardware.length === 0
  const noMatches =
    !emptyCatalog &&
    filteredHardware.length === 0 &&
    filteredInventory.length === 0
  const showBothGroups = includeHardware && includeInventory

  const emptyMessage = (() => {
    if (includeHardware && includeInventory) {
      return 'No hardware or inventory units yet.'
    }
    if (includeHardware) return 'No hardware units yet — add them under Hardware.'
    return 'No inventory items yet — add stock first.'
  })()

  const searchPlaceholder = (() => {
    if (includeHardware && includeInventory) return 'Search hardware or inventory…'
    if (includeHardware) return 'Search hardware…'
    return 'Search inventory…'
  })()

  return (
    <fieldset className="hw-link-fieldset" disabled={disabled}>
      <legend>{legend}</legend>
      {hint ? <p className="simple-muted hw-link-hint">{hint}</p> : null}

      {selectedUnits.length > 0 ? (
        <div className="hw-link-selected" aria-label="Selected items">
          {selectedUnits.map((unit) => (
            <button
              key={unit.id}
              type="button"
              className="hw-link-chip"
              disabled={disabled}
              onClick={() => toggle(unit.id)}
              title="Remove"
            >
              {unit.name}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      {emptyCatalog ? (
        <p className="simple-muted">{emptyMessage}</p>
      ) : (
        <>
          <input
            className="simple-search hw-link-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder.replace('…', '')}
            disabled={disabled}
          />
          <div className="hw-link-units">
            {noMatches ? (
              <span className="simple-muted">No items match that search.</span>
            ) : (
              <>
                {filteredHardware.length > 0 ? (
                  <>
                    {showBothGroups ? (
                      <p className="hw-link-group-label">Hardware</p>
                    ) : null}
                    {filteredHardware.map((unit) => (
                      <UnitCheck
                        key={unit.id}
                        unit={unit}
                        checked={selectedIds.includes(unit.id)}
                        disabled={disabled}
                        onToggle={() => toggle(unit.id)}
                      />
                    ))}
                  </>
                ) : null}
                {filteredInventory.length > 0 ? (
                  <>
                    {showBothGroups ? (
                      <p className="hw-link-group-label">Inventory</p>
                    ) : null}
                    {filteredInventory.map((unit) => (
                      <UnitCheck
                        key={unit.id}
                        unit={unit}
                        checked={selectedIds.includes(unit.id)}
                        disabled={disabled}
                        onToggle={() => toggle(unit.id)}
                        showQty
                      />
                    ))}
                  </>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </fieldset>
  )
}

function UnitCheck({
  unit,
  checked,
  disabled,
  onToggle,
  showQty,
}: {
  unit: HardwareUnit
  checked: boolean
  disabled?: boolean
  onToggle: () => void
  showQty?: boolean
}) {
  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      {unit.name}
      <span className="simple-muted">
        {HARDWARE_KIND_LABELS[unit.kind]}
        {unit.partNumber ? ` · ${unit.partNumber}` : ''}
        {showQty ? ` · ${unitQuantity(unit)} on hand` : ''}
      </span>
    </label>
  )
}

export function linkedInventoryNames(
  ids: string[] | undefined,
  units: HardwareUnit[],
) {
  return linkedUnitNames(ids, units)
}

export function linkedUnitNames(
  ids: string[] | undefined,
  units: HardwareUnit[],
) {
  if (!ids?.length) return []
  const byId = new Map(units.map((u) => [u.id, u]))
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((u) => u!.name)
}
