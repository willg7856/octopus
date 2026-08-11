import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import { useConfirm } from './ConfirmDialog'
import { SyncBar } from './SyncBar'
import { SyncStatusBanners } from './SyncStatusBanners'
import {
  InventoryLinkPicker,
  linkedInventoryNames,
  materialsQtyMap,
} from './InventoryLinkPicker'
import {
  HARDWARE_KIND_LABELS,
  PROCESS_STEP_STATUS_LABELS,
  formatProcessDate,
  isInventoryKind,
  isProductionDeadlineOverdue,
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

type AttentionFilter = 'all' | 'active' | 'blocked' | 'incomplete'

export function VehicleProcessPage({
  user,
  selectedId: routeSelectedId = null,
  onSelectId,
  onOpenHardware,
  onOpenInventory,
}: {
  user: AuthUser | null
  selectedId?: string | null
  onSelectId?: (id: string | null) => void
  onOpenHardware?: (id: string) => void
  onOpenInventory?: (id: string) => void
}) {
  const store = useLabStore()
  const { lab, sync, saving, conflict, toast, updatedAt, updatedBy, hasLoaded } =
    store
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const selectedId = onSelectId ? routeSelectedId : localSelectedId
  const [creating, setCreating] = useState(false)
  const [editingSteps, setEditingSteps] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [integratingStepId, setIntegratingStepId] = useState<string | null>(
    null,
  )
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AttentionFilter>('all')
  const [mobileMode, setMobileMode] = useState<'list' | 'detail'>(() =>
    routeSelectedId ? 'detail' : 'list',
  )

  useEffect(() => {
    if (routeSelectedId) setMobileMode('detail')
  }, [routeSelectedId])

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

  const attentionCounts = useMemo(() => {
    let active = 0
    let blocked = 0
    let incomplete = 0
    for (const p of processes) {
      const glance = processGlanceStatus(p)
      if (glance === 'active') active += 1
      if (glance === 'blocked') blocked += 1
      if (glance !== 'done') incomplete += 1
    }
    return { active, blocked, incomplete }
  }, [processes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return processes.filter((p) => {
      const glance = processGlanceStatus(p)
      if (filter === 'active' && glance !== 'active') return false
      if (filter === 'blocked' && glance !== 'blocked') return false
      if (filter === 'incomplete' && glance === 'done') return false
      if (!q) return true
      const vehicleName = unitNameById.get(p.vehicleUnitId)
      return [p.name, vehicleName, ...p.steps.map((s) => s.title)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [processes, query, unitNameById, filter])
  const selected =
    processes.find((p) => p.id === selectedId) ??
    (mobileMode === 'detail' || creating ? null : filtered[0] ?? null)
  const selectedVehicle = selected
    ? units.find((u) => u.id === selected.vehicleUnitId)
    : null

  function setSelected(id: string | null) {
    if (onSelectId) onSelectId(id)
    else setLocalSelectedId(id)
  }

  function openDetail(id: string | null, isCreating = false) {
    setCreating(isCreating)
    setSelected(id)
    setEditingStepId(null)
    setIntegratingStepId(null)
    if (!isCreating) setEditingSteps(false)
    setMobileMode('detail')
  }

  function backToList() {
    setCreating(false)
    setEditingSteps(false)
    setEditingStepId(null)
    setIntegratingStepId(null)
    setMobileMode('list')
  }

  function openLinkedUnit(unit: HardwareUnit) {
    if (isSystemKind(unit.kind)) onOpenHardware?.(unit.id)
    else onOpenInventory?.(unit.id)
  }

  function updateStep(
    processId: string,
    stepId: string,
    status: ProcessStepStatus,
    blockedReason?: string,
  ) {
    const now = new Date().toISOString()
    void store.commit((prev) => {
      const process = prev.processes.find((p) => p.id === processId)
      const step = process?.steps.find((s) => s.id === stepId)
      if (!process || !step) return prev
      // Re-clicking the current status should not re-save / flicker.
      if (
        step.status === status &&
        (status !== 'blocked' || blockedReason === undefined)
      ) {
        return prev
      }

      const wasDone = step.status === 'done' || step.status === 'skipped'
      const becomingDone = status === 'done' || status === 'skipped'

      let progress = prev.progress
      if (becomingDone && !wasDone) {
        const linkedHardware = (step.linkedUnitIds ?? [])
          .map((id) => prev.units.find((u) => u.id === id))
          .filter((u): u is NonNullable<typeof u> =>
            Boolean(u && isSystemKind(u.kind)),
          )
        if (linkedHardware.length > 0) {
          const date = now.slice(0, 10)
          const notes = linkedHardware.map((unit) => ({
            id: newId('pg'),
            unitId: unit.id,
            date,
            status: unit.status,
            note: `Integrated on ${process.name} · ${step.title}`,
            author: user?.name,
          }))
          progress = [...notes, ...prev.progress]
        }
      }

      return {
        ...prev,
        progress,
        processes: prev.processes.map((p) => {
          if (p.id !== processId) return p
          return {
            ...p,
            updatedAt: now,
            steps: p.steps.map((s) => {
              if (s.id === stepId) {
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
              }
              // Timeline: only one active step at a time on a production.
              if (
                status === 'active' &&
                s.status === 'active' &&
                s.id !== stepId
              ) {
                return { ...s, status: 'pending' as const }
              }
              return s
            }),
          }
        }),
      }
    }, '')
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

  function setProcessInventoryQty(
    processId: string,
    linkedInventoryQty: Record<string, number>,
  ) {
    const now = new Date().toISOString()
    const ids = Object.keys(linkedInventoryQty)
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) =>
        p.id === processId
          ? {
              ...p,
              linkedInventoryIds: ids.length > 0 ? ids : undefined,
              linkedInventoryQty: ids.length > 0 ? linkedInventoryQty : undefined,
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

  function setProcessDates(
    processId: string,
    patch: {
      startedAt?: string
      deadlineAt?: string
      finishedAt?: string
    },
  ) {
    const now = new Date().toISOString()
    void store.commit((prev) => ({
      ...prev,
      processes: prev.processes.map((p) =>
        p.id === processId
          ? {
              ...p,
              startedAt: patch.startedAt || undefined,
              deadlineAt: patch.deadlineAt || undefined,
              finishedAt: patch.finishedAt || undefined,
              updatedAt: now,
            }
          : p,
      ),
    }), 'Schedule updated')
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

  /** Attach a Hardware subsystem/vehicle to a step (and mark production in use). */
  function integrateHardwareOnStep(
    processId: string,
    stepId: string,
    hardwareId: string,
  ) {
    const now = new Date().toISOString()
    void store.commit((prev) => {
      const process = prev.processes.find((p) => p.id === processId)
      const hardware = prev.units.find((u) => u.id === hardwareId)
      if (!process || !hardware || !isSystemKind(hardware.kind)) return prev

      const vehicle = prev.units.find((u) => u.id === process.vehicleUnitId)
      let nextUnits = prev.units
      // Nest subsystem under the production vehicle when it has no parent yet
      if (
        vehicle?.kind === 'vehicle' &&
        hardware.kind !== 'vehicle' &&
        !hardware.parentVehicleId
      ) {
        nextUnits = prev.units.map((u) =>
          u.id === hardwareId
            ? { ...u, parentVehicleId: vehicle.id, updatedAt: now }
            : u,
        )
      }

      const inUse = new Set(process.linkedHardwareIds ?? [])
      inUse.add(hardwareId)

      return {
        ...prev,
        units: nextUnits,
        processes: prev.processes.map((p) => {
          if (p.id !== processId) return p
          return {
            ...p,
            linkedHardwareIds: [...inUse],
            updatedAt: now,
            steps: p.steps.map((s) => {
              if (s.id !== stepId) return s
              const linked = s.linkedUnitIds ?? []
              if (linked.includes(hardwareId)) return s
              return { ...s, linkedUnitIds: [...linked, hardwareId] }
            }),
          }
        }),
      }
    }, 'Hardware integrated on step')
    setIntegratingStepId(null)
  }

  function removeHardwareFromStep(
    processId: string,
    stepId: string,
    hardwareId: string,
  ) {
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
                  linkedUnitIds: (s.linkedUnitIds ?? []).filter(
                    (id) => id !== hardwareId,
                  ),
                }
              : s,
          ),
        }
      }),
    }), 'Hardware removed from step')
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
    linkedInventoryQty?: Record<string, number>
    linkedHardwareIds?: string[]
    startedAt?: string
    deadlineAt?: string
    finishedAt?: string
  }) {
    const now = new Date().toISOString()
    const wanted = (input.vehicleName || input.name)
      .replace(/\s+production\s*$/i, '')
      .trim()
    const processId = newId('proc')
    const materialQty = input.linkedInventoryQty ?? {}
    const materialIds = Object.keys(materialQty)
    const materials = materialIds.length > 0 ? materialIds : undefined
    const materialQtySaved =
      materialIds.length > 0 ? materialQty : undefined
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
        linkedInventoryQty: materialQtySaved,
        linkedHardwareIds: hardwareInUse,
        startedAt: input.startedAt || undefined,
        deadlineAt: input.deadlineAt || undefined,
        finishedAt: input.finishedAt || undefined,
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
    setSelected(null)
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
  const selectedMaterialQty = selected ? materialsQtyMap(selected) : {}
  const selectedMaterials = selected
    ? linkedInventoryNames(
        Object.keys(selectedMaterialQty),
        units,
        selectedMaterialQty,
      )
    : []
  const selectedHardwareInUse = selected
    ? linkedInventoryNames(selected.linkedHardwareIds, units)
    : []

  const filterChips: { id: AttentionFilter; label: string; count?: number }[] =
    [
      { id: 'all', label: 'All' },
      {
        id: 'active',
        label: 'Active',
        count: attentionCounts.active,
      },
      {
        id: 'blocked',
        label: 'Blocked',
        count: attentionCounts.blocked,
      },
      {
        id: 'incomplete',
        label: 'Incomplete',
        count: attentionCounts.incomplete,
      },
    ]

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
            <div
              className="inv-filter-row"
              role="toolbar"
              aria-label="Production attention filters"
            >
              {filterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="inv-filter-chip"
                  aria-pressed={filter === chip.id}
                  onClick={() => setFilter(chip.id)}
                >
                  {chip.label}
                  {chip.count != null && chip.count > 0 ? (
                    <span className="inv-filter-count">{chip.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
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
                const overdue = isProductionDeadlineOverdue(process)
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
                      data-overdue={overdue ? 'true' : undefined}
                      onClick={() => openDetail(process.id)}
                    >
                      <span>
                        <strong>{shortName(process.name)}</strong>
                        <span className="simple-muted">
                          {vehicleName}
                          {total > 0 ? ` · ${done}/${total} done` : ''}
                          {process.deadlineAt ? (
                            <>
                              {' · '}
                              <span
                                className={
                                  overdue ? 'inv-eta-overdue' : undefined
                                }
                              >
                                {overdue ? 'Overdue ' : 'Due '}
                                {formatProcessDate(process.deadlineAt)}
                              </span>
                            </>
                          ) : process.startedAt ? (
                            ` · started ${formatProcessDate(process.startedAt)}`
                          ) : process.finishedAt ? (
                            ` · finished ${formatProcessDate(process.finishedAt)}`
                          ) : (
                            ''
                          )}
                        </span>
                      </span>
                      <span
                        className="status-badge"
                        data-kind="process"
                        data-status={overdue ? 'blocked' : glance}
                      >
                        {overdue
                          ? 'Overdue'
                          : PROCESS_STEP_STATUS_LABELS[glance]}
                      </span>
                    </button>
                  </li>
                )
              })}
              {filtered.length === 0 ? (
                <li className="simple-muted">
                  {query.trim() || filter !== 'all'
                    ? 'No productions match that filter.'
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
                      {selectedVehicle && onOpenHardware ? (
                        <button
                          type="button"
                          className="hw-parts-name-btn"
                          onClick={() => onOpenHardware(selectedVehicle.id)}
                        >
                          {selectedVehicle.name}
                        </button>
                      ) : (
                        (selectedVehicle?.name ?? 'Vehicle')
                      )}
                      {activeStep ? ` · Active: ${activeStep.title}` : ''}
                      {blockedCount > 0 ? ` · ${blockedCount} blocked` : ''}
                    </p>
                    <ProductionScheduleSummary process={selected} />
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
                    <div className="prod-schedule-fields">
                      <label>
                        Start date
                        <input
                          type="date"
                          value={selected.startedAt ?? ''}
                          onChange={(e) =>
                            setProcessDates(selected.id, {
                              startedAt: e.target.value,
                              deadlineAt: selected.deadlineAt,
                              finishedAt: selected.finishedAt,
                            })
                          }
                        />
                      </label>
                      <label>
                        Deadline
                        <input
                          type="date"
                          value={selected.deadlineAt ?? ''}
                          onChange={(e) =>
                            setProcessDates(selected.id, {
                              startedAt: selected.startedAt,
                              deadlineAt: e.target.value,
                              finishedAt: selected.finishedAt,
                            })
                          }
                        />
                      </label>
                      <label>
                        Finish date
                        <input
                          type="date"
                          value={selected.finishedAt ?? ''}
                          onChange={(e) =>
                            setProcessDates(selected.id, {
                              startedAt: selected.startedAt,
                              deadlineAt: selected.deadlineAt,
                              finishedAt: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
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
                      selectedIds={Object.keys(selectedMaterialQty)}
                      quantities={selectedMaterialQty}
                      onQuantitiesChange={(qty) =>
                        setProcessInventoryQty(selected.id, qty)
                      }
                      legend="Materials from inventory"
                      hint="Search to add parts/tools. Add the same item again to increase qty — does not change stock."
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
                                    {linked.map((u, i) => (
                                      <span key={u.id}>
                                        {i > 0 ? ', ' : ''}
                                        {onOpenHardware || onOpenInventory ? (
                                          <button
                                            type="button"
                                            className="hw-parts-name-btn"
                                            onClick={() => openLinkedUnit(u)}
                                          >
                                            {u.name}
                                          </button>
                                        ) : (
                                          u.name
                                        )}{' '}
                                        ({HARDWARE_KIND_LABELS[u.kind]})
                                      </span>
                                    ))}
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
                                    aria-pressed={integratingStepId === step.id}
                                    disabled={!hasLoaded}
                                    onClick={() =>
                                      setIntegratingStepId((cur) =>
                                        cur === step.id ? null : step.id,
                                      )
                                    }
                                  >
                                    {integratingStepId === step.id
                                      ? 'Cancel integrate'
                                      : 'Integrate'}
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

                            {editingSteps ? (
                              <StepIntegrateHardware
                                step={step}
                                linked={linked}
                                systemUnits={systemUnits}
                                open={integratingStepId === step.id}
                                disabled={!hasLoaded}
                                onOpenHardware={onOpenHardware}
                                onIntegrate={(hardwareId) =>
                                  integrateHardwareOnStep(
                                    selected.id,
                                    step.id,
                                    hardwareId,
                                  )
                                }
                                onRemove={(hardwareId) =>
                                  removeHardwareFromStep(
                                    selected.id,
                                    step.id,
                                    hardwareId,
                                  )
                                }
                              />
                            ) : hardwareLinkedOnly(linked).length > 0 ? (
                              <div className="prod-integrate prod-integrate-view">
                                <ul
                                  className="prod-integrate-list"
                                  aria-label="Integrated hardware"
                                >
                                  {hardwareLinkedOnly(linked).map((unit) => (
                                    <li key={unit.id}>
                                      <span>
                                        {onOpenHardware ? (
                                          <button
                                            type="button"
                                            className="hw-parts-name-btn"
                                            onClick={() =>
                                              onOpenHardware(unit.id)
                                            }
                                          >
                                            {unit.name}
                                          </button>
                                        ) : (
                                          <strong>{unit.name}</strong>
                                        )}
                                        <span className="simple-muted">
                                          {' '}
                                          · {HARDWARE_KIND_LABELS[unit.kind]}
                                        </span>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
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

function hardwareLinkedOnly(linked: HardwareUnit[]) {
  return linked.filter((u) => isSystemKind(u.kind))
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
    linkedInventoryQty?: Record<string, number>
    linkedHardwareIds?: string[]
    startedAt?: string
    deadlineAt?: string
    finishedAt?: string
  }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [vehicleUnitId, setVehicleUnitId] = useState('')
  const [vehicleName, setVehicleName] = useState('')
  const [startedAt, setStartedAt] = useState('')
  const [deadlineAt, setDeadlineAt] = useState('')
  const [finishedAt, setFinishedAt] = useState('')
  const [linkedInventoryQty, setLinkedInventoryQty] = useState<
    Record<string, number>
  >({})
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
      linkedInventoryQty,
      linkedHardwareIds,
      startedAt: startedAt || undefined,
      deadlineAt: deadlineAt || undefined,
      finishedAt: finishedAt || undefined,
    })
  }

  return (
    <form className="simple-form prod-create" onSubmit={handleSubmit}>
      <h3>New vehicle production</h3>
      <p className="simple-muted">
        Starts blank — add steps after creating. Optionally set schedule and
        link hardware/materials up front.
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
      <div className="prod-schedule-fields">
        <label>
          Start date
          <input
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        </label>
        <label>
          Deadline
          <input
            type="date"
            value={deadlineAt}
            onChange={(e) => setDeadlineAt(e.target.value)}
          />
        </label>
        <label>
          Finish date
          <input
            type="date"
            value={finishedAt}
            onChange={(e) => setFinishedAt(e.target.value)}
          />
        </label>
      </div>
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
        selectedIds={Object.keys(linkedInventoryQty)}
        quantities={linkedInventoryQty}
        onQuantitiesChange={setLinkedInventoryQty}
        legend="Materials from inventory"
        hint="Optional. Search to add — add again to increase qty. Does not change stock."
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

function ProductionScheduleSummary({ process }: { process: VehicleProcess }) {
  const overdue = isProductionDeadlineOverdue(process)
  if (!process.startedAt && !process.deadlineAt && !process.finishedAt) {
    return (
      <p className="simple-muted prod-schedule-summary">
        No schedule yet — Edit steps to set start, deadline, or finish.
      </p>
    )
  }
  return (
    <p className="simple-muted prod-schedule-summary">
      {process.startedAt ? (
        <span>Started {formatProcessDate(process.startedAt)}</span>
      ) : null}
      {process.deadlineAt ? (
        <span
          className={overdue ? 'inv-eta-overdue' : undefined}
        >
          {process.startedAt ? ' · ' : ''}
          {overdue ? 'Overdue ' : 'Due '}
          {formatProcessDate(process.deadlineAt)}
        </span>
      ) : null}
      {process.finishedAt ? (
        <span>
          {process.startedAt || process.deadlineAt ? ' · ' : ''}
          Finished {formatProcessDate(process.finishedAt)}
        </span>
      ) : null}
    </p>
  )
}

function StepIntegrateHardware({
  step,
  linked,
  systemUnits,
  open,
  disabled,
  onOpenHardware,
  onIntegrate,
  onRemove,
}: {
  step: VehicleProcessStep
  linked: HardwareUnit[]
  systemUnits: HardwareUnit[]
  open: boolean
  disabled?: boolean
  onOpenHardware?: (id: string) => void
  onIntegrate: (hardwareId: string) => void
  onRemove: (hardwareId: string) => void
}) {
  const [query, setQuery] = useState('')
  const linkedIds = useMemo(
    () => new Set(step.linkedUnitIds ?? []),
    [step.linkedUnitIds],
  )
  const q = query.trim().toLowerCase()
  const suggestions = useMemo(() => {
    if (!q) return [] as HardwareUnit[]
    return systemUnits
      .filter((u) => !linkedIds.has(u.id))
      .filter((u) =>
        [u.name, u.serial, HARDWARE_KIND_LABELS[u.kind], u.program]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8)
  }, [systemUnits, linkedIds, q])

  const hardwareLinked = linked.filter((u) => isSystemKind(u.kind))
  if (!open && hardwareLinked.length === 0) return null

  return (
    <div className="prod-integrate">
      {hardwareLinked.length > 0 ? (
        <ul className="prod-integrate-list" aria-label="Integrated hardware">
          {hardwareLinked.map((unit) => (
            <li key={unit.id}>
              <span>
                {onOpenHardware ? (
                  <button
                    type="button"
                    className="hw-parts-name-btn"
                    onClick={() => onOpenHardware(unit.id)}
                  >
                    {unit.name}
                  </button>
                ) : (
                  <strong>{unit.name}</strong>
                )}
                <span className="simple-muted">
                  {' '}
                  · {HARDWARE_KIND_LABELS[unit.kind]}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={disabled}
                onClick={() => onRemove(unit.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="prod-integrate-picker">
          <input
            className="simple-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subsystems / vehicles…"
            aria-label={`Search hardware to integrate on ${step.title}`}
            autoFocus
            disabled={disabled}
          />
          {q ? (
            <ul className="hw-link-suggest">
              {suggestions.length === 0 ? (
                <li className="simple-muted">
                  No matching hardware — add it under Hardware first.
                </li>
              ) : (
                suggestions.map((unit) => (
                  <li key={unit.id}>
                    <span>
                      <strong>{unit.name}</strong>
                      <span className="simple-muted">
                        {HARDWARE_KIND_LABELS[unit.kind]}
                        {unit.serial ? ` · ${unit.serial}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={disabled}
                      onClick={() => {
                        onIntegrate(unit.id)
                        setQuery('')
                      }}
                    >
                      Integrate
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : (
            <p className="simple-muted hw-link-search-hint">
              Type to find a subsystem, then Integrate — links it to this step
              and marks it in use on the production.
            </p>
          )}
        </div>
      ) : null}
    </div>
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
