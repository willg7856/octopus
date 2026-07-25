import type { AppView } from './Header'
import type { Milestone, Notice, Operation } from '../types'
import { CONTACTS, MILESTONES, NOTICES, RESOURCES } from '../hubData'

type HubHomeProps = {
  operation: Operation
  linkLabel: string
  cameraCount: number
  onNavigate: (view: AppView) => void
}

const DESTINATIONS: {
  view: AppView
  label: string
  hint: string
  primary?: boolean
}[] = [
  {
    view: 'live',
    label: 'Live data',
    hint: 'Pad and vehicle telemetry, link health',
    primary: true,
  },
  {
    view: 'cameras',
    label: 'Cameras',
    hint: 'Pad, Goods Shed, and vehicle feeds',
    primary: true,
  },
  {
    view: 'resources',
    label: 'Resources',
    hint: 'Onshape, Drive, calendars, web links',
  },
  { view: 'team', label: 'Team', hint: 'Who to contact' },
  { view: 'timeline', label: 'Timeline', hint: 'Milestones and standing notes' },
]

export function HubHome({
  operation,
  linkLabel,
  cameraCount,
  onNavigate,
}: HubHomeProps) {
  const next =
    MILESTONES.find((m) => m.status === 'active') ??
    MILESTONES.find((m) => m.status === 'upcoming')
  const quickResources = RESOURCES.filter((r) =>
    ['cad', 'drive', 'planning', 'web'].includes(r.category),
  ).slice(0, 4)

  return (
    <main className="hub-page hub-home" aria-label="Hub home">
      <header className="hub-intro">
        <h2 className="hub-intro-title">Home</h2>
        <p className="hub-intro-copy">
          Watch live feeds, open cameras, and find files, people, and dates.
        </p>
      </header>

      <section className="hub-status" aria-label="Current focus">
        <div className="hub-status-main">
          <p className="hub-kicker">Current focus · {operation.id}</p>
          <p className="hub-status-title">{operation.label}</p>
          <p className="hub-status-meta">
            {operation.vehicle} · {operation.site}
          </p>
        </div>
        <dl className="hub-status-stats">
          <div>
            <dt>Link</dt>
            <dd>{linkLabel}</dd>
          </div>
          <div>
            <dt>Cameras</dt>
            <dd>{cameraCount}</dd>
          </div>
          <div>
            <dt>Next</dt>
            <dd>{next ? next.date : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="hub-section" aria-label="Go to">
        <header className="hub-section-head">
          <h3>Go to</h3>
        </header>
        <div className="hub-destinations">
          {DESTINATIONS.map((item) => (
            <button
              key={item.view}
              type="button"
              className="hub-destination"
              data-primary={item.primary ? 'true' : 'false'}
              onClick={() => onNavigate(item.view)}
            >
              <span className="hub-destination-label">{item.label}</span>
              <span className="hub-destination-hint">{item.hint}</span>
              <span className="hub-destination-go" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      </section>

      {NOTICES.length > 0 ? (
        <section className="hub-section" aria-label="Notices">
          <header className="hub-section-head">
            <h3>Notes</h3>
          </header>
          <ul className="hub-notice-list">
            {NOTICES.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="hub-section hub-section-split" aria-label="Links and schedule">
        <div>
          <header className="hub-section-head">
            <h3>Useful links</h3>
            <button
              type="button"
              className="hub-text-btn"
              onClick={() => onNavigate('resources')}
            >
              All resources
            </button>
          </header>
          <ul className="hub-link-list">
            {quickResources.map((resource) => (
              <li key={resource.id}>
                <a
                  className="hub-link-row"
                  href={resource.href}
                  target={resource.external ? '_blank' : undefined}
                  rel={resource.external ? 'noreferrer' : undefined}
                  onClick={(e) => {
                    if (resource.href.startsWith('#')) {
                      e.preventDefault()
                      onNavigate(resource.href.slice(1) as AppView)
                    }
                  }}
                >
                  <span className="hub-link-title">{resource.title}</span>
                  <span className="hub-link-desc">{resource.description}</span>
                  <span className="hub-link-go" aria-hidden="true">
                    {resource.external ? '↗' : '→'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="hub-side-stack">
          <div>
            <header className="hub-section-head">
              <h3>Upcoming</h3>
              <button
                type="button"
                className="hub-text-btn"
                onClick={() => onNavigate('timeline')}
              >
                Timeline
              </button>
            </header>
            <ul className="hub-milestone-list">
              {MILESTONES.filter((m) => m.status !== 'done')
                .slice(0, 3)
                .map((m) => (
                  <MilestoneRow key={m.id} milestone={m} />
                ))}
            </ul>
          </div>
          <div>
            <header className="hub-section-head">
              <h3>People</h3>
              <button
                type="button"
                className="hub-text-btn"
                onClick={() => onNavigate('team')}
              >
                Team
              </button>
            </header>
            <ul className="hub-contact-preview">
              {CONTACTS.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong>
                  <span>{c.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  )
}

function NoticeRow({ notice }: { notice: Notice }) {
  return (
    <li className="hub-notice" data-level={notice.level}>
      <strong>{notice.title}</strong>
      <p>{notice.body}</p>
    </li>
  )
}

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  return (
    <li className="hub-milestone" data-status={milestone.status}>
      <span className="hub-milestone-date">{milestone.date}</span>
      <div>
        <strong>{milestone.title}</strong>
        <p>{milestone.detail}</p>
      </div>
    </li>
  )
}
