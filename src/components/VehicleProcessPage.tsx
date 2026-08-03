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
  const selected = processes.find((p) => p.id === selectedId) ?? null
  const selectedVehicle = selected
    ? units.find((u) => u.id === selected.vehicleUnitId)
    : null

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

  function createProduction(input: {
    name: string
    vehicleUnitId?: string
    newVehicleName?: string
  }) {
    const now = new Date().toISOString()
    let vehicleUnitId = input.vehicleUnitId
    let nextUnits = lab.units

    if (!vehicleUnitId) {
      const vehicleName = (input.newVehicleName || input.name)
        .replace(/\s+production\s*$/i, '')
        .trim()
      const vehicle: HardwareUnit = {
        id: newId('hw'),
        name: vehicleName || input.name.trim(),
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
      vehicleUnitId = vehicle.id
      nextUnits = [...lab.units, vehicle]
    }

    const process: VehicleProcess = {
      id: newId('proc'),
      vehicleUnitId,
      name: input.name.trim(),
      updatedAt: now,
      steps: defaultSteps(vehicleUnitId),
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
    void store.commit(
      {
        ...lab,
        processes: lab.processes.filter((p) => p.id !== processId),
      },
      'Removed',
    )
    setSelectedId(null)
  }

  const completion = selected ? processCompletion(selected) : null
  const steps = selected ? sortProcessSteps(selected.steps) : []

  return (
    <main className="simple-page" aria-label="Vehicle production">
      <header className="simple-head">
        <div>
          <h2>Production</h2>
          <p className="simple-muted">
            {selected
              ? 'Track build and checkout steps for this vehicle.'
              : 'Open a vehicle production tracker, or create a new one.'}
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
          {selected ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelectedId(null)}
            >
              All productions
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => setCreating(true)}
            >
              New production
            </button>
          )}
        </div>
      </header>

      {sync === 'error' && syncError ? (
        <p className="simple-error" role="alert">
          {syncError}
        </p>
      ) : null}

      {sync === 'loading' ? (
        <p className="simple-muted">Loading…</p>
      ) : selected ? (
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
      ) : (
        <>
          {creating ? (
            <NewProductionForm
              vehicles={vehicles}
              onCreate={createProduction}
              onCancel={() => setCreating(false)}
            />
          ) : null}

          {processes.length === 0 && !creating ? (
            <p className="simple-muted">
              No vehicle productions yet. Create one to start tracking.
            </p>
          ) : null}

          {processes.length > 0 ? (
            <div className="prod-grid" role="list">
              {processes.map((process) => {
                const { done, total } = processCompletion(process)
                const vehicle = units.find((u) => u.id === process.vehicleUnitId)
                return (
                  <button
                    key={process.id}
                    type="button"
                    className="prod-tile"
                    role="listitem"
                    onClick={() => {
                      setCreating(false)
                      setSelectedId(process.id)
                    }}
                  >
                    <strong>{process.name}</strong>
                    <span className="simple-muted">
                      {vehicle?.name ?? 'Vehicle'}
                      {total > 0 ? ` · ${done}/${total} done` : ''}
                    </span>
                  </button>
                )
              })}
              {!creating ? (
                <button
                  type="button"
                  className="prod-tile prod-tile-new"
                  onClick={() => setCreating(true)}
                >
                  <strong>New production</strong>
                  <span className="simple-muted">
                    Add another vehicle tracker
                  </span>
                </button>
              ) : null}
            </div>
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
  vehicles,
  onCreate,
  onCancel,
}: {
  vehicles: HardwareUnit[]
  onCreate: (input: {
    name: string
    vehicleUnitId?: string
    newVehicleName?: string
  }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'existing' | 'new'>(
    vehicles.length > 0 ? 'existing' : 'new',
  )
  const [vehicleUnitId, setVehicleUnitId] = useState(vehicles[0]?.id ?? '')
  const [newVehicleName, setNewVehicleName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (mode === 'existing') {
      const id = vehicleUnitId || vehicles[0]?.id
      if (!id) return
      onCreate({ name: name.trim(), vehicleUnitId: id })
      return
    }
    onCreate({
      name: name.trim(),
      newVehicleName: newVehicleName.trim() || name.trim(),
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

      {vehicles.length > 0 ? (
        <label>
          Vehicle source
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'existing' | 'new')}
          >
            <option value="existing">Link existing vehicle</option>
            <option value="new">Create new vehicle</option>
          </select>
        </label>
      ) : null}

      {mode === 'existing' && vehicles.length > 0 ? (
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
      ) : (
        <label>
          Vehicle name
          <input
            value={newVehicleName}
            onChange={(e) => setNewVehicleName(e.target.value)}
            placeholder="TVC"
          />
        </label>
      )}

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
