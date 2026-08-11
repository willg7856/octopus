import { useMemo, useState } from 'react'
import { useConfirm } from './ConfirmDialog'
import {
  HARDWARE_KIND_LABELS,
  installInventoryOnHardware,
  isInventoryKind,
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
        if (partIds.has(u.id)) return false
        if (u.installedOnUnitId && u.installedOnUnitId !== hardware.id) {
          // still show but Install disabled
        }
        if (!q) return true
        return [u.name, u.serial, u.partNumber, HARDWARE_KIND_LABELS[u.kind]]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      }),
    )
  }, [inventory, partIds, q, hardware.id])

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
    const raw = qtyById[inventoryId]
    const parsed = raw != null && raw !== '' ? Number(raw) : 1
    const qty = Number.isFinite(parsed) ? Math.floor(parsed) : 1
    const result = installInventoryOnHardware(
      allUnits,
      hardware.id,
      inventoryId,
      onHand > 1 ? qty : 1,
    )
    if (result.error) {
      setError(result.error)
      return
    }
    saveUnits(result.units, 'Installed / reserved')
    setQuery('')
    setQtyById((prev) => {
      const next = { ...prev }
      delete next[inventoryId]
      return next
    })
  }

  async function returnPart(inventoryId: string) {
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
        Install inventory onto this unit to reserve it (or draw qty from a
        multi-qty line). Unavailable elsewhere until returned.
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
                    {HARDWARE_KIND_LABELS[part.kind]} ·{' '}
                    {unitQuantity(part)} on hand
                    {installedHere
                      ? ' · reserved here'
                      : drawn > 0
                        ? ` · drew ${drawn}`
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
                      ? `Drew ${drawn}`
                      : installedElsewhere
                        ? 'Reserved elsewhere'
                        : 'Needs install'}
                </span>
                <div className="hw-parts-actions">
                  {installedHere || drawn > 0 ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={disabled}
                      onClick={() => void returnPart(part.id)}
                    >
                      Return
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-accent"
                        disabled={disabled || installedElsewhere}
                        onClick={() => installPart(part.id)}
                      >
                        Install
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={disabled}
                        onClick={() => void returnPart(part.id)}
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
              {q ? 'No matching inventory items.' : 'No available inventory items.'}
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
              return (
                <li key={part.id}>
                  <span>
                    <strong>{part.name}</strong>
                    <span className="simple-muted">
                      {HARDWARE_KIND_LABELS[part.kind]} · {onHand} on hand
                      {busy ? ` · on ${host?.name ?? 'other unit'}` : ''}
                    </span>
                  </span>
                  <span className="hw-parts-actions">
                    {onHand > 1 ? (
                      <input
                        className="hw-parts-qty"
                        type="number"
                        min={1}
                        max={onHand}
                        inputMode="numeric"
                        value={qtyById[part.id] ?? '1'}
                        disabled={disabled || busy}
                        onChange={(e) =>
                          setQtyById((prev) => ({
                            ...prev,
                            [part.id]: e.target.value,
                          }))
                        }
                        aria-label={`Quantity of ${part.name} to install`}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={disabled || busy || onHand <= 0}
                      onClick={() => installPart(part.id)}
                    >
                      Install
                    </button>
                  </span>
                </li>
              )
            })
          )}
        </ul>
        {!q ? (
          <p className="simple-muted hw-parts-add-hint">
            Showing available stock — type to filter, set qty for multi-qty lines.
          </p>
        ) : null}
      </div>
      {confirmDialog}
    </section>
  )
}
