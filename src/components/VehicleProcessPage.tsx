import { useMemo, useState, type FormEvent } from 'react'
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

export function VehicleProcessPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, syncError, saving, toast } = store
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const units = useMemo(() => sortUnits(lab.units), [lab.units])
  const vehicles = useMemo(
    () => units.filter((u) => u.kind === 'vehicle'),
    [units],
  )
  const processes = useMemo(() => sortProcesses(lab.processes), [lab.processes])
  const selected =
    processes.find((p) => p.id === selectedId) ?? processes[0] ?? null

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

  function createProcess(vehicleUnitId: string, name: string) {
    const now = new Date().toISOString()
    const process: VehicleProcess = {
      id: newId('proc'),
      vehicleUnitId,
      name: name.trim(),
      updatedAt: now,
      steps: defaultSteps(vehicleUnitId, units),
    }
    void store.commit(
      { ...lab, processes: [process, ...lab.processes] },
      'Process created',
    )
    setSelectedId(process.id)
    setCreating(false)
  }

  const completion = selected ? processCompletion(selected) : null
  const steps = selected ? sortProcessSteps(selected.steps) : []

  return (
    <main className="simple-page" aria-label="Vehicle process">
      <header className="simple-head">
        <h2>Vehicle production</h2>
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
            {creating ? 'Cancel' : 'New process'}
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
          {creating ? (
            <NewProcessForm
              vehicles={vehicles}
              onCreate={createProcess}
              onCancel={() => setCreating(false)}
            />
          ) : null}

          {processes.length === 0 && !creating ? (
            <p className="simple-muted">No processes yet. Create one to start.</p>
          ) : null}

          {processes.length > 0 ? (
            <div className="simple-toolbar">
              <label>
                Process
                <select
                  value={selected?.id ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {completion ? (
                <span className="simple-muted">
                  {completion.done}/{completion.total} done
                </span>
              ) : null}
            </div>
          ) : null}

          {selected ? (
            <section className="simple-steps" aria-label={selected.name}>
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
                    <select
                      aria-label={`${step.title} status`}
                      value={step.status}
                      onChange={(e) =>
                        updateStep(
                          selected.id,
                          step.id,
                          e.target.value as ProcessStepStatus,
                        )
                      }
                    >
                      {STEP_STATUS_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ol>

              <AddStepForm onAdd={(title) => addStep(selected.id, title)} />
            </section>
          ) : null}
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

function defaultSteps(
  vehicleUnitId: string,
  units: HardwareUnit[],
): VehicleProcessStep[] {
  const motor = units.find((u) => u.kind === 'motor')
  const avionics = units.find((u) => u.kind === 'avionics')
  const titles: Array<{
    title: string
    linkedUnitIds: string[]
  }> = [
    { title: 'Airframe dry-fit', linkedUnitIds: [vehicleUnitId] },
    {
      title: 'Motor install & retention',
      linkedUnitIds: [vehicleUnitId, ...(motor ? [motor.id] : [])],
    },
    {
      title: 'Avionics integrate & flash',
      linkedUnitIds: [vehicleUnitId, ...(avionics ? [avionics.id] : [])],
    },
    { title: 'GSE / logger checkout', linkedUnitIds: [] },
    { title: 'Pad stand load path', linkedUnitIds: [] },
    { title: 'Static-fire readiness review', linkedUnitIds: [vehicleUnitId] },
    { title: 'Flight readiness review', linkedUnitIds: [vehicleUnitId] },
  ]

  return titles.map((t, i) => ({
    id: newId('ps'),
    order: i + 1,
    title: t.title,
    status: 'pending' as const,
    linkedUnitIds: t.linkedUnitIds,
  }))
}

function NewProcessForm({
  vehicles,
  onCreate,
  onCancel,
}: {
  vehicles: HardwareUnit[]
  onCreate: (vehicleUnitId: string, name: string) => void
  onCancel: () => void
}) {
  const [vehicleUnitId, setVehicleUnitId] = useState(vehicles[0]?.id ?? '')
  const [name, setName] = useState('')

  if (vehicles.length === 0) {
    return (
      <p className="simple-muted">
        Add a vehicle in Inventory before creating a process.
      </p>
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const id = vehicleUnitId || vehicles[0]?.id
    if (!id || !name.trim()) return
    onCreate(id, name)
    setName('')
  }

  return (
    <form className="simple-form simple-form-inline" onSubmit={handleSubmit}>
      <label>
        Vehicle
        <select
          value={vehicleUnitId || vehicles[0]?.id}
          onChange={(e) => setVehicleUnitId(e.target.value)}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Process name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="B1M build & checkout"
          required
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
