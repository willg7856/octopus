import { useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import { useConfirm } from './ConfirmDialog'
import { SyncBar } from './SyncBar'
import {
  HARDWARE_KIND_LABELS,
  HARDWARE_STATUS_LABELS,
  SYSTEM_KINDS,
  TEST_KIND_LABELS,
  TEST_RESULT_LABELS,
  isSystemKind,
  newId,
  sortProgress,
  sortTests,
  sortUnits,
} from '../hardwareData'
import type {
  HardwareKind,
  HardwareProgressNote,
  HardwareStatus,
  HardwareUnit,
  TestKind,
  TestLogEntry,
  TestResult,
} from '../types'
import { useLabStore } from '../useLabStore'

const KIND_OPTIONS = SYSTEM_KINDS.map(
  (kind) => [kind, HARDWARE_KIND_LABELS[kind]] as const,
)
const STATUS_OPTIONS = Object.entries(HARDWARE_STATUS_LABELS) as [
  HardwareStatus,
  string,
][]
const TEST_KIND_OPTIONS = Object.entries(TEST_KIND_LABELS) as [TestKind, string][]
const TEST_RESULT_OPTIONS = Object.entries(TEST_RESULT_LABELS) as [
  TestResult,
  string,
][]

export function HardwarePage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, conflict, toast, updatedAt, updatedBy } =
    store
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [mobileMode, setMobileMode] = useState<'list' | 'detail'>('list')

  const units = useMemo(
    () => sortUnits(lab.units.filter((u) => isSystemKind(u.kind))),
    [lab.units],
  )
  const vehicles = useMemo(
    () => units.filter((u) => u.kind === 'vehicle'),
    [units],
  )
  const unitNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of lab.units) map.set(u.id, u.name)
    return map
  }, [lab.units])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return units
    return units.filter((u) => {
      const parentName = u.parentVehicleId
        ? unitNameById.get(u.parentVehicleId)
        : undefined
      return [u.name, u.serial, u.location, u.owner, u.kind, u.status, u.hwRev, parentName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [units, query, unitNameById])

  const selected =
    units.find((u) => u.id === selectedId) ??
    (mobileMode === 'detail' ? null : filtered[0] ?? null)

  const unitProgress = useMemo(
    () =>
      selected
        ? sortProgress(lab.progress.filter((p) => p.unitId === selected.id))
        : [],
    [lab.progress, selected],
  )
  const unitTests = useMemo(
    () =>
      selected
        ? sortTests(lab.tests.filter((t) => t.unitIds.includes(selected.id)))
        : [],
    [lab.tests, selected],
  )

  function openDetail(id: string | null, isAdding = false) {
    setAdding(isAdding)
    setSelectedId(id)
    setMobileMode('detail')
  }

  function saveUnit(
    input: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string },
  ) {
    const kind = isSystemKind(input.kind) ? input.kind : 'vehicle'
    const parentVehicleId =
      kind === 'vehicle' ? undefined : input.parentVehicleId || undefined
    const updatedAtNow = new Date().toISOString()
    if (input.id) {
      void store.commit((prev) => {
        const existing = prev.units.find((u) => u.id === input.id)
        const statusChanged = existing && existing.status !== input.status
        const note: HardwareProgressNote | null =
          statusChanged && existing
            ? {
                id: newId('pg'),
                unitId: input.id!,
                date: updatedAtNow.slice(0, 10),
                status: input.status,
                note: `Status → ${HARDWARE_STATUS_LABELS[input.status]}${
                  input.notes?.trim() ? ` · ${input.notes.trim()}` : ''
                }`,
                author: user?.name,
              }
            : null
        return {
          ...prev,
          units: prev.units.map((u) =>
            u.id === input.id
              ? {
                  ...u,
                  ...input,
                  kind,
                  parentVehicleId,
                  updatedAt: updatedAtNow,
                }
              : u,
          ),
          progress: note ? [note, ...prev.progress] : prev.progress,
        }
      }, 'Saved')
      return
    }

    const next: HardwareUnit = {
      ...input,
      kind,
      parentVehicleId,
      id: newId('hw'),
      updatedAt: updatedAtNow,
    }
    const note: HardwareProgressNote = {
      id: newId('pg'),
      unitId: next.id,
      date: updatedAtNow.slice(0, 10),
      status: next.status,
      note: 'Added to hardware',
      author: user?.name,
    }
    void store.commit(
      (prev) => ({
        ...prev,
        units: [...prev.units, next],
        progress: [note, ...prev.progress],
      }),
      'Added',
    )
    openDetail(next.id)
  }

  function addTest(input: {
    title: string
    kind: TestKind
    result: TestResult
    summary: string
    site?: string
  }) {
    if (!selected) return
    const unitId = selected.id
    const now = new Date().toISOString()
    const entry: TestLogEntry = {
      id: newId('test'),
      date: now.slice(0, 10),
      title: input.title.trim(),
      kind: input.kind,
      result: input.result,
      unitIds: [unitId],
      site: input.site?.trim() || undefined,
      operator: user?.name,
      summary: input.summary.trim(),
      createdAt: now,
    }
    void store.commit(
      (prev) => ({
        ...prev,
        tests: [entry, ...prev.tests],
      }),
      'Test logged',
    )
  }

  async function removeUnit(id: string) {
    const unit = lab.units.find((u) => u.id === id)
    if (!unit) return
    const ok = await confirm(`Remove “${unit.name}” from hardware?`)
    if (!ok) return
    void store.commit(
      (prev) => ({
        ...prev,
        units: prev.units
          .filter((u) => u.id !== id)
          .map((u) =>
            u.parentVehicleId === id ? { ...u, parentVehicleId: undefined } : u,
          ),
        progress: prev.progress.filter((p) => p.unitId !== id),
        tests: prev.tests.map((t) => ({
          ...t,
          unitIds: t.unitIds.filter((uid) => uid !== id),
        })),
        processes: prev.processes
          .filter((p) => p.vehicleUnitId !== id)
          .map((p) => ({
            ...p,
            steps: p.steps.map((s) => ({
              ...s,
              linkedUnitIds: (s.linkedUnitIds ?? []).filter((uid) => uid !== id),
            })),
          })),
      }),
      'Removed',
    )
    setSelectedId(null)
    setMobileMode('list')
  }

  return (
    <main className="simple-page" aria-label="Hardware">
      <header className="simple-head">
        <div>
          <h2>Hardware</h2>
          <p className="simple-muted">
            Vehicles & subsystems — build status, revs, and firmware. Not stock.
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
            onClick={() => openDetail(null, true)}
          >
            Add unit
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
              aria-label="Search hardware"
            />
            <ul className="simple-list">
              {filtered.map((unit) => {
                const parentName = unit.parentVehicleId
                  ? unitNameById.get(unit.parentVehicleId)
                  : undefined
                return (
                <li key={unit.id}>
                  <button
                    type="button"
                    className="simple-list-row"
                    data-selected={
                      !adding && selected?.id === unit.id ? 'true' : 'false'
                    }
                    onClick={() => openDetail(unit.id)}
                  >
                    <span>
                      <strong>{unit.name}</strong>
                      <span className="simple-muted">
                        {unit.serial} · {HARDWARE_KIND_LABELS[unit.kind]}
                        {parentName ? ` · → ${parentName}` : ''}
                      </span>
                    </span>
                    <span
                      className="status-badge"
                      data-kind="hardware"
                      data-status={unit.status}
                    >
                      {HARDWARE_STATUS_LABELS[unit.status]}
                    </span>
                  </button>
                </li>
                )
              })}
              {filtered.length === 0 ? (
                <li className="simple-muted">
                  {query.trim()
                    ? 'No units match that search.'
                    : 'No vehicles or subsystems yet — add one to start.'}
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
              <SystemForm
                key="new"
                submitLabel="Add"
                vehicles={vehicles}
                onCancel={() => {
                  setAdding(false)
                  setMobileMode('list')
                }}
                onSave={saveUnit}
              />
            ) : selected ? (
              <>
                <SystemForm
                  key={selected.id}
                  initial={selected}
                  submitLabel="Save"
                  vehicles={vehicles}
                  onSave={saveUnit}
                  onDelete={() => removeUnit(selected.id)}
                />
                <section className="hw-history" aria-label="Progress history">
                  <h4>Progress</h4>
                  {unitProgress.length === 0 ? (
                    <p className="simple-muted">
                      No notes yet — status changes are logged here.
                    </p>
                  ) : (
                    <ul className="hw-history-list">
                      {unitProgress.slice(0, 12).map((note) => (
                        <li key={note.id}>
                          <strong>
                            {note.date} · {HARDWARE_STATUS_LABELS[note.status]}
                          </strong>
                          <span className="simple-muted">
                            {note.note}
                            {note.author ? ` · ${note.author}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="hw-tests" aria-label="Tests">
                  <h4>Tests</h4>
                  {unitTests.length === 0 ? (
                    <p className="simple-muted">No tests logged for this unit.</p>
                  ) : (
                    <ul className="hw-tests-list">
                      {unitTests.slice(0, 12).map((test) => (
                        <li key={test.id}>
                          <strong>
                            {test.date} · {test.title}
                          </strong>
                          <span className="simple-muted">
                            {TEST_KIND_LABELS[test.kind]} ·{' '}
                            {TEST_RESULT_LABELS[test.result]}
                            {test.summary ? ` — ${test.summary}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <AddTestForm onAdd={addTest} />
                </section>
              </>
            ) : (
              <p className="simple-muted">Select a unit or add one.</p>
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

function SystemForm({
  initial,
  submitLabel,
  vehicles,
  onSave,
  onDelete,
  onCancel,
  disabled,
}: {
  initial?: HardwareUnit
  submitLabel: string
  vehicles: HardwareUnit[]
  onSave: (unit: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string }) => void
  onDelete?: () => void
  onCancel?: () => void
  disabled?: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [serial, setSerial] = useState(initial?.serial ?? '')
  const [kind, setKind] = useState<HardwareKind>(
    initial && isSystemKind(initial.kind) ? initial.kind : 'vehicle',
  )
  const [status, setStatus] = useState<HardwareStatus>(
    initial?.status ?? 'concept',
  )
  const [parentVehicleId, setParentVehicleId] = useState(
    initial?.parentVehicleId ?? '',
  )
  const [location, setLocation] = useState(initial?.location ?? '')
  const [hwRev, setHwRev] = useState(initial?.hwRev ?? '')
  const [fwVersion, setFwVersion] = useState(initial?.fwVersion ?? '')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const parentOptions = vehicles.filter((v) => v.id !== initial?.id)
  const showParent = kind !== 'vehicle'

  function handleKindChange(next: HardwareKind) {
    setKind(next)
    if (next === 'vehicle') setParentVehicleId('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !serial.trim() || disabled) return
    onSave({
      id: initial?.id,
      name: name.trim(),
      serial: serial.trim(),
      kind,
      status,
      parentVehicleId:
        kind === 'vehicle' ? undefined : parentVehicleId || undefined,
      location: location.trim() || undefined,
      quantity: 1,
      hwRev: hwRev.trim() || '—',
      fwVersion: fwVersion.trim() || undefined,
      partNumber: initial?.partNumber,
      owner: owner.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <form className="simple-form" onSubmit={handleSubmit}>
      <h3>{initial ? initial.name : 'New vehicle / subsystem'}</h3>
      <p className="simple-muted">
        Track flight articles and GSE — serial, build status, HW/FW. Not bin stock.
        Changing build status appends a progress note.
      </p>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="STRAVOX airframe"
          required
          disabled={disabled}
        />
      </label>
      <label>
        Asset serial
        <input
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          placeholder="SVX-B1M-001"
          required
          disabled={disabled}
        />
      </label>
      <div className="simple-form-row">
        <label>
          Hardware type
          <select
            value={kind}
            onChange={(e) => handleKindChange(e.target.value as HardwareKind)}
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
          Build status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as HardwareStatus)}
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
      {showParent ? (
        <label>
          Parent vehicle
          <select
            value={parentVehicleId}
            onChange={(e) => setParentVehicleId(e.target.value)}
            disabled={disabled}
          >
            <option value="">None</option>
            {parentOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.serial ? ` (${v.serial})` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="simple-form-row">
        <label>
          HW revision
          <input
            value={hwRev}
            onChange={(e) => setHwRev(e.target.value)}
            placeholder="B1M · rev A"
            disabled={disabled}
          />
        </label>
        <label>
          Firmware
          <input
            value={fwVersion}
            onChange={(e) => setFwVersion(e.target.value)}
            placeholder="0.4.2-dev"
            disabled={disabled}
          />
        </label>
      </div>
      <div className="simple-form-row">
        <label>
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Goods Shed · bench"
            disabled={disabled}
          />
        </label>
        <label>
          Owner / team
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Structures, Avionics…"
            disabled={disabled}
          />
        </label>
      </div>
      <label>
        Notes
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Open work, constraints, next gate…"
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

function AddTestForm({
  onAdd,
  disabled,
}: {
  onAdd: (input: {
    title: string
    kind: TestKind
    result: TestResult
    summary: string
    site?: string
  }) => void
  disabled?: boolean
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TestKind>('ground')
  const [result, setResult] = useState<TestResult>('pass')
  const [summary, setSummary] = useState('')
  const [site, setSite] = useState('')

  return (
    <form
      className="simple-form"
      style={{ marginTop: '0.85rem' }}
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim() || !summary.trim() || disabled) return
        onAdd({ title, kind, result, summary, site })
        setTitle('')
        setSummary('')
        setSite('')
      }}
    >
      <p className="simple-muted">Log a test against this unit.</p>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Checkout power-on"
          required
          disabled={disabled}
        />
      </label>
      <div className="simple-form-row">
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as TestKind)}
            disabled={disabled}
          >
            {TEST_KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Result
          <select
            value={result}
            onChange={(e) => setResult(e.target.value as TestResult)}
            disabled={disabled}
          >
            {TEST_RESULT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Summary
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What was measured / observed"
          required
          disabled={disabled}
        />
      </label>
      <label>
        Site
        <input
          value={site}
          onChange={(e) => setSite(e.target.value)}
          placeholder="Goods Shed"
          disabled={disabled}
        />
      </label>
      <div className="simple-form-actions">
        <button type="submit" className="btn btn-ghost" disabled={disabled}>
          Add test
        </button>
      </div>
    </form>
  )
}
