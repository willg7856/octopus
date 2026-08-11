import { useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import { useConfirm } from './ConfirmDialog'
import { SyncBar } from './SyncBar'
import { SyncStatusBanners } from './SyncStatusBanners'
import {
  InventoryLinkPicker,
  linkedInventoryNames,
} from './InventoryLinkPicker'
import {
  HARDWARE_KIND_LABELS,
  PROCESS_STEP_STATUS_LABELS,
  isInventoryKind,
  isSystemKind,
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

const QUICK_STATUSES: ProcessStepStatus[] = ['active', 'done', 'blocked']
const MORE_STATUSES: ProcessStepStatus[] = ['pending', 'skipped']

export function VehicleProcessPage({ user }: { user: AuthUser | null }) {
  const store = useLabStore()
  const { lab, sync, saving, conflict, toast, updatedAt, updatedBy, hasLoaded } =
    store
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingSteps, setEditingSteps] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mobileMode, setMobileMode] = useState<'list' | 'detail'>('list')

  const units = useMemo(() => sortUnits(lab.units), [lab.units])
  const systemUnits = useMemo(
    () => units.filter((u) => isSystemKind(u.kind)),
    [units],
  )
  const inventoryUnits = useMemo(
    () => units.filter((u) => isInventoryKind(u.kind)),
    [units],
  )
  const linkableUnits = useMemo(
    () => sortUnits([...systemUnits, ...inventoryUnits]),
    [systemUnits, inventoryUnits],
  )
  const processes = useMemo(() => sortProcesses(lab.processes), [lab.processes])
  const unitNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of units) map.set(u.id, u.name)
    return map
  }, [units])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return processes
    return processes.filter((p) => {
      const vehicleName = unitNameById.get(p.vehicleUnitId)
      return [p.name, vehicleName, ...p.steps.map((s) => s.title)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [processes, query, unitNameById])
  const selected =
    processes.find((p) => p.id === selectedId) ??
    (mobileMode === 'detail' || creating ? null : filtered[0] ?? null)
  const selectedVehicle = selected
    ? units.find((u) => u.id === selected.vehicleUnitId)
    : null

  function openDetail(id: string | null, isCreating = false) {
    setCreating(isCreating)
    setSelectedId(id)
    setEditingStepId(null)
    if (!isCreating) setEditingSteps(false)
    setMobileMode('detail')
  }

  function backToList() {
    setCreating(false)
    setEditingSteps(false)
    setEditingStepId(null)
    setMobileMode('list')
  }

  function updateStep(
    processId: string,
    stepId: string,
    status: ProcessStepStatus,
    blockedReason?: string,
  ) {
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) => {
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
    }), 'Updated')
  }

  function setBlockedReason(processId: string, stepId: string, reason: string) {
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) => {
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
    }), 'Saved')
  }

  function setVehicleUnit(processId: string, vehicleUnitId: string) {
    if (!vehicleUnitId) return
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) =>
        p.id === processId
          ? { ...p, vehicleUnitId, updatedAt: now }
          : p,
      ),
    }), 'Vehicle linked')
  }

  function setProcessInventory(processId: string, linkedInventoryIds: string[]) {
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) =>
        p.id === processId
          ? {
              ...p,
              linkedInventoryIds:
                linkedInventoryIds.length > 0 ? linkedInventoryIds : undefined,
              updatedAt: now,
            }
          : p,
      ),
    }), 'Materials updated')
  }

  function setProcessHardware(processId: string, linkedHardwareIds: string[]) {
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) =>
        p.id === processId
          ? {
              ...p,
              linkedHardwareIds:
                linkedHardwareIds.length > 0 ? linkedHardwareIds : undefined,
              updatedAt: now,
            }
          : p,
      ),
    }), 'Hardware in use updated')
  }

  function addStep(processId: string, title: string) {
    if (!title.trim()) return
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) => {
        if (p.id !== processId) return p
        const order = p.steps.reduce((max, s) => Math.max(max, s.order), 0) + 1
        const step: VehicleProcessStep = {
          id: newId('ps'),
          order,
          title: title.trim(),
          owner: user?.name,
          status: 'pending',
          linkedUnitIds: [],
        }
        return { ...p, updatedAt: now, steps: [...p.steps, step] }
      }),
    }), 'Step added')
  }

  function editStep(
    processId: string,
    stepId: string,
    patch: { title: string; detail?: string; linkedUnitIds: string[] },
  ) {
    if (!patch.title.trim()) return
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) => {
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
                  linkedUnitIds: patch.linkedUnitIds,
                }
              : s,
          ),
        }
      }),
    }), 'Step saved')
    setEditingStepId(null)
  }

  async function deleteStep(processId: string, stepId: string) {
    const process = lab.processes.find((p) => p.id === processId)
    const step = process?.steps.find((s) => s.id === stepId)
    if (!step) return
    const ok = await confirm(`Delete step “${step.title}”?`)
    if (!ok) return
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) => {
        if (p.id !== processId) return p
        const remaining = sortProcessSteps(
          p.steps.filter((s) => s.id !== stepId),
        ).map((s, i) => ({ ...s, order: i + 1 }))
        return { ...p, updatedAt: now, steps: remaining }
      }),
    }), 'Step deleted')
    if (editingStepId === stepId) setEditingStepId(null)
  }

  function moveStep(processId: string, stepId: string, direction: -1 | 1) {
    const now = new Date().toISOString()
    void store.commit((prev) => {
      const process = prev.processes.find((p) => p.id === processId)
      if (!process) return prev
      const ordered = sortProcessSteps(process.steps)
      const index = ordered.findIndex((s) => s.id === stepId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= ordered.length) return prev
      const next = [...ordered]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      const renumbered = next.map((step, i) => ({ ...step, order: i + 1 }))
      return {
        ...prev,
        processes: prev.processes.map((p) =>
          p.id === processId
            ? { ...p, updatedAt: now, steps: renumbered }
            : p,
        ),
      }
    }, 'Steps reordered')
  }

  function createProduction(input: {
    name: string
    vehicleUnitId?: string
    vehicleName?: string
    linkedInventoryIds?: string[]
    linkedHardwareIds?: string[]
  }) {
    const now = new Date().toISOString()
    const wanted = (input.vehicleName || input.name)
      .replace(/\s+production\s*$/i, '')
      .trim()
    const processId = newId('proc')
    const materials =
      input.linkedInventoryIds && input.linkedInventoryIds.length > 0
        ? input.linkedInventoryIds
        : undefined
    const hardwareInUse =
      input.linkedHardwareIds && input.linkedHardwareIds.length > 0
        ? input.linkedHardwareIds
        : undefined

    void store.commit((prev) => {
      let nextUnits = prev.units
      let vehicle =
        (input.vehicleUnitId
          ? nextUnits.find((u) => u.id === input.vehicleUnitId)
          : undefined) ??
        nextUnits.find(
          (u) =>
            u.kind === 'vehicle' &&
            u.name.toLowerCase() === wanted.toLowerCase(),
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
        nextUnits = [...prev.units, vehicle]
      }

      const process: VehicleProcess = {
        id: processId,
        vehicleUnitId: vehicle.id,
        name: input.name.trim(),
        linkedInventoryIds: materials,
        linkedHardwareIds: hardwareInUse,
        updatedAt: now,
        steps: [],
      }

      return {
        ...prev,
        units: nextUnits,
        processes: [process, ...prev.processes],
      }
    }, 'Production created')
    setCreating(false)
    openDetail(processId)
  }

  async function removeProduction(processId: string) {
    const process = lab.processes.find((p) => p.id === processId)
    if (!process) return
    const ok = await confirm(`Remove “${process.name}” tracker?`)
    if (!ok) return
    void store.commit(
      (prev) => ({
        ...prev,
        processes: prev.processes.filter((p) => p.id !== processId),
      }),
      'Removed',
    )
    setSelectedId(null)
    setEditingSteps(false)
    setEditingStepId(null)
    setMobileMode('list')
  }

  const completion = selected ? processCompletion(selected) : null
  const steps = selected ? sortProcessSteps(selected.steps) : []
  const progressPct =
    completion && completion.total > 0
      ? Math.round((completion.done / completion.total) * 100)
      : 0
  const activeStep = steps.find((s) => s.status === 'active')
  const blockedCount = steps.filter((s) => s.status === 'blocked').length
  const selectedMaterials = selected
    ? linkedInventoryNames(selected.linkedInventoryIds, units)
    : []
  const selectedHardwareInUse = selected
    ? linkedInventoryNames(selected.linkedHardwareIds, units)
    : []

  return (
    <main className="simple-page" aria-label="Vehicle production">
      <header className="simple-head">
        <div>
          <h2>Production</h2>
          <p className="simple-muted">
            Vehicle build & checkout trackers — steps, blockers, linked hardware.
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
            disabled={!hasLoaded}
          >
            New production
          </button>
        </div>
      </header>

      <SyncStatusBanners store={store} />

      {sync === 'loading' || (sync === 'error' && !hasLoaded) ? (
        <p className="simple-muted">
          {sync === 'loading'
            ? 'Loading…'
            : 'Could not load shared lab. Retry above — do not add productions until it recovers.'}
        </p>
      ) : (
        <div className="simple-split" data-mode={mobileMode}>
          <section className="simple-list-panel">
            <input
              className="simple-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search productions"
            />
            <ul className="simple-list">
              {filtered.map((process) => {
                const { done, total } = processCompletion(process)
                const glance = processGlanceStatus(process)
                const vehicleName =
                  unitNameById.get(process.vehicleUnitId) ?? 'Vehicle'
                return (
                  <li key={process.id}>
                    <button
                      type="button"
                      className="simple-list-row"
                      data-selected={
                        !creating && selected?.id === process.id
                          ? 'true'
                          : 'false'
                      }
                      onClick={() => openDetail(process.id)}
                    >
                      <span>
                        <strong>{shortName(process.name)}</strong>
                        <span className="simple-muted">
                          {vehicleName}
                          {total > 0 ? ` · ${done}/${total} done` : ''}
                        </span>
                      </span>
                      <span
                        className="status-badge"
                        data-kind="process"
                        data-status={glance}
                      >
                        {PROCESS_STEP_STATUS_LABELS[glance]}
                      </span>
                    </button>
                  </li>
                )
              })}
              {filtered.length === 0 ? (
                <li className="simple-muted">
                  {query.trim()
                    ? 'No productions match that search.'
                    : 'No production trackers yet — add one to start.'}
                </li>
              ) : null}
            </ul>
          </section>

          <section className="simple-detail">
            <button
              type="button"
              className="btn btn-ghost simple-back"
              onClick={backToList}
            >
              ← Back to list
            </button>
            {creating ? (
              <NewProductionForm
                vehicles={systemUnits}
                inventory={inventoryUnits}
                onCreate={createProduction}
                onCancel={backToList}
              />
            ) : selected ? (
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

                {editingSteps ? (
                  <div className="prod-edit-meta">
                    <label className="simple-form" style={{ maxWidth: '28rem' }}>
                      Linked Hardware vehicle
                      <select
                        value={selected.vehicleUnitId}
                        onChange={(e) =>
                          setVehicleUnit(selected.id, e.target.value)
                        }
                      >
                        {systemUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.name} ({HARDWARE_KIND_LABELS[unit.kind]})
                          </option>
                        ))}
                      </select>
                    </label>
                    <InventoryLinkPicker
                      units={systemUnits}
                      selectedIds={selected.linkedHardwareIds ?? []}
                      onChange={(ids) => setProcessHardware(selected.id, ids)}
                      includeHardware
                      includeInventory={false}
                      legend="Hardware in use"
                      hint="Subsystems and vehicles used on this production. Soft link only — does not change Hardware status."
                    />
                    <InventoryLinkPicker
                      units={inventoryUnits}
                      selectedIds={selected.linkedInventoryIds ?? []}
                      onChange={(ids) => setProcessInventory(selected.id, ids)}
                      legend="Materials from inventory"
                      hint="Parts and tools for this production overall. Linking does not change stock qty."
                    />
                  </div>
                ) : (
                  <div className="prod-materials-summary">
                    <p className="simple-muted">
                      {selectedHardwareInUse.length > 0
                        ? `Hardware in use: ${selectedHardwareInUse.join(', ')}`
                        : 'No hardware linked — Edit steps to mark subsystems in use.'}
                    </p>
                    <p className="simple-muted">
                      {selectedMaterials.length > 0
                        ? `Materials: ${selectedMaterials.join(', ')}`
                        : 'No inventory materials linked — Edit steps to add some.'}
                    </p>
                  </div>
                )}

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
                  {steps.map((step, index) => {
                    const isEditing = editingStepId === step.id
                    const linked = (step.linkedUnitIds ?? [])
                      .map((id) => units.find((u) => u.id === id))
                      .filter(Boolean) as HardwareUnit[]
                    return (
                      <li
                        key={step.id}
                        className="simple-step"
                        data-status={step.status}
                      >
                        {isEditing ? (
                          <EditStepForm
                            step={step}
                            units={linkableUnits}
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
                                  <span className="prod-step-num">
                                    {step.order}
                                  </span>
                                  {step.title}
                                </strong>
                                {step.detail ? (
                                  <span className="simple-muted">
                                    {step.detail}
                                  </span>
                                ) : null}
                                {linked.length > 0 ? (
                                  <span className="simple-muted">
                                    Linked:{' '}
                                    {linked
                                      .map(
                                        (u) =>
                                          `${u.name} (${HARDWARE_KIND_LABELS[u.kind]})`,
                                      )
                                      .join(', ')}
                                  </span>
                                ) : null}
                                {step.status === 'done' && step.completedBy ? (
                                  <span className="prod-step-meta">
                                    Done · {step.completedBy}
                                    {step.completedAt
                                      ? ` · ${formatWhen(step.completedAt)}`
                                      : ''}
                                  </span>
                                ) : null}
                                {step.status === 'blocked' &&
                                step.blockedReason ? (
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
                                    aria-label={`Move ${step.title} up`}
                                    disabled={index === 0}
                                    onClick={() =>
                                      moveStep(selected.id, step.id, -1)
                                    }
                                  >
                                    Up
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    aria-label={`Move ${step.title} down`}
                                    disabled={index === steps.length - 1}
                                    onClick={() =>
                                      moveStep(selected.id, step.id, 1)
                                    }
                                  >
                                    Down
                                  </button>
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
                                  className="status-badge"
                                  data-kind="process"
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
              <p className="simple-muted">
                Select a production or create a new one.
              </p>
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

function shortName(name: string) {
  return name.replace(/\s+production\s*$/i, '').trim() || name
}

function processGlanceStatus(process: VehicleProcess): ProcessStepStatus {
  const steps = process.steps
  if (steps.some((s) => s.status === 'blocked')) return 'blocked'
  if (steps.some((s) => s.status === 'active')) return 'active'
  if (steps.length > 0 && steps.every((s) => s.status === 'done' || s.status === 'skipped')) {
    return 'done'
  }
  return 'pending'
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

function NewProductionForm({
  vehicles,
  inventory,
  onCreate,
  onCancel,
}: {
  vehicles: HardwareUnit[]
  inventory: HardwareUnit[]
  onCreate: (input: {
    name: string
    vehicleUnitId?: string
    vehicleName?: string
    linkedInventoryIds?: string[]
    linkedHardwareIds?: string[]
  }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [vehicleUnitId, setVehicleUnitId] = useState('')
  const [vehicleName, setVehicleName] = useState('')
  const [linkedInventoryIds, setLinkedInventoryIds] = useState<string[]>([])
  const [linkedHardwareIds, setLinkedHardwareIds] = useState<string[]>([])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate({
      name: name.trim().toLowerCase().endsWith('production')
        ? name.trim()
        : `${name.trim()} production`,
      vehicleUnitId: vehicleUnitId || undefined,
      vehicleName: vehicleName.trim() || name.trim(),
      linkedInventoryIds,
      linkedHardwareIds,
    })
  }

  return (
    <form className="simple-form prod-create" onSubmit={handleSubmit}>
      <h3>New vehicle production</h3>
      <p className="simple-muted">
        Starts blank — add steps after creating. Optionally link hardware and
        materials up front.
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
        Hardware vehicle
        <select
          value={vehicleUnitId}
          onChange={(e) => setVehicleUnitId(e.target.value)}
        >
          <option value="">Create new from name below</option>
          {vehicles.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name} ({HARDWARE_KIND_LABELS[unit.kind]})
            </option>
          ))}
        </select>
      </label>
      {vehicleUnitId ? null : (
        <label>
          New vehicle name
          <input
            value={vehicleName}
            onChange={(e) => setVehicleName(e.target.value)}
            placeholder="Same as production name if blank"
          />
        </label>
      )}
      <InventoryLinkPicker
        units={vehicles}
        selectedIds={linkedHardwareIds}
        onChange={setLinkedHardwareIds}
        includeHardware
        includeInventory={false}
        legend="Hardware in use"
        hint="Optional. Mark subsystems/vehicles used on this production."
      />
      <InventoryLinkPicker
        units={inventory}
        selectedIds={linkedInventoryIds}
        onChange={setLinkedInventoryIds}
        legend="Materials from inventory"
        hint="Optional. Track parts/tools for this production — does not change stock qty."
      />
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
  units,
  onSave,
  onCancel,
  disabled,
}: {
  step: VehicleProcessStep
  units: HardwareUnit[]
  onSave: (patch: {
    title: string
    detail?: string
    linkedUnitIds: string[]
  }) => void
  onCancel: () => void
  disabled?: boolean
}) {
  const [title, setTitle] = useState(step.title)
  const [detail, setDetail] = useState(step.detail ?? '')
  const [linkedUnitIds, setLinkedUnitIds] = useState<string[]>(
    step.linkedUnitIds ?? [],
  )

  return (
    <form
      className="simple-form prod-edit-step"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ title, detail, linkedUnitIds })
      }}
    >
      <label>
        Step title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
          disabled={disabled}
        />
      </label>
      <label>
        Detail
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Optional notes for the team"
          disabled={disabled}
        />
      </label>
      <InventoryLinkPicker
        units={units}
        selectedIds={linkedUnitIds}
        onChange={setLinkedUnitIds}
        includeHardware
        disabled={disabled}
        legend="Linked hardware & inventory"
        hint="Optional per-step links. Does not change stock qty."
      />
      <div className="simple-form-actions">
        <button type="submit" className="btn btn-accent" disabled={disabled}>
          Save
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function AddStepForm({
  onAdd,
  disabled,
}: {
  onAdd: (title: string) => void
  disabled?: boolean
}) {
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
        disabled={disabled}
      />
      <button type="submit" className="btn btn-ghost" disabled={disabled}>
        Add
      </button>
    </form>
  )
}
