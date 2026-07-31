import { useMemo, useState } from 'react'
import type { AuthUser } from '../auth'
import {
  HARDWARE_KIND_LABELS,
  HARDWARE_STATUS_LABELS,
  newId,
  sortUnits,
} from '../hardwareData'
import type { HardwareStatus, HardwareUnit } from '../types'
import { useLabStore } from '../useLabStore'

const STATUS_OPTIONS = Object.entries(HARDWARE_STATUS_LABELS) as [
  HardwareStatus,
  string,
][]

export function HardwarePage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, toast } = store
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const units = useMemo(
    () => sortUnits(lab.units.filter((u) => u.kind !== 'other')),
    [lab.units],
  )
  const selected = units.find((u) => u.id === selectedId) ?? units[0] ?? null

  function updateStatus(unit: HardwareUnit, status: HardwareStatus) {
    const updatedAt = new Date().toISOString()
    void store.commit(
      {
        ...lab,
        units: lab.units.map((u) =>
          u.id === unit.id ? { ...u, status, updatedAt } : u,
        ),
        progress: [
          {
            id: newId('pg'),
            unitId: unit.id,
            date: updatedAt.slice(0, 10),
            status,
            note: `Status → ${HARDWARE_STATUS_LABELS[status]}`,
            author: user?.name,
          },
          ...lab.progress,
        ],
      },
      'Saved',
    )
  }

  function updateField(
    unit: HardwareUnit,
    patch: Partial<Pick<HardwareUnit, 'hwRev' | 'fwVersion' | 'location' | 'notes'>>,
  ) {
    const updatedAt = new Date().toISOString()
    void store.commit(
      {
        ...lab,
        units: lab.units.map((u) =>
          u.id === unit.id ? { ...u, ...patch, updatedAt } : u,
        ),
      },
      'Saved',
    )
  }

  return (
    <main className="simple-page" aria-label="Hardware">
      <header className="simple-head">
        <h2>Hardware</h2>
        <div className="simple-head-actions">
          {saving ? <span className="simple-muted">Saving…</span> : null}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void store.refresh({ quiet: true })}
            disabled={sync === 'loading'}
          >
            Refresh
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
            <ul className="simple-list">
              {units.map((unit) => (
                <li key={unit.id}>
                  <button
                    type="button"
                    className="simple-list-row"
                    data-selected={selected?.id === unit.id ? 'true' : 'false'}
                    onClick={() => setSelectedId(unit.id)}
                  >
                    <span>
                      <strong>{unit.name}</strong>
                      <span className="simple-muted">
                        {unit.serial} · {HARDWARE_KIND_LABELS[unit.kind]}
                      </span>
                    </span>
                    <span className="simple-muted">
                      {HARDWARE_STATUS_LABELS[unit.status]}
                    </span>
                  </button>
                </li>
              ))}
              {units.length === 0 ? (
                <li className="simple-muted">
                  No hardware units yet. Add them under Inventory.
                </li>
              ) : null}
            </ul>
          </section>

          <section className="simple-detail">
            {selected ? (
              <div className="simple-form">
                <h3>{selected.name}</h3>
                <p className="simple-muted">
                  {selected.serial} · {HARDWARE_KIND_LABELS[selected.kind]}
                </p>

                <label>
                  Status
                  <select
                    value={selected.status}
                    onChange={(e) =>
                      updateStatus(selected, e.target.value as HardwareStatus)
                    }
                  >
                    {STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  HW rev
                  <input
                    key={`${selected.id}-hw-${selected.updatedAt}`}
                    defaultValue={selected.hwRev}
                    onBlur={(e) => {
                      const hwRev = e.target.value.trim() || '—'
                      if (hwRev !== selected.hwRev) {
                        updateField(selected, { hwRev })
                      }
                    }}
                  />
                </label>

                <label>
                  Firmware
                  <input
                    key={`${selected.id}-fw-${selected.updatedAt}`}
                    defaultValue={selected.fwVersion ?? ''}
                    placeholder="—"
                    onBlur={(e) => {
                      const fwVersion = e.target.value.trim() || undefined
                      if ((fwVersion ?? '') !== (selected.fwVersion ?? '')) {
                        updateField(selected, { fwVersion })
                      }
                    }}
                  />
                </label>

                <label>
                  Location
                  <input
                    key={`${selected.id}-loc-${selected.updatedAt}`}
                    defaultValue={selected.location ?? ''}
                    onBlur={(e) => {
                      const location = e.target.value.trim() || undefined
                      if ((location ?? '') !== (selected.location ?? '')) {
                        updateField(selected, { location })
                      }
                    }}
                  />
                </label>

                <label>
                  Notes
                  <input
                    key={`${selected.id}-notes-${selected.updatedAt}`}
                    defaultValue={selected.notes ?? ''}
                    onBlur={(e) => {
                      const notes = e.target.value.trim() || undefined
                      if ((notes ?? '') !== (selected.notes ?? '')) {
                        updateField(selected, { notes })
                      }
                    }}
                  />
                </label>
              </div>
            ) : (
              <p className="simple-muted">Select a hardware unit.</p>
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
