import type { Theme } from '../theme'
import type { AuthUser } from '../auth'

export type AppView = 'inventory' | 'hardware' | 'vehicles' | 'team'

const NAV: { id: AppView; label: string }[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'vehicles', label: 'Production' },
  { id: 'team', label: 'Team' },
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
          onClick={() => onViewChange('inventory')}
          aria-label="Octopus inventory"
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
