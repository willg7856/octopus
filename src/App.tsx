import { useEffect, useState } from 'react'
import { applyTheme, getPreferredTheme, type Theme } from './theme'
import {
  fetchSession,
  login as authLogin,
  logout as authLogout,
  type AuthUser,
} from './auth'
import { navigateHash, viewFromHash } from './routing'
import { Header, type AppView } from './components/Header'
import { InventoryPage } from './components/InventoryPage'
import { HardwarePage } from './components/HardwarePage'
import { VehicleProcessPage } from './components/VehicleProcessPage'
import { TeamPage } from './components/TeamPage'
import { SignIn } from './components/SignIn'

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme())
  const [authState, setAuthState] = useState<'loading' | 'signed-out' | 'signed-in'>(
    'loading',
  )
  const [user, setUser] = useState<AuthUser | null>(null)
  const [view, setView] = useState<AppView>(() => viewFromHash())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    fetchSession().then((session) => {
      if (cancelled) return
      if (session) {
        setUser(session)
        setAuthState('signed-in')
      } else {
        setAuthState('signed-out')
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onHash() {
      setView(viewFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    navigateHash(view)
  }, [view])

  useEffect(() => {
    if (view === 'team' && user && !user.canManageAccounts) {
      setView('inventory')
    }
  }, [view, user])

  function handleToggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  function handleSignedIn(next: AuthUser) {
    setUser(next)
    setAuthState('signed-in')
  }

  async function handleSignOut() {
    await authLogout()
    setUser(null)
    setAuthState('signed-out')
  }

  if (authState === 'loading') {
    return (
      <div className="app">
        <div className="auth-screen auth-loading">
          <p className="brand-kicker">Beyond Stage Zero</p>
          <h1 className="brand auth-brand">
            Octopus<em>.</em>
          </h1>
          <p className="auth-copy">Checking session…</p>
        </div>
      </div>
    )
  }

  if (authState === 'signed-out') {
    return (
      <div className="app">
        <SignIn
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onSignedIn={handleSignedIn}
          login={authLogin}
        />
      </div>
    )
  }

  return (
    <div className="app" data-view={view}>
      <div className="shell">
        <div className="shell-main">
          <Header
            theme={theme}
            view={view}
            user={user}
            onToggleTheme={handleToggleTheme}
            onSignOut={handleSignOut}
            onViewChange={setView}
          />

          {view === 'inventory' ? <InventoryPage user={user} /> : null}
          {view === 'hardware' ? <HardwarePage user={user} /> : null}
          {view === 'vehicles' ? <VehicleProcessPage user={user} /> : null}
          {view === 'team' && user?.canManageAccounts ? (
            <TeamPage user={user} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
