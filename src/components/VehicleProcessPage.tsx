import { useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import {
  PROCESS_STEP_STATUS_LABELS,
  PROCESS_STEP_STATUS_ORDER,
  newId,
  processCompletion,
  processOverallStatus,
  sortProcessSteps,
  sortProcesses,
  sortUnits,
} from '../hardwareData'
import type {
  HardwareUnit,
  ProcessStepStatus,
  VehicleProcess,
  VehicleProcessStep,
} from '../types'
import { useLabStore } from '../useLabStore'

const STEP_STATUS_OPTIONS = Object.entries(PROCESS_STEP_STATUS_LABELS) as [
  ProcessStepStatus,
  string,
][]

function stepPill(status: ProcessStepStatus) {
  if (status === 'done' || status === 'skipped') return 'done'
  if (status === 'blocked') return 'blocked'
  if (status === 'active') return 'active'
  return 'upcoming'
}

export function VehicleProcessPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, toast, updatedAt, updatedBy, revision } =
    store
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null)

  const units = useMemo(() => sortUnits(lab.units), [lab.units])
  const vehicles = useMemo(
    () => units.filter((u) => u.kind === 'vehicle'),
    [units],
  )
  const processes = useMemo(() => sortProcesses(lab.processes), [lab.processes])

  const selected =
    processes.find((p) => p.id === selectedProcessId) ?? processes[0] ?? null

  const vehicleName = (id: string) =>
    units.find((u) => u.id === id)?.name ?? 'Unknown vehicle'

  async function commit(next: typeof lab, message: string) {
    await store.commit(next, message)
  }

  function handleCreateProcess(input: {
    vehicleUnitId: string
    name: string
    campaign: string
    notes: string
  }) {
    const now = new Date().toISOString()
    const process: VehicleProcess = {
      id: newId('proc'),
      vehicleUnitId: input.vehicleUnitId,
      name: input.name.trim(),
      campaign: input.campaign.trim() || undefined,
      notes: input.notes.trim() || undefined,
      updatedAt: now,
      steps: defaultStepsForVehicle(input.vehicleUnitId, units),
    }
    void commit(
      { ...lab, processes: [process, ...lab.processes] },
      'Vehicle process created',
    )
    setSelectedProcessId(process.id)
  }

  function handleUpdateStep(
    processId: string,
    stepId: string,
    patch: Partial<VehicleProcessStep>,
  ) {
    const now = new Date().toISOString()
    const nextProcesses = lab.processes.map((p) => {
      if (p.id !== processId) return p
      return {
        ...p,
        updatedAt: now,
        steps: p.steps.map((s) => {
          if (s.id !== stepId) return s
          const nextStatus = patch.status ?? s.status
          const completed =
            nextStatus === 'done' || nextStatus === 'skipped'
              ? {
                  completedAt: s.completedAt || now,
                  completedBy: patch.completedBy || s.completedBy || user?.name,
                }
              : nextStatus === 'pending' || nextStatus === 'active'
                ? { completedAt: undefined, completedBy: undefined }
                : {
                    completedAt: s.completedAt,
                    completedBy: s.completedBy,
                  }
          return {
            ...s,
            ...patch,
            ...completed,
            blockedReason:
              nextStatus === 'blocked'
                ? patch.blockedReason ?? s.blockedReason
                : undefined,
          }
        }),
      }
    })
    void commit({ ...lab, processes: nextProcesses }, 'Process step updated')
  }

  function handleAddStep(processId: string, title: string, owner: string) {
    if (!title.trim()) return
    const now = new Date().toISOString()
    const nextProcesses = lab.processes.map((p) => {
      if (p.id !== processId) return p
      const order =
        p.steps.reduce((max, s) => Math.max(max, s.order), 0) + 1
      const step: VehicleProcessStep = {
        id: newId('ps'),
        order,
        title: title.trim(),
        owner: owner.trim() || user?.name || undefined,
        status: 'pending',
        linkedUnitIds: [p.vehicleUnitId],
      }
      return { ...p, updatedAt: now, steps: [...p.steps, step] }
    })
    void commit({ ...lab, processes: nextProcesses }, 'Process step added')
  }

  function handleDeleteProcess(processId: string) {
    const proc = lab.processes.find((p) => p.id === processId)
    if (!proc) return
    if (!window.confirm(`Delete process “${proc.name}”?`)) return
    void commit(
      { ...lab, processes: lab.processes.filter((p) => p.id !== processId) },
      'Vehicle process deleted',
    )
    setSelectedProcessId(null)
  }

  return (
    <main
      className="hub-page hub-page-inner hardware-page process-page"
      aria-label="Vehicle process"
    >
      <header className="hub-page-head hardware-head">
        <div>
          <h2 className="hub-page-title">Vehicles</h2>
          <p className="hub-page-lede">
            Campaign process tracker — ordered build and checkout steps for each
            vehicle, shared with the team.
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
            onClick={() => void store.reset()}
            disabled={sync === 'loading' || sync === 'error' || saving}
          >
            Reset seed
          </button>
        </div>
      </header>

      {sync === 'loading' ? (
        <p className="hub-empty hub-empty-spaced">Loading vehicle processes…</p>
      ) : null}

      {sync === 'shared' || sync === 'local' ? (
        <div className="hardware-split process-split">
          <section className="hub-section" aria-label="Vehicle processes">
            <header className="hub-section-head">
              <h3>Processes</h3>
              <span className="hardware-serial">{processes.length}</span>
            </header>
            <ul className="hardware-unit-list">
              {processes.map((proc) => {
                const completion = processCompletion(proc)
                const overall = processOverallStatus(proc)
                return (
                  <li key={proc.id}>
                    <button
                      type="button"
                      className="hardware-unit-row"
                      data-selected={selected?.id === proc.id ? 'true' : 'false'}
                      onClick={() => setSelectedProcessId(proc.id)}
                    >
                      <span className="hardware-unit-main">
                        <strong>{proc.name}</strong>
                        <span className="hardware-unit-meta">
                          {vehicleName(proc.vehicleUnitId)}
                          {proc.campaign ? ` · ${proc.campaign}` : ''}
                          {` · ${completion.done}/${completion.total}`}
                        </span>
                      </span>
                      <span
                        className="hub-status-pill"
                        data-status={stepPill(overall)}
                      >
                        {PROCESS_STEP_STATUS_LABELS[overall]}
                      </span>
                    </button>
                  </li>
                )
              })}
              {processes.length === 0 ? (
                <li className="hub-empty">No vehicle processes yet.</li>
              ) : null}
            </ul>

            <CreateProcessForm vehicles={vehicles} units={units} onCreate={handleCreateProcess} />
          </section>

          <div className="hardware-detail-stack">
            {selected ? (
              <ProcessDetail
                process={selected}
                units={units}
                onUpdateStep={handleUpdateStep}
                onAddStep={handleAddStep}
                onDelete={handleDeleteProcess}
              />
            ) : (
              <p className="hub-empty">Select or create a vehicle process.</p>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  )
}

function defaultStepsForVehicle(
  vehicleUnitId: string,
  units: HardwareUnit[],
): VehicleProcessStep[] {
  const motor = units.find((u) => u.kind === 'motor')
  const avionics = units.find((u) => u.kind === 'avionics')
  const pad = units.find((u) => u.kind === 'pad')
  const ground = units.find((u) => u.kind === 'ground')

  const templates: Omit<VehicleProcessStep, 'id'>[] = [
    {
      order: 1,
      title: 'Airframe dry-fit',
      detail: 'Structures fit check before integration.',
      owner: 'Structures',
      status: 'pending',
      linkedUnitIds: [vehicleUnitId],
    },
    {
      order: 2,
      title: 'Motor install & retention',
      detail: 'Seat motor and mark retention hardware.',
      owner: 'Propulsion',
      status: 'pending',
      linkedUnitIds: [vehicleUnitId, ...(motor ? [motor.id] : [])],
    },
    {
      order: 3,
      title: 'Avionics integrate & flash',
      detail: 'Install flight computer and verify downlink path.',
      owner: 'Avionics',
      status: 'pending',
      linkedUnitIds: [vehicleUnitId, ...(avionics ? [avionics.id] : [])],
    },
    {
      order: 4,
      title: 'GSE / logger checkout',
      detail: 'Confirm ground support recording path.',
      owner: 'Ops',
      status: 'pending',
      linkedUnitIds: ground ? [ground.id] : [],
    },
    {
      order: 5,
      title: 'Pad stand load path',
      detail: 'Verify stand and instrumentation before fire.',
      owner: 'Structures',
      status: 'pending',
      linkedUnitIds: pad ? [pad.id] : [],
    },
    {
      order: 6,
      title: 'Static-fire readiness review',
      detail: 'Go / hold review before pad ops.',
      owner: 'Ops',
      status: 'pending',
      linkedUnitIds: [vehicleUnitId],
    },
    {
      order: 7,
      title: 'Flight readiness review',
      detail: 'Final gate after static-fire data review.',
      owner: 'Ops',
      status: 'pending',
      linkedUnitIds: [vehicleUnitId],
    },
  ]

  return templates.map((step) => ({ ...step, id: newId('ps') }))
}

function CreateProcessForm({
  vehicles,
  units,
  onCreate,
}: {
  vehicles: HardwareUnit[]
  units: HardwareUnit[]
  onCreate: (input: {
    vehicleUnitId: string
    name: string
    campaign: string
    notes: string
  }) => void
}) {
  const vehicleOptions = vehicles.length
    ? vehicles
    : units.filter((u) => u.kind === 'vehicle' || u.kind === 'other')
  const [vehicleUnitId, setVehicleUnitId] = useState('')
  const [name, setName] = useState('')
  const [campaign, setCampaign] = useState('')
  const [notes, setNotes] = useState('')
  const selectedVehicleId = vehicleUnitId || vehicleOptions[0]?.id || ''

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedVehicleId || !name.trim()) return
    onCreate({ vehicleUnitId: selectedVehicleId, name, campaign, notes })
    setName('')
    setCampaign('')
    setNotes('')
  }

  if (vehicleOptions.length === 0) {
    return (
      <p className="hub-empty hub-empty-spaced">
        Add a vehicle in Inventory before creating a process.
      </p>
    )
  }

  return (
    <form className="hardware-form" onSubmit={handleSubmit}>
      <header className="hub-section-head">
        <h3>New process</h3>
      </header>
      <div className="hardware-form-grid">
        <label className="hardware-field">
          <span>Vehicle</span>
          <select
            value={selectedVehicleId}
            onChange={(e) => setVehicleUnitId(e.target.value)}
            required
          >
            {vehicleOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.serial}
              </option>
            ))}
          </select>
        </label>
        <label className="hardware-field">
          <span>Campaign</span>
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="B1M"
          />
        </label>
        <label className="hardware-field hardware-field-span">
          <span>Process name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="STRAVOX B1M build & checkout"
            required
          />
        </label>
        <label className="hardware-field hardware-field-span">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <button type="submit" className="btn btn-accent">
        Create process
      </button>
    </form>
  )
}

