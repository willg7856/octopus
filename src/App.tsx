import { useCallback, useEffect, useState } from 'react'
import { applyTheme, getPreferredTheme, type Theme } from './theme'
import {
  fetchSession,
  login as authLogin,
  logout as authLogout,
  type AuthUser,
} from './auth'
import { navigateHash, routeFromHash, type AppRoute } from './routing'
import { Header, type AppView } from './components/Header'
import { InventoryPage } from './components/InventoryPage'
import { HardwarePage } from './components/HardwarePage'
import { VehicleProcessPage } from './components/VehicleProcessPage'
import { TeamPage } from './components/TeamPage'
import { SignIn } from './components/SignIn'
import { LabProvider } from './useLabStore'

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme())
  const [authState, setAuthState] = useState<'loading' | 'signed-out' | 'signed-in'>(
    'loading',
  )
  const [user, setUser] = useState<AuthUser | null>(null)
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash())

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
      setRoute(routeFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (route.view === 'team' && user && !user.canManageAccounts) {
      navigateHash('inventory')
    }
  }, [route.view, user])

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

  const handleAuthRequired = useCallback(() => {
    setUser(null)
    setAuthState('signed-out')
  }, [])

  function handleViewChange(view: AppView) {
    navigateHash(view)
  }

  function handleSelectId(id: string | null) {
    navigateHash(route.view, id)
  }

  function openInventory(id: string) {
    navigateHash('inventory', id)
  }

  function openHardware(id: string) {
    navigateHash('hardware', id)
  }

  function openProduction(id: string) {
    navigateHash('vehicles', id)
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
    <LabProvider onAuthRequired={handleAuthRequired}>
      <div className="app" data-view={route.view}>
        <div className="shell">
          <div className="shell-main">
            <Header
              theme={theme}
              view={route.view}
              user={user}
              onToggleTheme={handleToggleTheme}
              onSignOut={handleSignOut}
              onViewChange={handleViewChange}
            />

            {route.view === 'inventory' ? (
              <InventoryPage
                user={user}
                selectedId={route.id}
                onSelectId={handleSelectId}
                onOpenHardware={openHardware}
              />
            ) : null}
            {route.view === 'hardware' ? (
              <HardwarePage
                user={user}
                selectedId={route.id}
                onSelectId={handleSelectId}
                onOpenInventory={openInventory}
                onOpenProduction={openProduction}
              />
            ) : null}
            {route.view === 'vehicles' ? (
              <VehicleProcessPage
                user={user}
                selectedId={route.id}
                onSelectId={handleSelectId}
                onOpenHardware={openHardware}
                onOpenInventory={openInventory}
              />
            ) : null}
            {route.view === 'team' && user?.canManageAccounts ? (
              <TeamPage user={user} />
            ) : null}
          </div>
        </div>
      </div>
    </LabProvider>
  )
}
