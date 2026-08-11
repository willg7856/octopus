import type { AppView } from './components/Header'

const VIEWS: AppView[] = ['inventory', 'hardware', 'vehicles', 'team']

export type AppRoute = {
  view: AppView
  /** Selected record id within the view, when present. */
  id: string | null
}

export function routeFromHash(hash = window.location.hash): AppRoute {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const raw = parts[0]?.toLowerCase() ?? ''
  const id = parts[1] ? decodeURIComponent(parts[1]) : null

  if (raw === 'home' || raw === '') return { view: 'inventory', id: null }
  // Old hub deep links land on inventory
  if (
    raw === 'live' ||
    raw === 'control' ||
    raw === 'cameras' ||
    raw === 'resources' ||
    raw === 'timeline'
  ) {
    return { view: 'inventory', id: null }
  }
  if (raw && VIEWS.includes(raw as AppView)) {
    return { view: raw as AppView, id }
  }
  return { view: 'inventory', id: null }
}

export function viewFromHash(hash = window.location.hash): AppView {
  return routeFromHash(hash).view
}

export function hashForRoute(view: AppView, id?: string | null) {
  if (id) return `#/${view}/${encodeURIComponent(id)}`
  return `#/${view}`
}

export function hashForView(view: AppView) {
  return hashForRoute(view)
}

export function navigateHash(view: AppView, id?: string | null) {
  const next = hashForRoute(view, id)
  if (window.location.hash !== next) {
    window.location.hash = next
  }
}
