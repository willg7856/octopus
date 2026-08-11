import { useMemo, useState } from 'react'
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
}

export function HardwarePartsPanel({
  hardware,
  inventory,
  allUnits,
  store,
  disabled,
}: HardwarePartsPanelProps) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
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
    // Legacy soft-links (pre install-only) still show until Install or Return
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
        if (!q) return true
        return [u.name, u.serial, u.partNumber, HARDWARE_KIND_LABELS[u.kind]]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      }),
    )
  }, [inventory, partIds, q])

  function saveUnits(nextUnits: HardwareUnit[], message: string) {
    setError(null)
    void store.commit(
      (prev: HardwareLabState) => ({ ...prev, units: nextUnits }),
      message,
    )
  }

  function installPart(inventoryId: string) {
    const result = installInventoryOnHardware(
      allUnits,
      hardware.id,
      inventoryId,
    )
    if (result.error) {
      setError(result.error)
      return
    }
    saveUnits(result.units, 'Installed / reserved')
    setQuery('')
  }

  /** Return stock to inventory and remove from this hardware unit. */
  function returnPart(inventoryId: string) {
    saveUnits(
      unlinkInventoryFromHardware(allUnits, hardware.id, inventoryId),
      'Returned to stock',
    )
  }

  return (
    <section className="hw-parts" aria-label="Parts from inventory">
      <h4>Parts</h4>
      <p className="simple-muted">
        Install inventory onto this unit to reserve it — unavailable elsewhere
        until returned.
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
            const installedElsewhere =
              Boolean(part.installedOnUnitId) && !installedHere
            const elsewhere = installedElsewhere
              ? allUnits.find((u) => u.id === part.installedOnUnitId)
              : null
            return (
              <li key={part.id} className="hw-parts-row">
                <div className="hw-parts-main">
                  <strong>{part.name}</strong>
                  <span className="simple-muted">
                    {HARDWARE_KIND_LABELS[part.kind]} ·{' '}
                    {unitQuantity(part)} on hand
                    {installedHere
                      ? ' · installed here'
                      : installedElsewhere
                        ? ` · on ${elsewhere?.name ?? 'other unit'}`
                        : ' · not reserved yet'}
                  </span>
                </div>
                <span
                  className="status-badge"
                  data-kind="stock"
                  data-status={installedHere || installedElsewhere ? 'reserved' : 'low'}
                >
                  {installedHere
                    ? 'Installed'
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
                      onClick={() => returnPart(part.id)}
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
                        title={
                          installedElsewhere
                            ? 'Return it from the other unit first'
                            : 'Reserve this stock on this hardware unit'
                        }
                      >
                        Install
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={disabled}
                        onClick={() => returnPart(part.id)}
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
        {query.trim() ? (
          <ul className="hw-parts-suggest">
            {availableToAdd.length === 0 ? (
              <li className="simple-muted">No matching inventory items.</li>
            ) : (
              availableToAdd.slice(0, 8).map((part) => {
                const busy =
                  Boolean(part.installedOnUnitId) &&
                  part.installedOnUnitId !== hardware.id
                const host = busy
                  ? allUnits.find((u) => u.id === part.installedOnUnitId)
                  : null
                return (
                  <li key={part.id}>
                    <span>
                      <strong>{part.name}</strong>
                      <span className="simple-muted">
                        {HARDWARE_KIND_LABELS[part.kind]} ·{' '}
                        {unitQuantity(part)} on hand
                        {busy ? ` · on ${host?.name ?? 'other unit'}` : ''}
                      </span>
                    </span>
                    <span className="hw-parts-actions">
                      <button
                        type="button"
                        className="btn btn-accent"
                        disabled={disabled || busy}
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
        ) : (
          <p className="simple-muted hw-parts-add-hint">
            Type to find inventory, then Install to reserve it on this unit.
          </p>
        )}
      </div>
    </section>
  )
}
