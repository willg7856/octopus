import type { Theme } from '../theme'
import type { AuthUser } from '../auth'

export type AppView = 'console' | 'cameras'

type HeaderProps = {
  clock: string
  linkState: 'nominal' | 'degraded' | 'lost' | 'standby'
  sessionId: string
  theme: Theme
  view: AppView
  user: AuthUser | null
  onToggleTheme: () => void
  onSignOut: () => void
  onViewChange: (view: AppView) => void
}

export function Header({
  clock,
  linkState,
  sessionId,
  theme,
  view,
  user,
  onToggleTheme,
  onSignOut,
  onViewChange,
}: HeaderProps) {
  const linkLabel =
    linkState === 'nominal'
      ? 'Link live'
      : linkState === 'degraded'
        ? 'Degraded'
        : linkState === 'lost'
          ? 'Link lost'
          : 'Standby'

  const nextLabel = theme === 'light' ? 'Dark' : 'Light'

  return (
    <header className="header">
      <div className="brand-block">
        <p className="brand-kicker">Beyond Stage Zero · Goods Shed</p>
        <h1 className="brand">
          Octopus<em>.</em>
        </h1>
        <nav className="view-nav" aria-label="Octopus views">
          <button
            type="button"
            className="view-nav-btn"
            aria-pressed={view === 'console'}
            onClick={() => onViewChange('console')}
          >
            Console
          </button>
          <button
            type="button"
            className="view-nav-btn"
            aria-pressed={view === 'cameras'}
            onClick={() => onViewChange('cameras')}
          >
            Cameras
          </button>
        </nav>
      </div>
      <div className="header-meta">
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={`Switch to ${nextLabel.toLowerCase()} mode`}
          title={`Switch to ${nextLabel.toLowerCase()} mode`}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          {nextLabel}
        </button>
        <div className="meta-item">
          <span>Octopus</span>
          <strong className="live-dot" data-state={linkState}>
            {linkLabel}
          </strong>
        </div>
        <div className="meta-item">
          <span>Session</span>
          <strong>{sessionId}</strong>
        </div>
        <div className="meta-item">
          <span>Local</span>
          <strong>{clock}</strong>
        </div>
        {user ? (
          <div className="meta-item meta-user">
            <span>Operator</span>
            <strong title={user.email}>{user.name}</strong>
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
