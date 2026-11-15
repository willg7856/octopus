import { useEffect, useState } from 'react'
import { DialogProvider } from './components/Dialog'
import { EditorProvider } from './components/Editor'
import { RecordDetail } from './components/RecordDetail'
import { Shell } from './components/Shell'
import { SignIn } from './components/SignIn'
import { Empty, ToastProvider } from './components/ui'
import { api, type ApiError } from './lib/api'
import { href, useRoute } from './lib/router'
import { byKey } from './lib/schema'
import { StoreProvider } from './lib/store'
import type { User } from './lib/types'
import { ActivityPage, TeamPage } from './pages/admin'
import { PublicStatsPage } from './pages/publicStats'
import { CountdownsPage } from './pages/countdowns'
import { Home } from './pages/home'
import { InventoryList, ItemDetail, LogList } from './pages/inventory'
import { BudgetDetail, BudgetPage, OrderDetail, OrdersList } from './pages/money'
import {
  ContactDetail,
  ContactsList,
  DesktopsList,
  LinksList,
  ProcessDetail,
  ProcessesList,
  TemplatesList,
} from './pages/resources'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    api.me().then(
      (r) => setUser(r.user),
      (e: ApiError) => {
        if (e.status !== 401) setNotice(e.message)
        setUser(null)
      },
    )
  }, [])

  if (user === undefined) return <div className="boot" aria-busy="true" />
  if (!user) return <SignIn onSignedIn={setUser} notice={notice} />

  return (
    <ToastProvider>
      <DialogProvider>
        <StoreProvider user={user}>
          <EditorProvider>
            <Shell>
              <Routes />
            </Shell>
          </EditorProvider>
        </StoreProvider>
      </DialogProvider>
    </ToastProvider>
  )
}

function Routes() {
  const { path } = useRoute()
  const [section = 'home', id] = path

  useEffect(() => {
    const label = section === 'home' ? '' : byKey.get(section)?.label ?? section[0]!.toUpperCase() + section.slice(1)
    document.title = label ? `${label} · Octopus` : 'Octopus'
  }, [section])

  switch (section) {
    case 'home':
      return <Home />
    case 'inventory':
      return id ? <ItemDetail id={id} /> : <InventoryList />
    case 'log':
      return <LogList />
    case 'orders':
      return id ? <OrderDetail id={id} /> : <OrdersList />
    case 'budget':
      return id ? <BudgetDetail id={id} /> : <BudgetPage />
    case 'processes':
      return id ? <ProcessDetail id={id} /> : <ProcessesList />
    case 'desktops':
      return <DesktopsList />
    case 'contacts':
      return id ? <ContactDetail id={id} /> : <ContactsList />
    case 'templates':
      return id ? <RecordDetail c={byKey.get('templates')!} id={id} /> : <TemplatesList />
    case 'links':
      return <LinksList />
    case 'countdowns':
      return <CountdownsPage />
    case 'public-stats':
      return <PublicStatsPage />
    case 'activity':
      return <ActivityPage />
    case 'team':
      return <TeamPage />
    default:
      return (
        <div className="page">
          <Empty title="Page not found">
            <a href={href('home')}>Go home</a>
          </Empty>
        </div>
      )
  }
}
