import type { RangeState } from '../types'

type RangeBarProps = {
  range: RangeState
  armed: boolean
  onChange: (next: RangeState) => void
}

const OPTIONS: { id: RangeState; label: string; hint: string }[] = [
  { id: 'go', label: 'GO', hint: 'Range clear for ops' },
  { id: 'hold', label: 'HOLD', hint: 'Wait — do not proceed' },
  { id: 'nogo', label: 'NO-GO', hint: 'Safe and stand down' },
]

export function RangeBar({ range, armed, onChange }: RangeBarProps) {
  const active = OPTIONS.find((o) => o.id === range) ?? OPTIONS[1]

  return (
    <div className="range-bar" data-range={range} aria-label="Range status">
      <div className="range-copy">
        <p className="range-label">Range</p>
        <p className="range-state" data-range={range}>
          {active.label}
        </p>
        <p className="range-hint">
          {active.hint}
          {armed ? ' · Ignition enable armed' : ' · Ignition enable safe'}
        </p>
      </div>
      <div className="range-actions" role="group" aria-label="Set range">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="range-btn"
            data-range={opt.id}
            aria-pressed={range === opt.id}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
