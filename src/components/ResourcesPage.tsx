import type { AppView } from './Header'
import type { ResourceCategory, ResourceLink } from '../types'
import { RESOURCE_CATEGORY_LABELS, RESOURCES } from '../hubData'

const ORDER: ResourceCategory[] = ['cad', 'drive', 'planning', 'web', 'ops']

type ResourcesPageProps = {
  onNavigate: (view: AppView) => void
}

export function ResourcesPage({ onNavigate }: ResourcesPageProps) {
  return (
    <main className="hub-page" aria-label="Resources">
      <header className="hub-page-head">
        <p className="hub-eyebrow">Shared sources of truth</p>
        <h2 className="hub-page-title">Resources</h2>
        <p className="hub-page-lede">
          Onshape, Drive, calendars, and ops views in one list. Update URLs in{' '}
          <code>hubData.ts</code> when folders move.
        </p>
      </header>

      {ORDER.map((category) => {
        const items = RESOURCES.filter((r) => r.category === category)
        if (items.length === 0) return null
        return (
          <section key={category} className="hub-section" aria-label={RESOURCE_CATEGORY_LABELS[category]}>
            <header className="hub-section-head">
              <h3>{RESOURCE_CATEGORY_LABELS[category]}</h3>
            </header>
            <ul className="hub-link-list">
              {items.map((resource) => (
                <li key={resource.id}>
                  <ResourceRow resource={resource} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}

function ResourceRow({
  resource,
  onNavigate,
}: {
  resource: ResourceLink
  onNavigate: (view: AppView) => void
}) {
  const isInternal = resource.href.startsWith('#')
  return (
    <a
      className="hub-link-row"
      href={resource.href}
      target={resource.external ? '_blank' : undefined}
      rel={resource.external ? 'noreferrer' : undefined}
      onClick={(e) => {
        if (!isInternal) return
        e.preventDefault()
        onNavigate(resource.href.slice(1) as AppView)
      }}
    >
      <span className="hub-link-title">{resource.title}</span>
      <span className="hub-link-desc">{resource.description}</span>
      <span className="hub-link-go" aria-hidden="true">
        {resource.external ? '↗' : '→'}
      </span>
    </a>
  )
}
