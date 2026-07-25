import type { AppView } from './Header'
import type { ResourceCategory, ResourceLink } from '../types'
import {
  RESOURCE_CATEGORY_LABELS,
  RESOURCES,
  resourceIsReady,
} from '../hubData'

const ORDER: ResourceCategory[] = ['cad', 'drive', 'planning', 'ops', 'web']

type ResourcesPageProps = {
  onNavigate: (view: AppView) => void
}

export function ResourcesPage({ onNavigate }: ResourcesPageProps) {
  const missing = RESOURCES.filter((r) => !resourceIsReady(r)).length

  return (
    <main className="hub-page hub-page-inner resources-page" aria-label="Resources">
      <header className="hub-page-head">
        <h2 className="hub-page-title">Resources</h2>
        <p className="hub-page-lede">
          Shared files and planning links for the team.
        </p>
      </header>

      {missing > 0 ? (
        <p className="hub-banner" data-level="warn">
          {missing} links still need real URLs.
        </p>
      ) : null}

      <div className="resources-groups">
        {ORDER.map((category) => {
          const items = RESOURCES.filter((r) => r.category === category)
          if (items.length === 0) return null
          return (
            <section
              key={category}
              className="resources-group"
              aria-label={RESOURCE_CATEGORY_LABELS[category]}
            >
              <h3 className="resources-group-title">
                {RESOURCE_CATEGORY_LABELS[category]}
              </h3>
              <ul className="resources-list">
                {items.map((resource) => (
                  <li key={resource.id}>
                    <ResourceRow resource={resource} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
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
  const ready = resourceIsReady(resource)
  const isInternal = resource.href.startsWith('#')

  if (!ready) {
    return (
      <div className="resources-item resources-item-missing">
        <span className="resources-item-copy">
          <span className="resources-item-title">{resource.title}</span>
          <span className="resources-item-desc">{resource.description}</span>
        </span>
        <span className="resources-item-go">Needs link</span>
      </div>
    )
  }

  return (
    <a
      className="resources-item"
      href={resource.href}
      target={resource.external ? '_blank' : undefined}
      rel={resource.external ? 'noreferrer' : undefined}
      onClick={(e) => {
        if (!isInternal) return
        e.preventDefault()
        onNavigate(resource.href.slice(1) as AppView)
      }}
    >
      <span className="resources-item-copy">
        <span className="resources-item-title">{resource.title}</span>
        <span className="resources-item-desc">{resource.description}</span>
      </span>
      <span className="resources-item-go" aria-hidden="true">
        {resource.external ? 'Open ↗' : 'Open →'}
      </span>
    </a>
  )
}
