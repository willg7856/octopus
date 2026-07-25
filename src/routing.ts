import type { AppView } from './components/Header'

const VIEWS: AppView[] = [
  'control',
  'cameras',
  'home',
  'resources',
  'team',
  'timeline',
]

export function viewFromHash(hash = window.location.hash): AppView {
  const raw = hash.replace(/^#\/?/, '').split('/')[0]?.toLowerCase()
  // Back-compat: old #/live → control
  if (raw === 'live') return 'control'
  if (raw && VIEWS.includes(raw as AppView)) return raw as AppView
  return 'control'
}

export function hashForView(view: AppView) {
  return view === 'control' ? '#/' : `#/${view}`
}

export function navigateHash(view: AppView) {
  const next = hashForView(view)
  if (window.location.hash !== next) {
    window.location.hash = next
  }
}
