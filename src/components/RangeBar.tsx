import type { RangeState } from '../types'

type RangeBarProps = {
  range: RangeState
  onChange: (next: RangeState) => void
  armed: boolean
}

const OPTIONS: { id: RangeState; label: string; hint: string }[] = [
  { id: 'go', label: 'GO', hint: 'Range clear' },
  { id: 'hold', label: 'HOLD', hint: 'Pause ops' },
  { id: 'nogo', label: 'NO-GO', hint: 'Abort / safing' },
]

export function RangeBar({ range, onChange, armed }: RangeBarProps) {
  return (
    <section className="range-bar" aria-label="Range status" data-range={range}>
      <div className="range-copy">
        <p className="range-label">Range</p>
        <p className="range-state" data-range={range}>
          {range === 'go' ? 'GO' : range === 'hold' ? 'HOLD' : 'NO-GO'}
        </p>
        <p className="range-hint">
          {range === 'go'
            ? armed
              ? 'Clear · ignition enable armed'
              : 'Clear · ignition enable safe'
            : range === 'hold'
              ? 'Hold fire · await range call'
              : 'No-go · safing required'}
        </p>
      </div>
      <div className="range-actions" role="group" aria-label="Set range state">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="range-btn"
            data-range={opt.id}
            aria-pressed={range === opt.id}
            title={opt.hint}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  )
}
