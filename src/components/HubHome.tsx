import type { AppView } from './Header'
import type { Operation } from '../types'

type HubHomeProps = {
  operation: Operation
  linkLabel: string
  onNavigate: (view: AppView) => void
}

const DESTINATIONS: { view: AppView; label: string }[] = [
  { view: 'inventory', label: 'Inventory' },
  { view: 'vehicles', label: 'Vehicles' },
  { view: 'live', label: 'Live data' },
  { view: 'cameras', label: 'Cameras' },
  { view: 'resources', label: 'Resources' },
  { view: 'team', label: 'Team' },
  { view: 'timeline', label: 'Timeline' },
]

export function HubHome({ operation, linkLabel, onNavigate }: HubHomeProps) {
  return (
    <main className="simple-page simple-home" aria-label="Hub home">
      <header className="simple-head">
        <div>
          <h2>Home</h2>
          <p className="simple-muted">
            {operation.label} · {operation.vehicle} · Link {linkLabel}
          </p>
        </div>
      </header>

      <ul className="simple-nav-list">
        {DESTINATIONS.map((item) => (
          <li key={item.view}>
            <button
              type="button"
              className="simple-nav-row"
              onClick={() => onNavigate(item.view)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </main>
  )
}
