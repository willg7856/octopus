import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { routeFromHash } from '../routing'

function pathFromHash(hash = window.location.hash) {
  const { view, id } = routeFromHash(hash)
  return id ? `/${view}/${encodeURIComponent(id)}` : `/${view}`
}

function routePatternFromPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length >= 2) return '/:view/:id'
  return '/:view'
}

/** Web Analytics + Speed Insights, keyed to hash routes (`#/inventory`, etc.). */
export function VercelInsights() {
  const [path, setPath] = useState(() => pathFromHash())

  useEffect(() => {
    function onHash() {
      setPath(pathFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const route = routePatternFromPath(path)

  return (
    <>
      <Analytics framework="vite" route={route} path={path} />
      <SpeedInsights framework="vite" route={route} />
    </>
  )
}
