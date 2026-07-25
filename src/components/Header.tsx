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
      ? 'LINK OK'
      : linkState === 'degraded'
        ? 'DEGRADED'
        : linkState === 'lost'
          ? 'LINK LOST'
          : 'STANDBY'

  const nextLabel = theme === 'light' ? 'Night' : 'Day'

  return (
    <header className="header">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="brand-copy">
          <p className="brand-kicker">Beyond Stage Zero</p>
          <h1 className="brand">
            OCTOPUS <em>RANGE</em>
          </h1>
        </div>
        <nav className="view-nav" aria-label="Octopus views">
          <button
            type="button"
            className="view-nav-btn"
            aria-pressed={view === 'console'}
            onClick={() => onViewChange('console')}
          >
            Board
          </button>
          <button
            type="button"
            className="view-nav-btn"
            aria-pressed={view === 'cameras'}
            onClick={() => onViewChange('cameras')}
          >
            Cams
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
          {nextLabel}
        </button>
        <div className="meta-item">
          <span>Path</span>
          <strong className="live-dot" data-state={linkState}>
            {linkLabel}
          </strong>
        </div>
        <div className="meta-item">
          <span>Run</span>
          <strong>{sessionId}</strong>
        </div>
        <div className="meta-item">
          <span>Clock</span>
          <strong>{clock}</strong>
        </div>
        {user ? (
          <div className="meta-item meta-user">
            <span>Crew</span>
            <strong title={user.email}>{user.name}</strong>
            <button type="button" className="sign-out" onClick={onSignOut}>
              Out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
