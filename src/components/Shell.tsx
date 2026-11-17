import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { fmtAgo } from '../lib/derive'
import { href, useRoute } from '../lib/router'
import { COLLECTIONS, type IconName } from '../lib/schema'
import { useStore } from '../lib/store'
import { Icon } from './Icon'
import { SearchPalette } from './Search'

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-org">Beyond Stage Zero</span>
      <span className="logo-name">Octopus<span className="logo-dot">.</span></span>
    </span>
  )
}

interface NavItem {
  key: string
  label: string
  icon: IconName
}

const GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { key: 'home', label: 'Home', icon: 'home' },
      { key: 'analytics', label: 'Analytics', icon: 'chart' },
      { key: 'site', label: 'BSZ site', icon: 'monitor' },
      { key: 'gallery', label: 'Gallery', icon: 'image' },
      { key: 'space', label: '.space', icon: 'play' },
    ],
  },
  {
    label: 'Make',
    items: COLLECTIONS.filter((c) => c.group === 'work' && !c.hiddenInNav).map((c) => ({ key: c.key, label: c.label, icon: c.icon })),
  },
  {
    label: 'Money',
    items: COLLECTIONS.filter((c) => c.group === 'money' && !c.hiddenInNav).map((c) => ({ key: c.key, label: c.label, icon: c.icon })),
  },
  {
    label: 'Team',
    items: [
      ...COLLECTIONS.filter((c) => c.group === 'team' && !c.hiddenInNav).map((c) => ({ key: c.key, label: c.label, icon: c.icon })),
      { key: 'activity', label: 'Activity', icon: 'clock' },
      { key: 'team', label: 'People & access', icon: 'shield' },
    ],
  },
]

export function Shell({ children }: { children: ReactNode }) {
  const { path } = useRoute()
  const { user } = useStore()
  const current = path[0] ?? 'home'
  const [searchOpen, setSearchOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    setNavOpen(false)
    window.scrollTo(0, 0)
  }, [path.join('/')])

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar">
        <a href={href('home')} className="sidebar-logo"><Logo /></a>
        <button className="search-trigger" onClick={() => setSearchOpen(true)}>
          <Icon name="search" size={15} /> <span>Search</span> <kbd>⌘K</kbd>
        </button>
        <nav aria-label="Main">
          {GROUPS.map((g, i) => (
            <div key={i} className="nav-group">
              {g.label && <p className="nav-label">{g.label}</p>}
              {g.items.map((it) => (
                <a key={it.key} href={href(it.key)} className={`nav-item${current === it.key ? ' active' : ''}`} aria-current={current === it.key ? 'page' : undefined}>
                  <Icon name={it.icon} size={17} />
                  {it.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <SyncDot />
          <div className="me">
            <span className="strong">{user.name}</span>
            <span className="muted small">{user.email}</span>
          </div>
          <div className="row gap-xs">
            <ThemeToggle />
            <button
              className="btn btn-ghost btn-icon btn-sm"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await api.logout().catch(() => {})
                window.location.reload()
              }}
            >
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="nav-scrim" onClick={() => setNavOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon" aria-label="Menu" onClick={() => setNavOpen(true)}>
            <Icon name="menu" />
          </button>
          <a href={href('home')}><Logo /></a>
          <button className="btn btn-ghost btn-icon" aria-label="Search" onClick={() => setSearchOpen(true)}>
            <Icon name="search" />
          </button>
        </header>
        <SyncBanner />
        <main>{children}</main>
      </div>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

function SyncDot() {
  const { status, lastSync, refresh } = useStore()
  const label = {
    loading: 'Loading…',
    live: `Synced ${lastSync ? fmtAgo(lastSync.toISOString()) : ''}`,
    saving: 'Saving…',
    offline: 'Offline',
    error: 'Sync problem',
  }[status]
  const tone = { loading: 'neutral', live: 'good', saving: 'warn', offline: 'bad', error: 'bad' }[status]
  return (
    <button className="sync" onClick={() => refresh(true)} title="Refresh now">
      <span className={`dot bg-${tone}`} /> <span className="small muted">{label}</span>
    </button>
  )
}

function SyncBanner() {
  const { status, error, refresh } = useStore()
  if (status !== 'offline' && status !== 'error') return null
  return (
    <div className="banner" role="alert">
      <Icon name="alert" />
      <span>
        {status === 'offline' ? 'You’re offline. Changes can’t be saved until the connection is back.' : error}
      </span>
      <button className="btn btn-sm" onClick={() => refresh(true)}>Retry</button>
    </div>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')
  return (
    <button
      className="btn btn-ghost btn-icon btn-sm"
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark'
        document.documentElement.dataset.theme = next
        document.documentElement.style.colorScheme = next
        try {
          localStorage.setItem('octopus-theme', next)
        } catch {
          /* ignore */
        }
        setTheme(next)
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        {theme === 'dark' ? (
          <path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  )
}
