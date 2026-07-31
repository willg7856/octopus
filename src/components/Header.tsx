import type { Theme } from '../theme'
import type { AuthUser } from '../auth'
import type { LinkStatus } from '../types'

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
  { id: 'live', label: 'Live data' },
  { id: 'cameras', label: 'Cameras' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'resources', label: 'Resources' },
  { id: 'team', label: 'Team' },
  { id: 'timeline', label: 'Timeline' },
]

type HeaderProps = {
  clock: string
  linkState: LinkStatus
  sessionLabel: string
  theme: Theme
  view: AppView
  user: AuthUser | null
  demo: boolean
  onToggleTheme: () => void
  onSignOut: () => void
  onViewChange: (view: AppView) => void
}

export function Header({
  clock,
  linkState,
  sessionLabel,
  theme,
  view,
  user,
  demo,
  onToggleTheme,
  onSignOut,
  onViewChange,
}: HeaderProps) {
  const linkLabel =
    linkState === 'nominal'
      ? 'OK'
      : linkState === 'degraded'
        ? 'Degraded'
        : linkState === 'lost'
          ? 'Lost'
          : 'Standby'

  const nextLabel = theme === 'light' ? 'Dark' : 'Light'

  return (
    <header className="header">
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
          <span className="brand-sub">Beyond Stage Zero · ops hub</span>
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
        {demo ? (
          <div className="meta-item meta-demo">
            <span>Feeds</span>
            <strong>Demo</strong>
          </div>
        ) : null}
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${nextLabel.toLowerCase()} mode`}
          title={`Switch to ${nextLabel.toLowerCase()} mode`}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          <span className="theme-toggle-label">{nextLabel}</span>
        </button>
        <div className="meta-item">
          <span>Link</span>
          <strong className="live-dot" data-state={linkState}>
            {linkLabel}
          </strong>
        </div>
        <div className="meta-item meta-focus">
          <span>Vehicle</span>
          <strong>{sessionLabel}</strong>
        </div>
        <div className="meta-item">
          <span>Local</span>
          <strong>{clock}</strong>
        </div>
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

function MoonIcon() {
  return (
    <svg className="theme-toggle-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.2 1.3a6.5 6.5 0 0 0 8 8.9A6.6 6.6 0 1 1 6.2 1.3Z"
      />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg className="theme-toggle-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" fill="currentColor" />
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1"
      />
    </svg>
  )
}
