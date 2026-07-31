import type { Theme } from '../theme'
import type { AuthUser } from '../auth'

export type AppView =
  | 'home'
  | 'live'
  | 'cameras'
  | 'inventory'
  | 'vehicles'
  | 'resources'
  | 'team'
  | 'timeline'

const NAV: { id: AppView; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'live', label: 'Live' },
  { id: 'cameras', label: 'Cameras' },
  { id: 'resources', label: 'Resources' },
  { id: 'team', label: 'Team' },
  { id: 'timeline', label: 'Timeline' },
]

type HeaderProps = {
  theme: Theme
  view: AppView
  user: AuthUser | null
  onToggleTheme: () => void
  onSignOut: () => void
  onViewChange: (view: AppView) => void
}

export function Header({
  theme,
  view,
  user,
  onToggleTheme,
  onSignOut,
  onViewChange,
}: HeaderProps) {
  const nextLabel = theme === 'light' ? 'Dark' : 'Light'

  return (
    <header className="header header-simple">
      <div className="brand-block">
        <button
          type="button"
          className="brand-mark"
          onClick={() => onViewChange('home')}
          aria-label="Octopus home"
        >
          <span className="brand">
            Octopus<em>.</em>
          </span>
        </button>
        <nav className="view-nav" aria-label="Sections">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className="view-nav-btn"
              aria-pressed={view === item.id}
              onClick={() => onViewChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="header-meta">
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${nextLabel.toLowerCase()} mode`}
        >
          {nextLabel}
        </button>
        {user ? (
          <div className="meta-item meta-user">
            <span>{user.name}</span>
            <button type="button" className="sign-out" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
