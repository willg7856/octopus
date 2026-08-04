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

  const listTree = useMemo(
    () => buildHardwareTree(filtered, units),
    [filtered, units],
  )

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
    const parentVehicleId = resolveParentId(
      input.id,
      input.parentVehicleId,
      lab.units.filter((u) => isSystemKind(u.kind)),
    )
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
              {listTree.map((node) => (
                <HardwareTreeNodes
                  key={node.unit.id}
                  node={node}
                  depth={0}
                  selectedId={!adding ? selected?.id ?? null : null}
                  onOpen={openDetail}
                />
              ))}
              {listTree.length === 0 ? (
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
                parentCandidates={units}
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
                  parentCandidates={units}
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
  parentCandidates,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: HardwareUnit
  submitLabel: string
  parentCandidates: HardwareUnit[]
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

  const parentOptions = parentCandidates.filter((u) => {
    if (u.id === initial?.id) return false
    if (!initial?.id) return true
    return !wouldCreateParentCycle(initial.id, u.id, parentCandidates)
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editing || !name.trim() || !serial.trim()) return
    onSave({
      id: initial?.id,
      name: name.trim(),
      serial: serial.trim(),
      kind,
      status,
      parentVehicleId: parentVehicleId || undefined,
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
              onChange={(e) => setField('kind', e.target.value as HardwareKind)}
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
        <label>
          Parent unit
          <select
            value={parentVehicleId}
            onChange={(e) => setField('parentVehicleId', e.target.value)}
          >
            <option value="">None</option>
            {parentOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.serial ? ` (${u.serial})` : ''} ·{' '}
                {HARDWARE_KIND_LABELS[u.kind]}
              </option>
            ))}
          </select>
          {parentOptions.length === 0 ? (
            <span className="simple-muted">
              No other hardware units yet — add a vehicle or engine first, then
              link this under it.
            </span>
          ) : (
            <span className="simple-muted">
              Attach under any hardware unit (vehicle, engine, subsystem…).
            </span>
          )}
        </label>
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

type HardwareTreeNode = {
  unit: HardwareUnit
  children: HardwareTreeNode[]
}

function buildHardwareTree(
  filtered: HardwareUnit[],
  allSystem: HardwareUnit[],
): HardwareTreeNode[] {
  const byId = new Map(allSystem.map((u) => [u.id, u]))
  const visible = new Set(filtered.map((u) => u.id))

  for (const u of filtered) {
    let parentId = u.parentVehicleId
    while (parentId && byId.has(parentId) && !visible.has(parentId)) {
      visible.add(parentId)
      parentId = byId.get(parentId)?.parentVehicleId
    }
  }

  const childrenByParent = new Map<string, HardwareUnit[]>()
  const roots: HardwareUnit[] = []

  for (const id of visible) {
    const unit = byId.get(id)
    if (!unit) continue
    const parentId = unit.parentVehicleId
    if (parentId && visible.has(parentId) && byId.has(parentId)) {
      const list = childrenByParent.get(parentId) ?? []
      list.push(unit)
      childrenByParent.set(parentId, list)
    } else {
      roots.push(unit)
    }
  }

  function toNode(unit: HardwareUnit): HardwareTreeNode {
    return {
      unit,
      children: sortUnits(childrenByParent.get(unit.id) ?? []).map(toNode),
    }
  }

  return sortUnits(roots).map(toNode)
}

function wouldCreateParentCycle(
  unitId: string,
  newParentId: string,
  units: HardwareUnit[],
) {
  const byId = new Map(units.map((u) => [u.id, u]))
  let cur: string | undefined = newParentId
  const seen = new Set<string>()
  while (cur) {
    if (cur === unitId) return true
    if (seen.has(cur)) return true
    seen.add(cur)
    cur = byId.get(cur)?.parentVehicleId
  }
  return false
}

function resolveParentId(
  unitId: string | undefined,
  requested: string | undefined,
  units: HardwareUnit[],
) {
  const parentId = requested?.trim() || undefined
  if (!parentId) return undefined
  if (unitId && parentId === unitId) return undefined
  if (!units.some((u) => u.id === parentId)) return undefined
  if (unitId && wouldCreateParentCycle(unitId, parentId, units)) return undefined
  return parentId
}

function HardwareTreeNodes({
  node,
  depth,
  selectedId,
  onOpen,
}: {
  node: HardwareTreeNode
  depth: number
  selectedId: string | null
  onOpen: (id: string) => void
}) {
  const { unit, children } = node
  const nested = depth > 0
  return (
    <li className={nested ? undefined : 'hw-vehicle-group'}>
      <button
        type="button"
        className="simple-list-row"
        data-nested={nested ? 'true' : undefined}
        data-depth={nested ? String(Math.min(depth, 4)) : undefined}
        data-selected={selectedId === unit.id ? 'true' : 'false'}
        onClick={() => onOpen(unit.id)}
      >
        <span>
          <strong>{unit.name}</strong>
          <span className="simple-muted">
            {unit.serial} · {HARDWARE_KIND_LABELS[unit.kind]}
            {children.length > 0 ? ` · ${children.length} linked` : ''}
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
      {children.length > 0 ? (
        <ul className="hw-child-list">
          {children.map((child) => (
            <HardwareTreeNodes
              key={child.unit.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onOpen={onOpen}
            />
          ))}
        </ul>
      ) : null}
    </li>
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
