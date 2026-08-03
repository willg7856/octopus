import { useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import {
  PROCESS_STEP_STATUS_LABELS,
  PROCESS_STEP_STATUS_ORDER,
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

export function VehicleProcessPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, toast } = store
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

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

  function updateStep(
    processId: string,
    stepId: string,
    status: ProcessStepStatus,
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
                blockedReason: status === 'blocked' ? s.blockedReason : undefined,
              }
            }),
          }
        }),
      },
      'Updated',
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
  }

  const completion = selected ? processCompletion(selected) : null
  const steps = selected ? sortProcessSteps(selected.steps) : []

  return (
    <main className="simple-page" aria-label="Vehicle production">
      <header className="simple-head">
        <div>
          <h2>Production</h2>
          <p className="simple-muted">
            Choose a vehicle production tracker below.
          </p>
        </div>
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
        <p className="simple-muted">Loading…</p>
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
                    setSelectedId(process.id)
                  }}
                >
                  <span className="prod-btn-label">{process.name}</span>
                  {total > 0 ? (
                    <span className="prod-btn-meta">
                      {done}/{total}
                    </span>
                  ) : null}
                </button>
              )
            })}

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
                <span className="prod-btn-label">+ {rec.name}</span>
              </button>
            ))}

            <button
              type="button"
              className="prod-btn prod-btn-add"
              onClick={() => setCreating(true)}
            >
              <span className="prod-btn-label">+ New</span>
            </button>
          </div>

          {creating ? (
            <NewProductionForm
              onCreate={createProduction}
              onCancel={() => setCreating(false)}
            />
          ) : null}

          {selected ? (
            <section className="simple-steps" aria-label={selected.name}>
              <div className="prod-detail-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="simple-muted">
                    {selectedVehicle?.name ?? 'Vehicle'}
                    {completion
                      ? ` · ${completion.done}/${completion.total} steps done`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => removeProduction(selected.id)}
                >
                  Delete
                </button>
              </div>

              <ol className="simple-step-list">
                {steps.map((step) => (
                  <li key={step.id} className="simple-step">
                    <span className="simple-step-title">
                      <strong>
                        {step.order}. {step.title}
                      </strong>
                      {step.detail ? (
                        <span className="simple-muted">{step.detail}</span>
                      ) : null}
                    </span>
                    <div
                      className="prod-status-row"
                      role="group"
                      aria-label={`${step.title} status`}
                    >
                      {PROCESS_STEP_STATUS_ORDER.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className="prod-status-btn"
                          aria-pressed={step.status === status}
                          onClick={() =>
                            updateStep(selected.id, step.id, status)
                          }
                        >
                          {PROCESS_STEP_STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>

              <AddStepForm onAdd={(title) => addStep(selected.id, title)} />
            </section>
          ) : (
            <p className="simple-muted">
              Add a production tracker above to get started.
            </p>
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
      name: name.trim(),
      vehicleName: vehicleName.trim() || name.trim(),
    })
  }

  return (
    <form className="simple-form" onSubmit={handleSubmit}>
      <h3>New vehicle production</h3>
      <label>
        Production name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="TVC production"
          required
          autoFocus
        />
      </label>
      <label>
        Vehicle name
        <input
          value={vehicleName}
          onChange={(e) => setVehicleName(e.target.value)}
          placeholder="TVC"
        />
      </label>
      <div className="simple-form-actions">
        <button type="submit" className="btn btn-accent">
          Create
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
