import { useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import { downloadHardwareLabExport } from '../exportHardware'
import {
  HARDWARE_KIND_LABELS,
  HARDWARE_STATUS_LABELS,
  TEST_KIND_LABELS,
  TEST_RESULT_LABELS,
  newId,
  sortProgress,
  sortTests,
  sortUnits,
  unitQuantity,
} from '../hardwareData'
import type {
  HardwareKind,
  HardwareProgressNote,
  HardwareStatus,
  HardwareUnit,
  TestKind,
  TestLogEntry,
  TestMetric,
  TestResult,
} from '../types'
import { useLabStore } from '../useLabStore'

type InvTab = 'units' | 'tests'

const KIND_OPTIONS = Object.entries(HARDWARE_KIND_LABELS) as [
  HardwareKind,
  string,
][]
const STATUS_OPTIONS = Object.entries(HARDWARE_STATUS_LABELS) as [
  HardwareStatus,
  string,
][]
const TEST_KIND_OPTIONS = Object.entries(TEST_KIND_LABELS) as [TestKind, string][]
const TEST_RESULT_OPTIONS = Object.entries(TEST_RESULT_LABELS) as [
  TestResult,
  string,
][]

function statusPill(status: HardwareStatus) {
  if (status === 'flight-ready') return 'done'
  if (status === 'failed' || status === 'retired') return 'blocked'
  if (status === 'checkout' || status === 'assembly') return 'active'
  return 'upcoming'
}

export function InventoryPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, toast, updatedAt, updatedBy, revision } =
    store
  const [tab, setTab] = useState<InvTab>('units')
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<HardwareKind | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<HardwareStatus | 'all'>('all')

  const units = useMemo(() => sortUnits(lab.units), [lab.units])
  const tests = useMemo(() => sortTests(lab.tests), [lab.tests])
  const progress = useMemo(() => sortProgress(lab.progress), [lab.progress])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return units.filter((u) => {
      if (kindFilter !== 'all' && u.kind !== kindFilter) return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (!q) return true
      const hay = [
        u.name,
        u.serial,
        u.partNumber,
        u.hwRev,
        u.fwVersion,
        u.location,
        u.owner,
        u.notes,
        HARDWARE_KIND_LABELS[u.kind],
        HARDWARE_STATUS_LABELS[u.status],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [units, query, kindFilter, statusFilter])

  const selectedUnit =
    filtered.find((u) => u.id === selectedUnitId) ??
    units.find((u) => u.id === selectedUnitId) ??
    filtered[0] ??
    null

  async function commit(next: typeof lab, message: string) {
    await store.commit(next, message)
  }

  function handleSaveUnit(
    input: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string },
  ) {
    const updatedAtNext = new Date().toISOString()
    if (input.id) {
      const nextUnits = lab.units.map((u) =>
        u.id === input.id ? { ...u, ...input, updatedAt: updatedAtNext } : u,
      )
      void commit({ ...lab, units: nextUnits }, 'Inventory item updated')
      setSelectedUnitId(input.id)
      return
    }

    const nextUnit: HardwareUnit = {
      ...input,
      id: newId('hw'),
      updatedAt: updatedAtNext,
    }
    const note: HardwareProgressNote = {
      id: newId('pg'),
      unitId: nextUnit.id,
      date: updatedAtNext.slice(0, 10),
      status: nextUnit.status,
      note: `Added to inventory${nextUnit.notes ? ` — ${nextUnit.notes}` : '.'}`,
      author: nextUnit.owner || user?.name || undefined,
    }
    void commit(
      {
        ...lab,
        units: [...lab.units, nextUnit],
        progress: [note, ...lab.progress],
      },
      'Inventory item added',
    )
    setSelectedUnitId(nextUnit.id)
    setTab('units')
  }

  function handleUpdateStatus(unitId: string, status: HardwareStatus, note: string) {
    const updatedAtNext = new Date().toISOString()
    const nextUnits = lab.units.map((u) =>
      u.id === unitId ? { ...u, status, updatedAt: updatedAtNext } : u,
    )
    const progressNote: HardwareProgressNote = {
      id: newId('pg'),
      unitId,
      date: updatedAtNext.slice(0, 10),
      status,
      note: note.trim() || `Status → ${HARDWARE_STATUS_LABELS[status]}`,
      author: user?.name || undefined,
    }
    void commit(
      {
        ...lab,
        units: nextUnits,
        progress: [progressNote, ...lab.progress],
      },
      'Status updated',
    )
  }

  function handleDeleteUnit(unitId: string) {
    const unit = lab.units.find((u) => u.id === unitId)
    if (!unit) return
    if (!window.confirm(`Remove ${unit.name} (${unit.serial}) from inventory?`)) {
      return
    }
    void commit(
      {
        ...lab,
        units: lab.units.filter((u) => u.id !== unitId),
        progress: lab.progress.filter((p) => p.unitId !== unitId),
        tests: lab.tests.map((t) => ({
          ...t,
          unitIds: t.unitIds.filter((id) => id !== unitId),
        })),
        processes: lab.processes.map((p) => ({
          ...p,
          steps: p.steps.map((s) => ({
            ...s,
            linkedUnitIds: (s.linkedUnitIds ?? []).filter((id) => id !== unitId),
          })),
        })),
      },
      'Inventory item removed',
    )
    setSelectedUnitId(null)
  }

  function handleAddTest(entry: Omit<TestLogEntry, 'id' | 'createdAt'>) {
    const next: TestLogEntry = {
      ...entry,
      id: newId('test'),
      createdAt: new Date().toISOString(),
      operator: entry.operator || user?.name || undefined,
    }
    void commit({ ...lab, tests: [next, ...lab.tests] }, 'Test log saved')
    setTab('tests')
  }

  const counts = {
    units: lab.units.length,
    qty: lab.units.reduce((sum, u) => sum + unitQuantity(u), 0),
    active: lab.units.filter(
      (u) => u.status !== 'retired' && u.status !== 'failed',
    ).length,
    tests: lab.tests.length,
  }

  return (
    <main className="hub-page hub-page-inner hardware-page" aria-label="Inventory">
      <header className="hub-page-head hardware-head">
        <div>
          <h2 className="hub-page-title">Inventory</h2>
          <p className="hub-page-lede">
            Track units, serials, revisions, locations, and quantities. Shared for
            everyone signed in.
          </p>
          {sync === 'shared' && updatedAt ? (
            <p className="hardware-sync-meta">
              Rev {revision} · last update {new Date(updatedAt).toLocaleString()}
              {updatedBy ? ` · ${updatedBy}` : ''}
              {saving ? ' · saving…' : ''}
            </p>
          ) : null}
          {sync === 'local' ? (
            <p className="hardware-sync-meta">
              Local Vite fallback — edits stay in this browser.
            </p>
          ) : null}
          {sync === 'error' && syncError ? (
            <p className="hardware-sync-error" role="alert">
              {syncError}
            </p>
          ) : null}
        </div>
        <div className="hardware-head-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void store.refresh()}
            disabled={sync === 'loading' || saving}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => downloadHardwareLabExport(lab)}
            disabled={sync === 'loading'}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void store.reset()}
            disabled={sync === 'loading' || sync === 'error' || saving}
          >
            Reset seed
          </button>
        </div>
      </header>

      {sync === 'loading' ? (
        <p className="hub-empty hub-empty-spaced">Loading inventory…</p>
      ) : null}

      {sync === 'shared' || sync === 'local' ? (
        <>
          <dl className="hardware-stats inventory-stats" aria-label="Inventory summary">
            <div>
              <dt>Items</dt>
              <dd>{counts.units}</dd>
            </div>
            <div>
              <dt>Qty on hand</dt>
              <dd>{counts.qty}</dd>
            </div>
            <div>
              <dt>Active</dt>
              <dd>{counts.active}</dd>
            </div>
            <div>
              <dt>Tests</dt>
              <dd>{counts.tests}</dd>
            </div>
          </dl>

          <div className="hardware-tabs" role="tablist" aria-label="Inventory sections">
            {(
              [
                ['units', 'Units'],
                ['tests', 'Test log'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className="hardware-tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'units' ? (
            <>
              <div className="inventory-filters" aria-label="Filter inventory">
                <label className="hardware-field hardware-field-grow">
                  <span>Search</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name, serial, location, owner…"
                  />
                </label>
                <label className="hardware-field">
                  <span>Kind</span>
                  <select
                    value={kindFilter}
                    onChange={(e) =>
                      setKindFilter(e.target.value as HardwareKind | 'all')
                    }
                  >
                    <option value="all">All kinds</option>
                    {KIND_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hardware-field">
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as HardwareStatus | 'all')
                    }
                  >
                    <option value="all">All statuses</option>
                    {STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="hardware-split">
                <section className="hub-section" aria-label="Inventory units">
                  <header className="hub-section-head">
                    <h3>Items</h3>
                    <span className="hardware-serial">{filtered.length}</span>
                  </header>
                  <ul className="hardware-unit-list">
                    {filtered.map((unit) => (
                      <li key={unit.id}>
                        <button
                          type="button"
                          className="hardware-unit-row"
                          data-selected={
                            selectedUnit?.id === unit.id ? 'true' : 'false'
                          }
                          onClick={() => setSelectedUnitId(unit.id)}
                        >
                          <span className="hardware-unit-main">
                            <strong>{unit.name}</strong>
                            <span className="hardware-unit-meta">
                              {unit.serial} · {HARDWARE_KIND_LABELS[unit.kind]}
                              {unitQuantity(unit) !== 1
                                ? ` · ×${unitQuantity(unit)}`
                                : ''}
                            </span>
                          </span>
                          <span
                            className="hub-status-pill"
                            data-status={statusPill(unit.status)}
                          >
                            {HARDWARE_STATUS_LABELS[unit.status]}
                          </span>
                        </button>
                      </li>
                    ))}
                    {filtered.length === 0 ? (
                      <li className="hub-empty">No items match these filters.</li>
                    ) : null}
                  </ul>
                </section>

                <div className="hardware-detail-stack">
                  {selectedUnit ? (
                    <UnitEditor
                      key={`${selectedUnit.id}-${selectedUnit.updatedAt}`}
                      unit={selectedUnit}
                      progress={progress.filter((p) => p.unitId === selectedUnit.id)}
                      tests={tests.filter((t) =>
                        t.unitIds.includes(selectedUnit.id),
                      )}
                      onSave={handleSaveUnit}
                      onUpdateStatus={handleUpdateStatus}
                      onDelete={handleDeleteUnit}
                    />
                  ) : (
                    <p className="hub-empty">Select or add an inventory item.</p>
                  )}
                  <UnitForm onSave={handleSaveUnit} />
                </div>
              </div>
            </>
          ) : null}

          {tab === 'tests' ? (
            <div className="hardware-split hardware-split-tests">
              <TestLogList units={lab.units} tests={tests} />
              <AddTestForm units={units} onAdd={handleAddTest} />
            </div>
          ) : null}
        </>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  )
}

function UnitEditor({
  unit,
  progress,
  tests,
  onSave,
  onUpdateStatus,
  onDelete,
}: {
  unit: HardwareUnit
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
  onSave: (unit: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string }) => void
  onUpdateStatus: (unitId: string, status: HardwareStatus, note: string) => void
  onDelete: (unitId: string) => void
}) {
  return (
    <section className="hub-section hardware-detail" aria-label={`${unit.name} detail`}>
      <header className="hub-section-head">
        <h3>{unit.name}</h3>
        <span className="hardware-serial">{unit.serial}</span>
      </header>

      <UnitForm initial={unit} onSave={onSave} submitLabel="Save item" />

      <UnitStatusForm unit={unit} onUpdateStatus={onUpdateStatus} />

      <div className="hardware-mini-lists">
        <div>
          <h4>Recent progress</h4>
          {progress.length === 0 ? (
            <p className="hub-empty">No notes yet.</p>
          ) : (
            <ul className="hardware-note-list">
              {progress.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <span className="hardware-note-date">{p.date}</span>
                  <strong>{HARDWARE_STATUS_LABELS[p.status]}</strong>
                  <span>{p.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4>Linked tests</h4>
          {tests.length === 0 ? (
            <p className="hub-empty">No tests linked.</p>
          ) : (
            <ul className="hardware-note-list">
              {tests.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <span className="hardware-note-date">{t.date}</span>
                  <strong>{t.title}</strong>
                  <span>
                    {TEST_RESULT_LABELS[t.result]} · {TEST_KIND_LABELS[t.kind]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-ghost inventory-delete"
        onClick={() => onDelete(unit.id)}
      >
        Remove from inventory
      </button>
    </section>
  )
}

function UnitForm({
  initial,
  onSave,
  submitLabel = 'Add to inventory',
}: {
  initial?: HardwareUnit
  onSave: (unit: Omit<HardwareUnit, 'id' | 'updatedAt'> & { id?: string }) => void
  submitLabel?: string
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<HardwareKind>(initial?.kind ?? 'other')
  const [serial, setSerial] = useState(initial?.serial ?? '')
  const [partNumber, setPartNumber] = useState(initial?.partNumber ?? '')
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1))
  const [hwRev, setHwRev] = useState(initial?.hwRev ?? '')
  const [fwVersion, setFwVersion] = useState(initial?.fwVersion ?? '')
  const [status, setStatus] = useState<HardwareStatus>(initial?.status ?? 'concept')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !serial.trim()) return
    const qty = Number(quantity)
    onSave({
      id: initial?.id,
      name: name.trim(),
      kind,
      serial: serial.trim(),
      partNumber: partNumber.trim() || undefined,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      hwRev: hwRev.trim() || '—',
      fwVersion: fwVersion.trim() || undefined,
      status,
      location: location.trim() || undefined,
      owner: owner.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    if (!initial) {
      setName('')
      setSerial('')
      setPartNumber('')
      setQuantity('1')
      setHwRev('')
      setFwVersion('')
      setStatus('concept')
      setLocation('')
      setOwner('')
      setNotes('')
      setKind('other')
    }
  }

  return (
    <form className="hardware-form hub-section" onSubmit={handleSubmit}>
      <header className="hub-section-head">
        <h3>{initial ? 'Edit item' : 'Add item'}</h3>
      </header>
      <div className="hardware-form-grid">
        <label className="hardware-field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="hardware-field">
          <span>Kind</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as HardwareKind)}
          >
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="hardware-field">
          <span>Serial / tag</span>
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            required
          />
        </label>
        <label className="hardware-field">
          <span>Part number</span>
          <input
            value={partNumber}
            onChange={(e) => setPartNumber(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="hardware-field">
          <span>Quantity</span>
          <input
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="hardware-field">
          <span>HW rev</span>
          <input value={hwRev} onChange={(e) => setHwRev(e.target.value)} />
        </label>
        <label className="hardware-field">
          <span>Firmware</span>
          <input value={fwVersion} onChange={(e) => setFwVersion(e.target.value)} />
        </label>
        <label className="hardware-field">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as HardwareStatus)}
          >
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="hardware-field">
          <span>Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label className="hardware-field">
          <span>Owner</span>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} />
        </label>
        <label className="hardware-field hardware-field-span">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <button type="submit" className="btn btn-accent">
        {submitLabel}
      </button>
    </form>
  )
}

function UnitStatusForm({
  unit,
  onUpdateStatus,
}: {
  unit: HardwareUnit
  onUpdateStatus: (unitId: string, status: HardwareStatus, note: string) => void
}) {
  const [status, setStatus] = useState(unit.status)
  const [note, setNote] = useState('')

  return (
    <form
      className="hardware-inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        onUpdateStatus(unit.id, status, note)
        setNote('')
      }}
    >
      <label className="hardware-field">
        <span>Quick status</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as HardwareStatus)}
        >
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="hardware-field hardware-field-grow">
        <span>Progress note</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What changed?"
        />
      </label>
      <button type="submit" className="btn btn-accent">
        Save
      </button>
    </form>
  )
}

function TestLogList({
  units,
  tests,
}: {
  units: HardwareUnit[]
  tests: TestLogEntry[]
}) {
  const nameFor = (id: string) => units.find((u) => u.id === id)?.name ?? id
  return (
    <section className="hub-section" aria-label="Test log">
      <header className="hub-section-head">
        <h3>Test log</h3>
      </header>
      {tests.length === 0 ? (
        <p className="hub-empty">No tests logged yet.</p>
      ) : (
        <ul className="hardware-test-list">
          {tests.map((t) => (
            <li key={t.id} className="hardware-test-item">
              <div className="hardware-test-top">
                <strong>{t.title}</strong>
                <span className="hub-status-pill" data-status={resultPill(t.result)}>
                  {TEST_RESULT_LABELS[t.result]}
                </span>
              </div>
              <p className="hardware-test-meta">
                {t.date} · {TEST_KIND_LABELS[t.kind]}
                {t.site ? ` · ${t.site}` : ''}
                {t.operator ? ` · ${t.operator}` : ''}
              </p>
              <p>{t.summary}</p>
              <p className="hardware-test-units">
                {t.unitIds.map(nameFor).join(' · ') || 'No units linked'}
              </p>
              {t.dataRef ? (
                <p className="hardware-data-ref">{t.dataRef}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function resultPill(result: TestResult) {
  if (result === 'pass') return 'done'
  if (result === 'fail' || result === 'aborted') return 'blocked'
  if (result === 'partial') return 'active'
  return 'upcoming'
}

function AddTestForm({
  units,
  onAdd,
}: {
  units: HardwareUnit[]
  onAdd: (entry: Omit<TestLogEntry, 'id' | 'createdAt'>) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [kind, setKind] = useState<TestKind>('other')
  const [result, setResult] = useState<TestResult>('data-only')
  const [summary, setSummary] = useState('')
  const [site, setSite] = useState('')
  const [operator, setOperator] = useState('')
  const [dataRef, setDataRef] = useState('')
  const [unitIds, setUnitIds] = useState<string[]>([])
  const [metricKey, setMetricKey] = useState('')
  const [metricValue, setMetricValue] = useState('')
  const [metricUnit, setMetricUnit] = useState('')
  const [metrics, setMetrics] = useState<TestMetric[]>([])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !summary.trim()) return
    onAdd({
      title: title.trim(),
      date,
      kind,
      result,
      summary: summary.trim(),
      site: site.trim() || undefined,
      operator: operator.trim() || undefined,
      dataRef: dataRef.trim() || undefined,
      unitIds,
      metrics: metrics.length ? metrics : undefined,
    })
    setTitle('')
    setSummary('')
    setSite('')
    setOperator('')
    setDataRef('')
    setUnitIds([])
    setMetrics([])
    setMetricKey('')
    setMetricValue('')
    setMetricUnit('')
    setKind('other')
    setResult('data-only')
  }

  return (
    <form className="hardware-form hub-section" onSubmit={handleSubmit}>
      <header className="hub-section-head">
        <h3>Log a test</h3>
      </header>
      <div className="hardware-form-grid">
        <label className="hardware-field hardware-field-span">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="hardware-field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="hardware-field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as TestKind)}>
            {TEST_KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="hardware-field">
          <span>Result</span>
          <select
            value={result}
            onChange={(e) => setResult(e.target.value as TestResult)}
          >
            {TEST_RESULT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="hardware-field">
          <span>Site</span>
          <input value={site} onChange={(e) => setSite(e.target.value)} />
        </label>
        <label className="hardware-field">
          <span>Operator</span>
          <input value={operator} onChange={(e) => setOperator(e.target.value)} />
        </label>
        <label className="hardware-field hardware-field-span">
          <span>Summary</span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            required
          />
        </label>
        <label className="hardware-field hardware-field-span">
          <span>Data ref</span>
          <input
            value={dataRef}
            onChange={(e) => setDataRef(e.target.value)}
            placeholder="Drive folder / CSV"
          />
        </label>
      </div>

      <fieldset className="hardware-units-picker">
        <legend>Linked units</legend>
        <div className="hardware-units-grid">
          {units.map((u) => {
            const checked = unitIds.includes(u.id)
            return (
              <label key={u.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setUnitIds((prev) =>
                      checked ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                    )
                  }
                />
                <span>
                  {u.name}
                  <em>{u.serial}</em>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="hardware-metrics-add">
        <label className="hardware-field">
          <span>Metric</span>
          <input
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
            placeholder="peak_load"
          />
        </label>
        <label className="hardware-field">
          <span>Value</span>
          <input
            value={metricValue}
            onChange={(e) => setMetricValue(e.target.value)}
            placeholder="120"
          />
        </label>
        <label className="hardware-field">
          <span>Unit</span>
          <input
            value={metricUnit}
            onChange={(e) => setMetricUnit(e.target.value)}
            placeholder="kgf"
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (!metricKey.trim() || !metricValue.trim()) return
            setMetrics((prev) => [
              ...prev,
              {
                key: metricKey.trim(),
                value: metricValue.trim(),
                unit: metricUnit.trim() || undefined,
              },
            ])
            setMetricKey('')
            setMetricValue('')
            setMetricUnit('')
          }}
        >
          Add metric
        </button>
      </div>
      {metrics.length ? (
        <ul className="hardware-note-list">
          {metrics.map((m, i) => (
            <li key={`${m.key}-${i}`}>
              <strong>{m.key}</strong>
              <span>
                {m.value}
                {m.unit ? ` ${m.unit}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <button type="submit" className="btn btn-accent">
        Save test
      </button>
    </form>
  )
}
