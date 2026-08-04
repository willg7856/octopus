import type { AppView } from './components/Header'

const VIEWS: AppView[] = ['inventory', 'hardware', 'vehicles', 'team']

export function viewFromHash(hash = window.location.hash): AppView {
  const raw = hash.replace(/^#\/?/, '').split('/')[0]?.toLowerCase()
  if (raw === 'home' || raw === '' || !raw) return 'inventory'
  // Old hub deep links land on inventory
  if (
    raw === 'live' ||
    raw === 'control' ||
    raw === 'cameras' ||
    raw === 'resources' ||
    raw === 'timeline'
  ) {
    return 'inventory'
  }
  if (raw && VIEWS.includes(raw as AppView)) return raw as AppView
  return 'inventory'
}

export function hashForView(view: AppView) {
  return `#/${view}`
}

export function navigateHash(view: AppView) {
  const next = hashForView(view)
  if (window.location.hash !== next) {
    window.location.hash = next
  }
}