function ProcessDetail({
  process,
  units,
  onUpdateStep,
  onAddStep,
  onDelete,
}: {
  process: VehicleProcess
  units: HardwareUnit[]
  onUpdateStep: (
    processId: string,
    stepId: string,
    patch: Partial<VehicleProcessStep>,
  ) => void
  onAddStep: (processId: string, title: string, owner: string) => void
  onDelete: (processId: string) => void
}) {
  const steps = sortProcessSteps(process.steps)
  const completion = processCompletion(process)
  const overall = processOverallStatus(process)
  const [newTitle, setNewTitle] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const vehicle = units.find((u) => u.id === process.vehicleUnitId)

  return (
    <section className="hub-section process-detail" aria-label={process.name}>
      <header className="hub-section-head">
        <h3>{process.name}</h3>
        <span className="hub-status-pill" data-status={stepPill(overall)}>
          {PROCESS_STEP_STATUS_LABELS[overall]}
        </span>
      </header>

      <dl className="hardware-kv">
        <div>
          <dt>Vehicle</dt>
          <dd>
            {vehicle
              ? `${vehicle.name} · ${vehicle.serial}`
              : process.vehicleUnitId}
          </dd>
        </div>
        <div>
          <dt>Campaign</dt>
          <dd>{process.campaign || '—'}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>
            {completion.done}/{completion.total} · {completion.pct}%
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{new Date(process.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>

      {process.notes ? <p className="hardware-notes">{process.notes}</p> : null}

      <div className="process-meter" aria-hidden="true">
        <span style={{ width: `${completion.pct}%` }} />
      </div>

      <ol className="process-step-list">
        {steps.map((step) => (
          <li key={step.id} className="process-step" data-status={step.status}>
            <div className="process-step-top">
              <span className="process-step-order">{step.order}</span>
              <div className="process-step-main">
                <strong>{step.title}</strong>
                {step.detail ? <p>{step.detail}</p> : null}
                <p className="hardware-unit-meta">
                  {step.owner ? `${step.owner} · ` : ''}
                  {(step.linkedUnitIds ?? [])
                    .map((id) => units.find((u) => u.id === id)?.name)
                    .filter(Boolean)
                    .join(' · ') || 'No linked units'}
                </p>
              </div>
              <span className="hub-status-pill" data-status={stepPill(step.status)}>
                {PROCESS_STEP_STATUS_LABELS[step.status]}
              </span>
            </div>

            <div className="process-step-actions">
              <label className="hardware-field">
                <span>Status</span>
                <select
                  value={step.status}
                  onChange={(e) =>
                    onUpdateStep(process.id, step.id, {
                      status: e.target.value as ProcessStepStatus,
                    })
                  }
                >
                  {STEP_STATUS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {step.status === 'blocked' ? (
                <label className="hardware-field hardware-field-grow">
                  <span>Blocked reason</span>
                  <input
                    defaultValue={step.blockedReason ?? ''}
                    placeholder="What’s holding this?"
                    onBlur={(e) =>
                      onUpdateStep(process.id, step.id, {
                        status: 'blocked',
                        blockedReason: e.target.value.trim() || undefined,
                      })
                    }
                  />
                </label>
              ) : (
                <div className="process-step-quick">
                  {PROCESS_STEP_STATUS_ORDER.filter((s) => s !== step.status)
                    .slice(0, 3)
                    .map((status) => (
                      <button
                        key={status}
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          onUpdateStep(process.id, step.id, { status })
                        }
                      >
                        {PROCESS_STEP_STATUS_LABELS[status]}
                      </button>
                    ))}
                </div>
              )}
            </div>
            {step.completedAt ? (
              <p className="hardware-sync-meta">
                Completed {new Date(step.completedAt).toLocaleString()}
                {step.completedBy ? ` · ${step.completedBy}` : ''}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <form
        className="hardware-inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          onAddStep(process.id, newTitle, newOwner)
          setNewTitle('')
          setNewOwner('')
        }}
      >
        <label className="hardware-field hardware-field-grow">
          <span>Add step</span>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Step title"
            required
          />
        </label>
        <label className="hardware-field">
          <span>Owner</span>
          <input
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            placeholder="Team"
          />
        </label>
        <button type="submit" className="btn btn-accent">
          Add
        </button>
      </form>

      <button
        type="button"
        className="btn btn-ghost inventory-delete"
        onClick={() => onDelete(process.id)}
      >
        Delete process
      </button>
    </section>
  )
}
