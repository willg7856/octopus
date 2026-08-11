import { useMemo, useState } from 'react'
import {
  HARDWARE_KIND_LABELS,
  installInventoryOnHardware,
  isInventoryKind,
  linkInventoryToHardware,
  returnInventoryFromHardware,
  sortUnits,
  stockStatusOf,
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

  const linkedIds = hardware.linkedInventoryIds ?? []
  const linkedParts = useMemo(() => {
    const byId = new Map(allUnits.map((u) => [u.id, u]))
    return linkedIds
      .map((id) => byId.get(id))
      .filter((u): u is HardwareUnit => Boolean(u && isInventoryKind(u.kind)))
  }, [linkedIds, allUnits])

  const availableToAdd = useMemo(() => {
    const linked = new Set(linkedIds)
    return sortUnits(
      inventory.filter((u) => {
        if (linked.has(u.id)) return false
        if (!q) return true
        return [u.name, u.serial, u.partNumber, HARDWARE_KIND_LABELS[u.kind]]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      }),
    )
  }, [inventory, linkedIds, q])

  function saveUnits(nextUnits: HardwareUnit[], message: string) {
    setError(null)
    void store.commit(
      (prev: HardwareLabState) => ({ ...prev, units: nextUnits }),
      message,
    )
  }

  function linkPart(inventoryId: string) {
    const now = new Date().toISOString()
    const next = linkInventoryToHardware(allUnits, hardware.id, inventoryId).map(
      (u) => (u.id === hardware.id ? { ...u, updatedAt: now } : u),
    )
    saveUnits(next, 'Part linked')
    setQuery('')
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

  function returnPart(inventoryId: string) {
    const result = returnInventoryFromHardware(allUnits, inventoryId)
    if (result.error) {
      setError(result.error)
      return
    }
    saveUnits(result.units, 'Returned to stock')
  }

  function unlinkPart(inventoryId: string) {
    saveUnits(
      unlinkInventoryFromHardware(allUnits, hardware.id, inventoryId),
      'Part unlinked',
    )
  }

  return (
    <section className="hw-parts" aria-label="Parts from inventory">
      <h4>Parts</h4>
      <p className="simple-muted">
        Link for BOM tracking, or Install to reserve stock on this unit
        (unavailable elsewhere until returned).
      </p>

      {error ? (
        <p className="simple-error" role="alert">
          {error}
        </p>
      ) : null}

      {linkedParts.length === 0 ? (
        <p className="simple-muted">No parts linked yet.</p>
      ) : (
        <ul className="hw-parts-list">
          {linkedParts.map((part) => {
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
                        : ' · linked only'}
                  </span>
                </div>
                <span
                  className="status-badge"
                  data-kind="stock"
                  data-status={
                    installedHere || installedElsewhere
                      ? 'reserved'
                      : stockStatusOf(part)
                  }
                >
                  {installedHere
                    ? 'Installed'
                    : installedElsewhere
                      ? 'Reserved elsewhere'
                      : 'Linked'}
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
                    <button
                      type="button"
                      className="btn btn-ghost"
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
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={disabled}
                    onClick={() => unlinkPart(part.id)}
                  >
                    Unlink
                  </button>
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
          placeholder="Search inventory to add…"
          aria-label="Search inventory to add parts"
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
                        className="btn btn-ghost"
                        disabled={disabled}
                        onClick={() => linkPart(part.id)}
                      >
                        Link
                      </button>
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
            Type to find inventory, then Link (track only) or Install (reserve).
          </p>
        )}
      </div>
    </section>
  )
}
