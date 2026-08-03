import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import {
  PROCESS_STEP_STATUS_LABELS,
  newId,
  processCompletion,
  sortProcessSteps,
  sortProcesses,
  sortUnits,
} from '../hardwareData'
import type {
  ProcessStepStatus,
  VehicleProcess,
  VehicleProcessStep,
} from '../types'
import { useLabStore } from '../useLabStore'

const RECOMMENDED_PRODUCTIONS = [
  { name: 'B1M production', vehicleName: 'B1M' },
  { name: 'TVC production', vehicleName: 'TVC' },
  { name: 'STRAVOX B1M production', vehicleName: 'STRAVOX airframe' },
  { name: '100M hopper production', vehicleName: '100M hopper' },
] as const

const QUICK_STATUSES: ProcessStepStatus[] = ['active', 'done', 'blocked']
const MORE_STATUSES: ProcessStepStatus[] = ['pending', 'skipped']

export function VehicleProcessPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, toast } = store
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingSteps, setEditingSteps] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)

  const units = useMemo(() => sortUnits(lab.units), [lab.units])
  const processes = useMemo(() => sortProcesses(lab.processes), [lab.processes])
  const selected =
    processes.find((p) => p.id === selectedId) ?? processes[0] ?? null
  const selectedVehicle = selected
    ? units.find((u) => u.id === selected.vehicleUnitId)
    : null
  const missingRecommended = useMemo(
    () =>
      RECOMMENDED_PRODUCTIONS.filter(
        (rec) =>
          !processes.some(
            (p) => p.name.toLowerCase() === rec.name.toLowerCase(),
          ),
      ),
    [processes],
  )

  useEffect(() => {
    if (!selectedId && processes[0]) setSelectedId(processes[0].id)
  }, [processes, selectedId])

  function updateStep(
    processId: string,
    stepId: string,
    status: ProcessStepStatus,
    blockedReason?: string,
  ) {
    const now = new Date().toISOString()
    void store.commit(
      {
        ...lab,
        processes: lab.processes.map((p) => {
          if (p.id !== processId) return p
          return {
            ...p,
            updatedAt: now,
            steps: p.steps.map((s) => {
              if (s.id !== stepId) return s
              const done = status === 'done' || status === 'skipped'
              return {
                ...s,
                status,
                completedAt: done ? s.completedAt || now : undefined,
                completedBy: done ? s.completedBy || user?.name : undefined,
                blockedReason:
                  status === 'blocked'
                    ? (blockedReason ?? s.blockedReason)
                    : undefined,
              }
            }),
          }
        }),
      },
      'Updated',
    )
  }

  function setBlockedReason(processId: string, stepId: string, reason: string) {
    const now = new Date().toISOString()
    void store.commit(
      {
        ...lab,
        processes: lab.processes.map((p) => {
          if (p.id !== processId) return p
          return {
            ...p,
            updatedAt: now,
            steps: p.steps.map((s) =>
              s.id === stepId
                ? { ...s, blockedReason: reason.trim() || undefined }
                : s,
            ),
          }
        }),
      },
      'Saved',
    )
  }

  function addStep(processId: string, title: string) {
    if (!title.trim()) return
    const now = new Date().toISOString()
    void store.commit(
      {
        ...lab,
        processes: lab.processes.map((p) => {
          if (p.id !== processId) return p
          const order = p.steps.reduce((max, s) => Math.max(max, s.order), 0) + 1
          const step: VehicleProcessStep = {
            id: newId('ps'),
            order,
            title: title.trim(),
            owner: user?.name,
            status: 'pending',
            linkedUnitIds: [p.vehicleUnitId],
          }
          return { ...p, updatedAt: now, steps: [...p.steps, step] }
        }),
      },
      'Step added',
    )
  }

  function editStep(
    processId: string,
    stepId: string,
    patch: { title: string; detail?: string },
  ) {
    if (!patch.title.trim()) return
    const now = new Date().toISOString()
    void store.commit(
      {
        ...lab,
        processes: lab.processes.map((p) => {
          if (p.id !== processId) return p
          return {
            ...p,
            updatedAt: now,
            steps: p.steps.map((s) =>
              s.id === stepId
                ? {
                    ...s,
                    title: patch.title.trim(),
                    detail: patch.detail?.trim() || undefined,
                  }
                : s,
            ),
          }
        }),
      },
      'Step saved',
    )
    setEditingStepId(null)
  }

  function deleteStep(processId: string, stepId: string) {
    const process = lab.processes.find((p) => p.id === processId)
    const step = process?.steps.find((s) => s.id === stepId)
    if (!step || !window.confirm(`Delete step “${step.title}”?`)) return
    const now = new Date().toISOString()
    void store.commit(
      {
        ...lab,
        processes: lab.processes.map((p) => {
          if (p.id !== processId) return p
          const remaining = sortProcessSteps(
            p.steps.filter((s) => s.id !== stepId),
          ).map((s, i) => ({ ...s, order: i + 1 }))
          return { ...p, updatedAt: now, steps: remaining }
        }),
      },
      'Step deleted',
    )
    if (editingStepId === stepId) setEditingStepId(null)
  }

  function createProduction(input: { name: string; vehicleName?: string }) {
    const now = new Date().toISOString()
    const wanted = (input.vehicleName || input.name)
      .replace(/\s+production\s*$/i, '')
      .trim()
    let nextUnits = lab.units
    let vehicle = nextUnits.find(
      (u) =>
        u.kind === 'vehicle' && u.name.toLowerCase() === wanted.toLowerCase(),
    )

    if (!vehicle) {
      vehicle = {
        id: newId('hw'),
        name: wanted || input.name.trim(),
        kind: 'vehicle',
        serial: `VEH-${Date.now().toString(36).toUpperCase()}`,
        hwRev: '—',
        status: 'concept',
        location: 'Goods Shed',
        owner: user?.name,
        notes: 'Created from Production',
        updatedAt: now,
        quantity: 1,
      }
      nextUnits = [...lab.units, vehicle]
    }

    const process: VehicleProcess = {
      id: newId('proc'),
      vehicleUnitId: vehicle.id,
      name: input.name.trim(),
      updatedAt: now,
      steps: defaultSteps(vehicle.id),
    }

    void store.commit(
      {
        ...lab,
        units: nextUnits,
        processes: [process, ...lab.processes],
      },
      'Production created',
    )
    setCreating(false)
    setSelectedId(process.id)
  }

  function removeProduction(processId: string) {
    const process = lab.processes.find((p) => p.id === processId)
    if (!process || !window.confirm(`Remove ${process.name}?`)) return
    const remaining = lab.processes.filter((p) => p.id !== processId)
    void store.commit(
      {
        ...lab,
        processes: remaining,
      },
      'Removed',
    )
    setSelectedId(remaining[0]?.id ?? null)
    setEditingSteps(false)
    setEditingStepId(null)
  }

  const completion = selected ? processCompletion(selected) : null
  const steps = selected ? sortProcessSteps(selected.steps) : []
  const progressPct =
    completion && completion.total > 0
      ? Math.round((completion.done / completion.total) * 100)
      : 0
  const activeStep = steps.find((s) => s.status === 'active')
  const blockedCount = steps.filter((s) => s.status === 'blocked').length

  return (
    <main className="simple-page" aria-label="Vehicle production">
      <header className="simple-head">
        <div>
          <h2>Production</h2>
          <p className="simple-muted">
            Vehicle build & checkout trackers for the Goods Shed.
          </p>
        </div>
        <div className="simple-head-actions">
          {saving ? <span className="simple-sync">Saving…</span> : null}
          {sync === 'shared' && !saving ? (
            <span className="simple-sync simple-sync-ok">Live</span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void store.refresh({ quiet: true })}
            disabled={sync === 'loading'}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => setCreating((v) => !v)}
          >
            {creating ? 'Cancel' : 'New production'}
          </button>
        </div>
      </header>

      {sync === 'error' && syncError ? (
        <p className="simple-error" role="alert">
          {syncError}
        </p>
      ) : null}

      {sync === 'loading' ? (
        <p className="simple-muted">Loading team lab…</p>
      ) : (
        <>
          <div className="prod-buttons" role="toolbar" aria-label="Productions">
            {processes.map((process) => {
              const { done, total } = processCompletion(process)
              return (
                <button
                  key={process.id}
                  type="button"
                  className="prod-btn"
                  aria-pressed={selected?.id === process.id}
                  onClick={() => {
                    setCreating(false)
                    setEditingStepId(null)
                    setSelectedId(process.id)
                  }}
                >
                  <span className="prod-btn-label">{shortName(process.name)}</span>
                  {total > 0 ? (
                    <span className="prod-btn-meta">
                      {done}/{total}
                    </span>
                  ) : null}
                </button>
              )
            })}

            {processes.length === 0 &&
              missingRecommended.map((rec) => (
                <button
                  key={rec.name}
                  type="button"
                  className="prod-btn prod-btn-add"
                  onClick={() =>
                    createProduction({
                      name: rec.name,
                      vehicleName: rec.vehicleName,
                    })
                  }
                >
                  <span className="prod-btn-label">+ {shortName(rec.name)}</span>
                </button>
              ))}

            {processes.length > 0 && missingRecommended.length > 0 ? (
              <details className="prod-more">
                <summary>Add suggested</summary>
                <div className="prod-more-list">
                  {missingRecommended.map((rec) => (
                    <button
                      key={rec.name}
                      type="button"
                      className="prod-btn prod-btn-add"
                      onClick={() =>
                        createProduction({
                          name: rec.name,
                          vehicleName: rec.vehicleName,
                        })
                      }
                    >
                      <span className="prod-btn-label">+ {shortName(rec.name)}</span>
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </div>

          {creating ? (
            <NewProductionForm
              onCreate={createProduction}
              onCancel={() => setCreating(false)}
            />
          ) : null}

          {selected ? (
            <section className="prod-panel" aria-label={selected.name}>
              <div className="prod-detail-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="simple-muted">
                    {selectedVehicle?.name ?? 'Vehicle'}
                    {activeStep ? ` · Active: ${activeStep.title}` : ''}
                    {blockedCount > 0 ? ` · ${blockedCount} blocked` : ''}
                  </p>
                </div>
                <div className="prod-detail-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-pressed={editingSteps}
                    onClick={() => {
                      setEditingSteps((v) => !v)
                      setEditingStepId(null)
                    }}
                  >
                    {editingSteps ? 'Done editing' : 'Edit steps'}
                  </button>
                  {editingSteps ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeProduction(selected.id)}
                    >
                      Delete tracker
                    </button>
                  ) : null}
                </div>
              </div>

              {completion && completion.total > 0 ? (
                <div className="prod-progress" aria-hidden="true">
                  <div className="prod-progress-bar">
                    <span style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="prod-progress-label">
                    {completion.done}/{completion.total} done · {progressPct}%
                  </span>
                </div>
              ) : null}

              <ol className="simple-step-list">
                {steps.map((step) => {
                  const isEditing = editingStepId === step.id
                  return (
                    <li
                      key={step.id}
                      className="simple-step"
                      data-status={step.status}
                    >
                      {isEditing ? (
                        <EditStepForm
                          step={step}
                          onSave={(patch) =>
                            editStep(selected.id, step.id, patch)
                          }
                          onCancel={() => setEditingStepId(null)}
                        />
                      ) : (
                        <>
                          <div className="simple-step-top">
                            <span className="simple-step-title">
                              <strong>
                                <span className="prod-step-num">{step.order}</span>
                                {step.title}
                              </strong>
                              {step.detail ? (
                                <span className="simple-muted">{step.detail}</span>
                              ) : null}
                              {step.status === 'done' && step.completedBy ? (
                                <span className="prod-step-meta">
                                  Done · {step.completedBy}
                                  {step.completedAt
                                    ? ` · ${formatWhen(step.completedAt)}`
                                    : ''}
                                </span>
                              ) : null}
                              {step.status === 'blocked' && step.blockedReason ? (
                                <span className="prod-step-meta prod-step-blocked">
                                  Blocked · {step.blockedReason}
                                </span>
                              ) : null}
                            </span>
                            {editingSteps ? (
                              <div className="prod-step-actions">
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => setEditingStepId(step.id)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() =>
                                    deleteStep(selected.id, step.id)
                                  }
                                >
                                  Delete
                                </button>
                              </div>
                            ) : (
                              <span
                                className="prod-step-badge"
                                data-status={step.status}
                              >
                                {PROCESS_STEP_STATUS_LABELS[step.status]}
                              </span>
                            )}
                          </div>

                          <div
                            className="prod-status-row"
                            role="group"
                            aria-label={`${step.title} status`}
                          >
                            {QUICK_STATUSES.map((status) => (
                              <button
                                key={status}
                                type="button"
                                className="prod-status-btn"
                                data-status={status}
                                aria-pressed={step.status === status}
                                onClick={() =>
                                  updateStep(selected.id, step.id, status)
                                }
                              >
                                {PROCESS_STEP_STATUS_LABELS[status]}
                              </button>
                            ))}
                            {MORE_STATUSES.map((status) => (
                              <button
                                key={status}
                                type="button"
                                className="prod-status-btn prod-status-btn-quiet"
                                data-status={status}
                                aria-pressed={step.status === status}
                                onClick={() =>
                                  updateStep(selected.id, step.id, status)
                                }
                              >
                                {PROCESS_STEP_STATUS_LABELS[status]}
                              </button>
                            ))}
                          </div>

                          {step.status === 'blocked' ? (
                            <label className="prod-block-reason">
                              Why blocked?
                              <input
                                key={`${step.id}-block`}
                                defaultValue={step.blockedReason ?? ''}
                                placeholder="Waiting on hardware, weather, review…"
                                onBlur={(e) => {
                                  const next = e.target.value.trim()
                                  if (next !== (step.blockedReason ?? '')) {
                                    setBlockedReason(
                                      selected.id,
                                      step.id,
                                      next,
                                    )
                                  }
                                }}
                              />
                            </label>
                          ) : null}
                        </>
                      )}
                    </li>
                  )
                })}
              </ol>

              {editingSteps || steps.length === 0 ? (
                <AddStepForm onAdd={(title) => addStep(selected.id, title)} />
              ) : null}
            </section>
          ) : (
            <div className="prod-empty">
              <p>
                No production trackers yet. Create{' '}
                <strong>B1M</strong>, <strong>TVC</strong>,{' '}
                <strong>STRAVOX</strong>, or <strong>100M hopper</strong> above,
                or start a new one.
              </p>
            </div>
          )}
        </>
      )}

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  )
}

function shortName(name: string) {
  return name.replace(/\s+production\s*$/i, '').trim() || name
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function defaultSteps(vehicleUnitId: string): VehicleProcessStep[] {
  const titles = [
    'Airframe / structure',
    'Propulsion install',
    'Avionics integrate & flash',
    'GSE / ground systems',
    'Checkout & functional tests',
    'Pad / range readiness',
    'Flight readiness review',
  ]

  return titles.map((title, i) => ({
    id: newId('ps'),
    order: i + 1,
    title,
    status: 'pending' as const,
    linkedUnitIds: [vehicleUnitId],
  }))
}

function NewProductionForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: { name: string; vehicleName?: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [vehicleName, setVehicleName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate({
      name: name.trim().toLowerCase().endsWith('production')
        ? name.trim()
        : `${name.trim()} production`,
      vehicleName: vehicleName.trim() || name.trim(),
    })
  }

  return (
    <form className="simple-form prod-create" onSubmit={handleSubmit}>
      <h3>New vehicle production</h3>
      <p className="simple-muted">
        Creates a checklist and a Hardware vehicle if one doesn’t exist yet.
      </p>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="TVC"
          required
          autoFocus
        />
      </label>
      <label>
        Vehicle name
        <input
          value={vehicleName}
          onChange={(e) => setVehicleName(e.target.value)}
          placeholder="Same as name if blank"
        />
      </label>
      <div className="simple-form-actions">
        <button type="submit" className="btn btn-accent">
          Create tracker
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function EditStepForm({
  step,
  onSave,
  onCancel,
}: {
  step: VehicleProcessStep
  onSave: (patch: { title: string; detail?: string }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(step.title)
  const [detail, setDetail] = useState(step.detail ?? '')

  return (
    <form
      className="simple-form prod-edit-step"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ title, detail })
      }}
    >
      <label>
        Step title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label>
        Detail
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Optional notes for the team"
        />
      </label>
      <div className="simple-form-actions">
        <button type="submit" className="btn btn-accent">
          Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function AddStepForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('')
  return (
    <form
      className="simple-add-step"
      onSubmit={(e) => {
        e.preventDefault()
        onAdd(title)
        setTitle('')
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a step…"
        aria-label="New step title"
      />
      <button type="submit" className="btn btn-ghost">
        Add
      </button>
    </form>
  )
}
