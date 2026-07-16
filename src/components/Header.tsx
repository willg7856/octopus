type HeaderProps = {
  clock: string
  linkState: 'nominal' | 'degraded' | 'lost' | 'standby'
  sessionId: string
}

export function Header({ clock, linkState, sessionId }: HeaderProps) {
  const linkLabel =
    linkState === 'nominal'
      ? 'Link live'
      : linkState === 'degraded'
        ? 'Degraded'
        : linkState === 'lost'
          ? 'Link lost'
          : 'Standby'

  return (
    <header className="header">
      <div className="brand-block">
        <p className="brand-kicker">Beyond Stage Zero · Goods Shed</p>
        <h1 className="brand">
          Octopus<em>.</em>
        </h1>
        <p className="brand-sub">
          Pad and vehicle data link into mission control — for static fires and
          launches. Not the flight computer.
        </p>
      </div>
      <div className="header-meta">
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
      </div>
    </header>
  )
}
