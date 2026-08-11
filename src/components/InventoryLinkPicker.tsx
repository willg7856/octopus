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
  legend?: string
  hint?: string
}

export function InventoryLinkPicker({
  units,
  selectedIds,
  onChange,
  disabled,
  includeHardware = false,
  legend = 'Parts from inventory',
  hint = 'Optional. Linking tracks what this uses — it does not change stock qty.',
}: InventoryLinkPickerProps) {
  const inventory = sortUnits(units.filter((u) => isInventoryKind(u.kind)))
  const hardware = includeHardware
    ? sortUnits(units.filter((u) => isSystemKind(u.kind)))
    : []

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    )
  }

  const empty =
    inventory.length === 0 && (!includeHardware || hardware.length === 0)

  return (
    <fieldset className="hw-link-fieldset" disabled={disabled}>
      <legend>{legend}</legend>
      {hint ? <p className="simple-muted hw-link-hint">{hint}</p> : null}
      <div className="hw-link-units">
        {empty ? (
          <span className="simple-muted">
            {includeHardware
              ? 'No hardware or inventory units yet.'
              : 'No inventory items yet — add stock first.'}
          </span>
        ) : (
          <>
            {includeHardware && hardware.length > 0 ? (
              <>
                <p className="hw-link-group-label">Hardware</p>
                {hardware.map((unit) => (
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
            {inventory.length > 0 ? (
              <>
                {includeHardware ? (
                  <p className="hw-link-group-label">Inventory</p>
                ) : null}
                {inventory.map((unit) => (
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
        {showQty ? ` · ${unitQuantity(unit)} on hand` : ''}
      </span>
    </label>
  )
}

export function linkedInventoryNames(
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
