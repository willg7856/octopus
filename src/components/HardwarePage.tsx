import { useEffect, useMemo, useState, type FormEvent } from 'react'
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

  const listGroups = useMemo(() => {
    const vehicleById = new Map(
      units.filter((u) => u.kind === 'vehicle').map((u) => [u.id, u]),
    )
    const childrenByParent = new Map<string, HardwareUnit[]>()
    const unassigned: HardwareUnit[] = []

    for (const unit of filtered) {
      if (unit.kind === 'vehicle') continue
      const parentId = unit.parentVehicleId
      if (parentId && vehicleById.has(parentId)) {
        const list = childrenByParent.get(parentId) ?? []
        list.push(unit)
        childrenByParent.set(parentId, list)
      } else {
        unassigned.push(unit)
      }
    }

    const vehicleIds = new Set<string>()
    for (const u of filtered) {
      if (u.kind === 'vehicle') vehicleIds.add(u.id)
    }
    for (const parentId of childrenByParent.keys()) vehicleIds.add(parentId)

    const groups = sortUnits(
      [...vehicleIds]
        .map((id) => vehicleById.get(id))
        .filter((u): u is HardwareUnit => Boolean(u)),
    ).map((vehicle) => ({
      vehicle,
      children: sortUnits(childrenByParent.get(vehicle.id) ?? []),
    }))

    return { groups, unassigned: sortUnits(unassigned) }
  }, [filtered, units])

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
              {listGroups.groups.map(({ vehicle, children }) => (
                <li key={vehicle.id} className="hw-vehicle-group">
                  <button
                    type="button"
                    className="simple-list-row"
                    data-selected={
                      !adding && selected?.id === vehicle.id ? 'true' : 'false'
                    }
                    onClick={() => openDetail(vehicle.id)}
                  >
                    <span>
                      <strong>{vehicle.name}</strong>
                      <span className="simple-muted">
                        {vehicle.serial} · {HARDWARE_KIND_LABELS[vehicle.kind]}
                        {children.length > 0
                          ? ` · ${children.length} linked`
                          : ''}
                      </span>
                    </span>
                    <span
                      className="status-badge"
                      data-kind="hardware"
                      data-status={vehicle.status}
                    >
                      {HARDWARE_STATUS_LABELS[vehicle.status]}
                    </span>
                  </button>
                  {children.length > 0 ? (
                    <ul className="hw-child-list">
                      {children.map((unit) => (
                        <li key={unit.id}>
                          <button
                            type="button"
                            className="simple-list-row"
                            data-nested="true"
                            data-selected={
                              !adding && selected?.id === unit.id
                                ? 'true'
                                : 'false'
                            }
                            onClick={() => openDetail(unit.id)}
                          >
                            <span>
                              <strong>{unit.name}</strong>
                              <span className="simple-muted">
                                {unit.serial} ·{' '}
                                {HARDWARE_KIND_LABELS[unit.kind]}
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
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
              {listGroups.unassigned.length > 0 ? (
                <li className="hw-vehicle-group">
                  {listGroups.groups.length > 0 ? (
                    <div className="hw-group-heading">
                      <strong>Unassigned</strong>
                      <span className="simple-muted">No parent vehicle</span>
                    </div>
                  ) : null}
                  <ul
                    className="hw-child-list"
                    data-flat={listGroups.groups.length === 0 ? 'true' : undefined}
                  >
                    {listGroups.unassigned.map((unit) => (
                      <li key={unit.id}>
                        <button
                          type="button"
                          className="simple-list-row"
                          data-selected={
                            !adding && selected?.id === unit.id
                              ? 'true'
                              : 'false'
                          }
                          onClick={() => openDetail(unit.id)}
                        >
                          <span>
                            <strong>{unit.name}</strong>
                            <span className="simple-muted">
                              {unit.serial} · {HARDWARE_KIND_LABELS[unit.kind]}
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
                    ))}
                  </ul>
                </li>
              ) : null}
              {listGroups.groups.length === 0 &&
              listGroups.unassigned.length === 0 ? (
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

function fieldsFromUnit(unit?: HardwareUnit) {
  return {
    name: unit?.name ?? '',
    serial: unit?.serial ?? '',
    kind: (unit && isSystemKind(unit.kind) ? unit.kind : 'vehicle') as HardwareKind,
    status: (unit?.status ?? 'concept') as HardwareStatus,
    parentVehicleId: unit?.parentVehicleId ?? '',
    location: unit?.location ?? '',
    hwRev: unit?.hwRev ?? '',
    fwVersion: unit?.fwVersion ?? '',
    owner: unit?.owner ?? '',
    notes: unit?.notes ?? '',
  }
}

function SystemForm({
  initial,
  submitLabel,
  vehicles,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: HardwareUnit
  submitLabel: string
  vehicles: HardwareUnit[]
  onSave: (unit: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string }) => void
  onDelete?: () => void
  onCancel?: () => void
}) {
  const isNew = !initial
  const [editing, setEditing] = useState(isNew)
  const [fields, setFields] = useState(() => fieldsFromUnit(initial))
  const {
    name,
    serial,
    kind,
    status,
    parentVehicleId,
    location,
    hwRev,
    fwVersion,
    owner,
    notes,
  } = fields

  useEffect(() => {
    if (!initial || editing) return
    setFields(fieldsFromUnit(initial))
  }, [
    editing,
    initial?.id,
    initial?.updatedAt,
    initial?.name,
    initial?.serial,
    initial?.kind,
    initial?.status,
    initial?.parentVehicleId,
    initial?.location,
    initial?.hwRev,
    initial?.fwVersion,
    initial?.owner,
    initial?.notes,
  ])

  function setField<K extends keyof typeof fields>(
    key: K,
    value: (typeof fields)[K],
  ) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit() {
    setFields(fieldsFromUnit(initial))
    setEditing(true)
  }

  function cancelEdit() {
    if (isNew) {
      onCancel?.()
      return
    }
    setFields(fieldsFromUnit(initial))
    setEditing(false)
  }

  const parentOptions = vehicles.filter((v) => v.id !== initial?.id)
  const showParent = kind !== 'vehicle'

  function handleKindChange(next: HardwareKind) {
    setFields((prev) => ({
      ...prev,
      kind: next,
      parentVehicleId: next === 'vehicle' ? '' : prev.parentVehicleId,
    }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editing || !name.trim() || !serial.trim()) return
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
    if (!isNew) setEditing(false)
  }

  return (
    <form
      className="simple-form"
      data-editing={editing ? 'true' : 'false'}
      onSubmit={handleSubmit}
    >
      <div className="simple-form-title-row">
        <div>
          <h3>{initial ? initial.name : 'New vehicle / subsystem'}</h3>
          <p className="simple-muted">
            {editing
              ? 'Edit details, then Save to lock the form. Status changes append a progress note.'
              : 'Viewing saved details. Click Edit to make changes.'}
          </p>
        </div>
        {!isNew && !editing ? (
          <button type="button" className="btn btn-accent" onClick={startEdit}>
            Edit
          </button>
        ) : null}
      </div>
      <fieldset className="simple-form-fields" disabled={!editing}>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="STRAVOX airframe"
            required={editing}
          />
        </label>
        <label>
          Asset serial
          <input
            value={serial}
            onChange={(e) => setField('serial', e.target.value)}
            placeholder="SVX-B1M-001"
            required={editing}
          />
        </label>
        <div className="simple-form-row">
          <label>
            Hardware type
            <select
              value={kind}
              onChange={(e) => handleKindChange(e.target.value as HardwareKind)}
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
              onChange={(e) =>
                setField('status', e.target.value as HardwareStatus)
              }
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
              onChange={(e) => setField('parentVehicleId', e.target.value)}
            >
              <option value="">None</option>
              {parentOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.serial ? ` (${v.serial})` : ''}
                </option>
              ))}
            </select>
            {parentOptions.length === 0 ? (
              <span className="simple-muted">
                No vehicles yet — add a Hardware unit with type Vehicle first,
                then link it here.
              </span>
            ) : null}
          </label>
        ) : null}
        <div className="simple-form-row">
          <label>
            HW revision
            <input
              value={hwRev}
              onChange={(e) => setField('hwRev', e.target.value)}
              placeholder="B1M · rev A"
            />
          </label>
          <label>
            Firmware
            <input
              value={fwVersion}
              onChange={(e) => setField('fwVersion', e.target.value)}
              placeholder="0.4.2-dev"
            />
          </label>
        </div>
        <div className="simple-form-row">
          <label>
            Location
            <input
              value={location}
              onChange={(e) => setField('location', e.target.value)}
              placeholder="Goods Shed · bench"
            />
          </label>
          <label>
            Owner / team
            <input
              value={owner}
              onChange={(e) => setField('owner', e.target.value)}
              placeholder="Structures, Avionics…"
            />
          </label>
        </div>
        <label>
          Notes
          <input
            value={notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Open work, constraints, next gate…"
          />
        </label>
      </fieldset>
      <div className="simple-form-actions">
        {editing ? (
          <>
            <button type="submit" className="btn btn-accent">
              {submitLabel}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
              Cancel
            </button>
          </>
        ) : null}
        {onDelete && editing ? (
          <button type="button" className="btn btn-ghost" onClick={onDelete}>
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
