import type { AppView } from './components/Header'

const VIEWS: AppView[] = [
  'home',
  'live',
  'cameras',
  'hardware',
  'resources',
  'team',
  'timeline',
]

export function viewFromHash(hash = window.location.hash): AppView {
  const raw = hash.replace(/^#\/?/, '').split('/')[0]?.toLowerCase()
  // Old mission-control deep link → hub live view
  if (raw === 'control') return 'live'
  if (raw && VIEWS.includes(raw as AppView)) return raw as AppView
  return 'home'
}

export function hashForView(view: AppView) {
  return view === 'home' ? '#/' : `#/${view}`
}

export function navigateHash(view: AppView) {
  const next = hashForView(view)
  if (window.location.hash !== next) {
    window.location.hash = next
  }
}
