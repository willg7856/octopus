import { unitNeedsAttention } from '../hardwareData'
import type { HardwareUnit } from '../types'

export type FloorGlanceItem = {
  id: string
  kind: 'attention'
  label: string
  detail: string
  onOpen: () => void
}

/** Only units manually flagged with Needs attention. */
export function buildFloorGlanceItems({
  units,
  onOpenInventory,
  onOpenHardware,
  limit = 12,
}: {
  processes?: unknown
  units: HardwareUnit[]
  onOpenProduction?: (id: string) => void
  onOpenInventory?: (id: string) => void
  onOpenHardware?: (id: string) => void
  limit?: number
}): FloorGlanceItem[] {
  const items: FloorGlanceItem[] = []

  for (const unit of units) {
    if (!unitNeedsAttention(unit)) continue
    const isInventory =
      unit.kind === 'part' ||
      unit.kind === 'consumable' ||
      unit.kind === 'tool' ||
      unit.kind === 'electronics' ||
      unit.kind === 'other'

    items.push({
      id: `attention-${unit.id}`,
      kind: 'attention',
      label: unit.name,
      detail: unit.notes?.trim()
        ? unit.notes.trim().slice(0, 80)
        : isInventory
          ? 'Inventory · flagged'
          : 'Hardware · flagged',
      onOpen: () => {
        if (isInventory) onOpenInventory?.(unit.id)
        else onOpenHardware?.(unit.id)
      },
    })
  }

  return items
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, limit)
}

export function FloorGlance({ items }: { items: FloorGlanceItem[] }) {
  if (items.length === 0) return null

  return (
    <section className="floor-glance" aria-label="Needs attention">
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
              <span className="floor-glance-kind">flagged</span>
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
