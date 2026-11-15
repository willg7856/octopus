import { useEffect, useState } from 'react'

/** Hash routes: #/inventory, #/inventory/<id>, #/orders?status=open */
export interface Route {
  path: string[]
  params: URLSearchParams
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [p = '', qs = ''] = raw.split('?')
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function href(...parts: (string | undefined)[]): string {
  return `#/${parts.filter(Boolean).map((p) => encodeURIComponent(p!)).join('/')}`
}

export function navigate(to: string) {
  window.location.hash = to.startsWith('#') ? to : `#${to}`
}

/** Replaces one query param without adding a history entry. */
export function setParam(key: string, value: string | null) {
  const { path, params } = parse()
  if (value == null || value === '') params.delete(key)
  else params.set(key, value)
  const qs = params.toString()
  window.history.replaceState(null, '', `#/${path.join('/')}${qs ? `?${qs}` : ''}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
