import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import { downloadHardwareLabExport } from '../exportHardware'
import {
  fetchSharedHardwareLab,
  resetSharedHardwareLab,
  saveSharedHardwareLab,
  type SharedHardwareLab,
} from '../hardwareApi'
import {
  HARDWARE_KIND_LABELS,
  HARDWARE_STATUS_LABELS,
  HARDWARE_STATUS_ORDER,
  TEST_KIND_LABELS,
  TEST_RESULT_LABELS,
  loadHardwareLab,
  newId,
  resetHardwareLab,
  saveHardwareLab,
  sortProgress,
  sortTests,
  sortUnits,
  type HardwareLabState,
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

type LabTab = 'hardware' | 'tests' | 'progress'
type SyncState = 'loading' | 'shared' | 'local' | 'error'

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

function flashToast(
  setToast: (value: string | null) => void,
  message: string,
) {
  setToast(message)
  window.setTimeout(() => setToast(null), 2400)
}

function toLabState(shared: SharedHardwareLab): HardwareLabState {
  return {
    units: shared.units,
    progress: shared.progress,
    tests: shared.tests,
  }
}

export function HardwarePage({ user }: { user: AuthUser | null }) {
  const [lab, setLab] = useState<HardwareLabState>(() => ({
    units: [],
    progress: [],
    tests: [],
  }))
  const [revision, setRevision] = useState(1)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [updatedBy, setUpdatedBy] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncState>('loading')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<LabTab>('hardware')
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const units = useMemo(() => sortUnits(lab.units), [lab.units])
  const tests = useMemo(() => sortTests(lab.tests), [lab.tests])
  const progress = useMemo(() => sortProgress(lab.progress), [lab.progress])

  const selectedUnit =
    units.find((u) => u.id === selectedUnitId) ?? units[0] ?? null

  function applyShared(shared: SharedHardwareLab) {
    setLab(toLabState(shared))
    setRevision(shared.revision)
    setUpdatedAt(shared.updatedAt)
    setUpdatedBy(shared.updatedBy)
    setSync('shared')
    setSyncError(null)
  }

  async function loadShared(opts?: { quiet?: boolean }) {
    const result = await fetchSharedHardwareLab()
    if (result.ok) {
      applyShared(result.lab)
      if (!opts?.quiet) flashToast(setToast, 'Team inventory loaded')
      return
    }

    if (import.meta.env.DEV && (result.status === 0 || result.status === 404)) {
      const local = loadHardwareLab()
      setLab(local)
      setSync('local')
      setSyncError(null)
      return
    }

    setSync('error')
    setSyncError(result.error)
  }

  useEffect(() => {
    void loadShared({ quiet: true })
  }, [])

  async function commit(next: HardwareLabState, message: string) {
    if (sync === 'local') {
      saveHardwareLab(next)
      setLab(next)
      flashToast(setToast, message)
      return
    }

    setSaving(true)
    const result = await saveSharedHardwareLab(next, revision)
    setSaving(false)

    if ('conflict' in result && result.conflict) {
      applyShared(result.lab)
      flashToast(
        setToast,
        'Someone else saved first — refreshed. Re-apply your change.',
      )
      return
    }

    if (!result.ok) {
      flashToast(setToast, result.error)
      return
    }

    applyShared(result.lab)
    flashToast(setToast, message)
  }

  function handleAddUnit(unit: Omit<HardwareUnit, 'id' | 'updatedAt'>) {
    const author = unit.owner || user?.name || undefined
    const nextUnit: HardwareUnit = {
      ...unit,
      id: newId('hw'),
      updatedAt: new Date().toISOString(),
    }
    const note: HardwareProgressNote = {
      id: newId('pg'),
      unitId: nextUnit.id,
      date: new Date().toISOString().slice(0, 10),
      status: nextUnit.status,
      note: `Added to inventory${nextUnit.notes ? ` — ${nextUnit.notes}` : '.'}`,
      author,
    }
    void commit(
      {
        ...lab,
        units: [...lab.units, nextUnit],
        progress: [note, ...lab.progress],
      },
      'Hardware unit saved for the team',
    )
    setSelectedUnitId(nextUnit.id)
    setTab('hardware')
  }

  function handleUpdateUnitStatus(unitId: string, status: HardwareStatus, note: string) {
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
      'Progress updated for the team',
    )
  }

  function handleAddTest(entry: Omit<TestLogEntry, 'id' | 'createdAt'>) {
    const next: TestLogEntry = {
      ...entry,
      id: newId('test'),
      createdAt: new Date().toISOString(),
      operator: entry.operator || user?.name || undefined,
    }
    void commit({ ...lab, tests: [next, ...lab.tests] }, 'Test log saved for the team')
    setTab('tests')
  }

  function handleExport() {
    downloadHardwareLabExport(lab)
    flashToast(setToast, 'Hardware lab CSV downloaded')
  }

  async function handleReset() {
    const sharedWarning =
      sync === 'shared'
        ? 'Reset the shared team inventory to seed data? This affects everyone.'
        : 'Reset hardware lab to seed data? Browser-only edits will be cleared.'
    if (!window.confirm(sharedWarning)) return

    if (sync === 'local') {
      const next = resetHardwareLab()
      setLab(next)
      setSelectedUnitId(null)
      flashToast(setToast, 'Reset to seed data')
      return
    }

    setSaving(true)
    const result = await resetSharedHardwareLab()
    setSaving(false)
    if (!result.ok) {
      flashToast(setToast, result.error)
      return
    }
    applyShared(result.lab)
    setSelectedUnitId(null)
    flashToast(setToast, 'Shared inventory reset to seed')
  }

  const counts = {
    units: lab.units.length,
    tests: lab.tests.length,
    active: lab.units.filter(
      (u) => u.status !== 'retired' && u.status !== 'failed',
    ).length,
  }

  const syncLede =
    sync === 'shared'
      ? 'Shared team inventory — anyone signed in can update units, progress, and tests.'
      : sync === 'local'
        ? 'Local Vite fallback — edits stay in this browser until the shared API is available.'
        : sync === 'error'
          ? 'Shared inventory unavailable. Check sign-in and Vercel Blob setup.'
          : 'Loading shared team inventory…'

  return (
    <main className="hub-page hub-page-inner hardware-page" aria-label="Hardware lab">
      <header className="hub-page-head hardware-head">
        <div>
          <h2 className="hub-page-title">Hardware</h2>
          <p className="hub-page-lede">{syncLede}</p>
          {sync === 'shared' && updatedAt ? (
            <p className="hardware-sync-meta">
              Rev {revision} · last update {new Date(updatedAt).toLocaleString()}
              {updatedBy ? ` · ${updatedBy}` : ''}
              {saving ? ' · saving…' : ''}
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
            onClick={() => void loadShared()}
            disabled={sync === 'loading' || saving}
          >
            Refresh
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void handleReset()}
            disabled={sync === 'loading' || sync === 'error' || saving}
          >
            Reset seed
          </button>
        </div>
      </header>

      {sync === 'loading' ? (
        <p className="hub-empty hub-empty-spaced">Loading team inventory…</p>
      ) : null}

      {sync === 'shared' || sync === 'local' ? (
        <>
          <dl className="hardware-stats" aria-label="Lab summary">
            <div>
              <dt>Units</dt>
              <dd>{counts.units}</dd>
            </div>
            <div>
              <dt>Active</dt>
              <dd>{counts.active}</dd>
            </div>
            <div>
              <dt>Test logs</dt>
              <dd>{counts.tests}</dd>
            </div>
          </dl>

          <div className="hardware-tabs" role="tablist" aria-label="Hardware lab sections">
            {(
              [
                ['hardware', 'Units & versions'],
                ['progress', 'Progress'],
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

          {tab === 'hardware' ? (
            <div className="hardware-split">
              <section className="hub-section" aria-label="Hardware units">
                <header className="hub-section-head">
                  <h3>Inventory</h3>
                </header>
                <ul className="hardware-unit-list">
                  {units.map((unit) => (
                    <li key={unit.id}>
                      <button
                        type="button"
                        className="hardware-unit-row"
                        data-selected={selectedUnit?.id === unit.id ? 'true' : 'false'}
                        onClick={() => setSelectedUnitId(unit.id)}
                      >
                        <span className="hardware-unit-main">
                          <strong>{unit.name}</strong>
                          <span className="hardware-unit-meta">
                            {unit.serial} · {HARDWARE_KIND_LABELS[unit.kind]}
                          </span>
                        </span>
                        <span className="hub-status-pill" data-status={statusPill(unit.status)}>
                          {HARDWARE_STATUS_LABELS[unit.status]}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="hardware-detail-stack">
                {selectedUnit ? (
                  <UnitDetail
                    key={selectedUnit.id}
                    unit={selectedUnit}
                    progress={progress.filter((p) => p.unitId === selectedUnit.id)}
                    tests={tests.filter((t) => t.unitIds.includes(selectedUnit.id))}
                    onUpdateStatus={handleUpdateUnitStatus}
                  />
                ) : (
                  <p className="hub-empty">No hardware units yet.</p>
                )}
                <AddUnitForm onAdd={handleAddUnit} />
              </div>
            </div>
          ) : null}

          {tab === 'progress' ? (
            <ProgressBoard
              units={units}
              progress={progress}
              onUpdateStatus={handleUpdateUnitStatus}
            />
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

function statusPill(status: HardwareStatus) {
  if (status === 'flight-ready') return 'done'
  if (status === 'failed' || status === 'retired') return 'blocked'
  if (status === 'checkout' || status === 'assembly') return 'active'
  return 'upcoming'
}

function UnitDetail({
  unit,
  progress,
  tests,
  onUpdateStatus,
}: {
  unit: HardwareUnit
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
  onUpdateStatus: (unitId: string, status: HardwareStatus, note: string) => void
}) {
  return (
    <section className="hub-section hardware-detail" aria-label={`${unit.name} detail`}>
      <header className="hub-section-head">
        <h3>{unit.name}</h3>
        <span className="hardware-serial">{unit.serial}</span>
      </header>

      <dl className="hardware-kv">
        <div>
          <dt>Kind</dt>
          <dd>{HARDWARE_KIND_LABELS[unit.kind]}</dd>
        </div>
        <div>
          <dt>HW rev</dt>
          <dd>{unit.hwRev}</dd>
        </div>
        <div>
          <dt>Firmware</dt>
          <dd>{unit.fwVersion?.trim() ? unit.fwVersion : '—'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{HARDWARE_STATUS_LABELS[unit.status]}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{unit.location || '—'}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{unit.owner || '—'}</dd>
        </div>
      </dl>

      {unit.notes ? <p className="hardware-notes">{unit.notes}</p> : null}

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
    </section>
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
        <span>Update status</span>
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

function ProgressBoard({
  units,
  progress,
  onUpdateStatus,
}: {
  units: HardwareUnit[]
  progress: HardwareProgressNote[]
  onUpdateStatus: (unitId: string, status: HardwareStatus, note: string) => void
}) {
  const columns = HARDWARE_STATUS_ORDER.filter(
    (s) => s !== 'retired' && s !== 'failed',
  )

  return (
    <section className="hub-section" aria-label="Hardware progress">
      <header className="hub-section-head">
        <h3>Build & checkout board</h3>
      </header>
      <div className="hardware-board">
        {columns.map((status) => {
          const columnUnits = units.filter((u) => u.status === status)
          return (
            <div key={status} className="hardware-board-col">
              <h4>
                {HARDWARE_STATUS_LABELS[status]}
                <span>{columnUnits.length}</span>
              </h4>
              <ul>
                {columnUnits.length === 0 ? (
                  <li className="hardware-board-empty">—</li>
                ) : (
                  columnUnits.map((unit) => {
                    const latest = progress.find((p) => p.unitId === unit.id)
                    return (
                      <li key={unit.id} className="hardware-board-item">
                        <strong>{unit.name}</strong>
                        <span>
                          {unit.hwRev}
                          {unit.fwVersion ? ` · FW ${unit.fwVersion}` : ''}
                        </span>
                        {latest ? (
                          <span className="hardware-board-note">{latest.note}</span>
                        ) : null}
                        <label className="hardware-board-move">
                          <span className="sr-only">Move {unit.name}</span>
                          <select
                            value={unit.status}
                            onChange={(e) =>
                              onUpdateStatus(
                                unit.id,
                                e.target.value as HardwareStatus,
                                `Moved to ${HARDWARE_STATUS_LABELS[e.target.value as HardwareStatus]}`,
                              )
                            }
                          >
                            {STATUS_OPTIONS.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          )
        })}
      </div>

      <div className="hardware-board-aside">
        <h4>Retired / failed</h4>
        <ul className="hardware-note-list">
          {units
            .filter((u) => u.status === 'retired' || u.status === 'failed')
            .map((u) => (
              <li key={u.id}>
                <strong>{u.name}</strong>
                <span>{HARDWARE_STATUS_LABELS[u.status]} · {u.serial}</span>
              </li>
            ))}
          {units.every((u) => u.status !== 'retired' && u.status !== 'failed') ? (
            <li className="hub-empty">None.</li>
          ) : null}
        </ul>
      </div>
    </section>
  )
}

function TestLogList({
  units,
  tests,
}: {
  units: HardwareUnit[]
  tests: TestLogEntry[]
}) {
  function unitLabel(id: string) {
    return units.find((u) => u.id === id)?.name ?? id
  }

  return (
    <section className="hub-section" aria-label="Test log">
      <header className="hub-section-head">
        <h3>Logged tests</h3>
      </header>
      {tests.length === 0 ? (
        <p className="hub-empty">No tests logged yet.</p>
      ) : (
        <ul className="hardware-test-list">
          {tests.map((test) => (
            <li key={test.id} className="hardware-test-item" data-result={test.result}>
              <div className="hardware-test-top">
                <span className="hardware-note-date">{test.date}</span>
                <span className="hardware-result" data-result={test.result}>
                  {TEST_RESULT_LABELS[test.result]}
                </span>
              </div>
              <strong>{test.title}</strong>
              <span className="hardware-test-meta">
                {TEST_KIND_LABELS[test.kind]}
                {test.site ? ` · ${test.site}` : ''}
                {test.operator ? ` · ${test.operator}` : ''}
              </span>
              <p>{test.summary}</p>
              <span className="hardware-test-units">
                {test.unitIds.map(unitLabel).join(' · ')}
              </span>
              {test.metrics && test.metrics.length > 0 ? (
                <dl className="hardware-metrics">
                  {test.metrics.map((m) => (
                    <div key={`${test.id}-${m.key}`}>
                      <dt>{m.key}</dt>
                      <dd>
                        {m.value}
                        {m.unit ? ` ${m.unit}` : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {test.dataRef ? (
                <span className="hardware-data-ref">Data: {test.dataRef}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddUnitForm({
  onAdd,
}: {
  onAdd: (unit: Omit<HardwareUnit, 'id' | 'updatedAt'>) => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<HardwareKind>('other')
  const [serial, setSerial] = useState('')
  const [hwRev, setHwRev] = useState('')
  const [fwVersion, setFwVersion] = useState('')
  const [status, setStatus] = useState<HardwareStatus>('design')
  const [location, setLocation] = useState('')
  const [owner, setOwner] = useState('')
  const [notes, setNotes] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !serial.trim() || !hwRev.trim()) return
    onAdd({
      name: name.trim(),
      kind,
      serial: serial.trim(),
      hwRev: hwRev.trim(),
      fwVersion: fwVersion.trim(),
      status,
      location: location.trim(),
      owner: owner.trim(),
      notes: notes.trim(),
    })
    setName('')
    setSerial('')
    setHwRev('')
    setFwVersion('')
    setLocation('')
    setOwner('')
    setNotes('')
    setKind('other')
    setStatus('design')
  }

  return (
    <section className="hub-section hardware-form-panel" aria-label="Add hardware unit">
      <header className="hub-section-head">
        <h3>Add unit</h3>
      </header>
      <form className="hardware-form" onSubmit={handleSubmit}>
        <label className="hardware-field">
          <span>Name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="hardware-field">
          <span>Serial</span>
          <input required value={serial} onChange={(e) => setSerial(e.target.value)} />
        </label>
        <label className="hardware-field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as HardwareKind)}>
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="hardware-field">
          <span>HW rev</span>
          <input required value={hwRev} onChange={(e) => setHwRev(e.target.value)} />
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
        <label className="hardware-field hardware-field-full">
          <span>Notes</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="hardware-form-actions">
          <button type="submit" className="btn btn-accent">
            Add hardware
          </button>
        </div>
      </form>
    </section>
  )
}

function AddTestForm({
  units,
  onAdd,
}: {
  units: HardwareUnit[]
  onAdd: (entry: Omit<TestLogEntry, 'id' | 'createdAt'>) => void
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TestKind>('ground')
  const [result, setResult] = useState<TestResult>('data-only')
  const [unitIds, setUnitIds] = useState<string[]>([])
  const [site, setSite] = useState('Goods Shed')
  const [operator, setOperator] = useState('')
  const [summary, setSummary] = useState('')
  const [dataRef, setDataRef] = useState('')
  const [metricsText, setMetricsText] = useState('')

  function toggleUnit(id: string) {
    setUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function parseMetrics(text: string): TestMetric[] {
    return text
      .split(/\n|,/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rawKey, ...rest] = line.split(/[:=]/)
        const rawValue = rest.join(':').trim()
        const match = rawValue.match(/^(-?[\d.]+)\s*(.*)$/)
        if (match) {
          return {
            key: (rawKey || 'metric').trim(),
            value: match[1],
            unit: match[2] || undefined,
          }
        }
        return {
          key: (rawKey || 'metric').trim(),
          value: rawValue || line,
        }
      })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !summary.trim() || unitIds.length === 0) return
    onAdd({
      date,
      title: title.trim(),
      kind,
      result,
      unitIds,
      site: site.trim(),
      operator: operator.trim(),
      summary: summary.trim(),
      metrics: parseMetrics(metricsText),
      dataRef: dataRef.trim(),
    })
    setTitle('')
    setSummary('')
    setDataRef('')
    setMetricsText('')
    setUnitIds([])
    setResult('data-only')
    setKind('ground')
  }

  return (
    <section className="hub-section hardware-form-panel" aria-label="Log a test">
      <header className="hub-section-head">
        <h3>Log a test</h3>
      </header>
      <form className="hardware-form" onSubmit={handleSubmit}>
        <label className="hardware-field">
          <span>Date</span>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="hardware-field">
          <span>Title</span>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} />
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
        <fieldset className="hardware-field hardware-field-full hardware-units-picker">
          <legend>Hardware under test</legend>
          <div className="hardware-check-grid">
            {units.map((unit) => (
              <label key={unit.id} className="hardware-check">
                <input
                  type="checkbox"
                  checked={unitIds.includes(unit.id)}
                  onChange={() => toggleUnit(unit.id)}
                />
                <span>
                  {unit.name}
                  <em>{unit.serial}</em>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="hardware-field hardware-field-full">
          <span>Summary</span>
          <textarea
            required
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="What happened, what was measured, what to follow up."
          />
        </label>
        <label className="hardware-field hardware-field-full">
          <span>Metrics (optional)</span>
          <textarea
            rows={2}
            value={metricsText}
            onChange={(e) => setMetricsText(e.target.value)}
            placeholder="peak_thrust: 85 kgf, burn_time: 1.8 s"
          />
        </label>
        <label className="hardware-field hardware-field-full">
          <span>Data reference</span>
          <input
            value={dataRef}
            onChange={(e) => setDataRef(e.target.value)}
            placeholder="Drive folder, CSV name, logger run id…"
          />
        </label>
        <div className="hardware-form-actions">
          <button type="submit" className="btn btn-accent">
            Save test log
          </button>
        </div>
      </form>
    </section>
  )
}
