import { unitNeedsAttention } from '../hardwareData'
import type { HardwareUnit } from '../types'

/** One-click floor flag for hardware or inventory. */
export function NeedsAttentionButton({
  unit,
  disabled,
  onToggle,
}: {
  unit: HardwareUnit
  disabled?: boolean
  onToggle: (next: boolean) => void
}) {
  const active = unitNeedsAttention(unit)
  return (
    <button
      type="button"
      className="btn btn-ghost attention-toggle"
      aria-pressed={active}
      disabled={disabled}
      onClick={() => onToggle(!active)}
    >
      {active ? 'Clear attention' : 'Needs attention'}
    </button>
  )
}
