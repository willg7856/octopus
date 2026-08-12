import {
  isOrderOverdue,
  isProductionDeadlineOverdue,
  processOverallStatus,
  sortProcesses,
  stockStatusOf,
  unitQuantity,
} from '../hardwareData'
import type { HardwareUnit, VehicleProcess } from '../types'

export type FloorGlanceItem = {
  id: string
  kind: 'blocked' | 'overdue' | 'low' | 'order' | 'important'
  label: string
  detail: string
  onOpen: () => void
}

export function buildFloorGlanceItems({
  processes,
  units,
  onOpenProduction,
  onOpenInventory,
  onOpenHardware,
  limit = 8,
}: {
  processes: VehicleProcess[]
  units: HardwareUnit[]
  onOpenProduction: (id: string) => void
  onOpenInventory?: (id: string) => void
  onOpenHardware?: (id: string) => void
  limit?: number
}): FloorGlanceItem[] {
  const items: FloorGlanceItem[] = []

  for (const process of sortProcesses(processes)) {
    if (processOverallStatus(process) === 'blocked') {
      const blocked = process.steps.find((s) => s.status === 'blocked')
      items.push({
        id: `blocked-${process.id}`,
        kind: 'blocked',
        label: process.name,
        detail: blocked?.blockedReason
          ? `Blocked · ${blocked.blockedReason}`
          : blocked
            ? `Blocked · ${blocked.title}`
            : 'Blocked',
        onOpen: () => onOpenProduction(process.id),
      })
    }
    if (isProductionDeadlineOverdue(process)) {
      items.push({
        id: `overdue-${process.id}`,
        kind: 'overdue',
        label: process.name,
        detail: `Deadline ${process.deadlineAt}`,
        onOpen: () => onOpenProduction(process.id),
      })
    }
  }

  for (const unit of units) {
    const stock = stockStatusOf(unit)
    const isInventory =
      unit.kind === 'part' ||
      unit.kind === 'consumable' ||
      unit.kind === 'tool' ||
      unit.kind === 'electronics' ||
      unit.kind === 'other'

    if (
      isInventory &&
      (stock === 'low' || (stock === 'depleted' && unitQuantity(unit) <= 0))
    ) {
      items.push({
        id: `low-${unit.id}`,
        kind: 'low',
        label: unit.name,
        detail:
          stock === 'depleted'
            ? 'Depleted'
            : `Low · ${unitQuantity(unit)} on hand`,
        onOpen: () => onOpenInventory?.(unit.id),
      })
    } else if (isInventory && isOrderOverdue(unit)) {
      items.push({
        id: `order-${unit.id}`,
        kind: 'order',
        label: unit.name,
        detail: `Order overdue · ETA ${unit.expectedAt}`,
        onOpen: () => onOpenInventory?.(unit.id),
      })
    } else if (unit.notesImportant && unit.notes?.trim()) {
      items.push({
        id: `note-${unit.id}`,
        kind: 'important',
        label: unit.name,
        detail: unit.notes.trim().slice(0, 80),
        onOpen: () => {
          if (isInventory) onOpenInventory?.(unit.id)
          else onOpenHardware?.(unit.id)
        },
      })
    }
  }

  const rank: Record<FloorGlanceItem['kind'], number> = {
    blocked: 0,
    overdue: 1,
    low: 2,
    order: 3,
    important: 4,
  }
  return items
    .sort(
      (a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label),
    )
    .slice(0, limit)
}

export function FloorGlance({ items }: { items: FloorGlanceItem[] }) {
  if (items.length === 0) return null

  return (
    <section className="floor-glance" aria-label="Floor attention">
      <div className="floor-glance-head">
        <h3>Needs attention</h3>
        <span className="simple-muted">{items.length} open</span>
      </div>
      <ul className="floor-glance-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="floor-glance-row"
              data-kind={item.kind}
              onClick={item.onOpen}
            >
              <span className="floor-glance-kind">{item.kind}</span>
              <span className="floor-glance-main">
                <strong>{item.label}</strong>
                <span className="simple-muted">{item.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
