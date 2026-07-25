import type { AppView } from './Header'
import type { Milestone, Notice, Operation } from '../types'
import { CONTACTS, MILESTONES, NOTICES, RESOURCES } from '../hubData'

type HubHomeProps = {
  operation: Operation
  linkLabel: string
  cameraCount: number
  onNavigate: (view: AppView) => void
}

const SHORTCUTS: { view: AppView; label: string; hint: string }[] = [
  { view: 'live', label: 'Live', hint: 'Telemetry & link health' },
  { view: 'cameras', label: 'Cameras', hint: 'Pad / shed / vehicle' },
  { view: 'resources', label: 'Resources', hint: 'Onshape, Drive, calendars' },
  { view: 'team', label: 'Team', hint: 'Contacts' },
  { view: 'timeline', label: 'Timeline', hint: 'Milestones & notes' },
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
  ).slice(0, 5)

  return (
    <main className="hub-page hub-home" aria-label="Hub home">
      <section className="hub-status" aria-label="Current status">
        <div className="hub-status-main">
          <p className="hub-kicker">{operation.id}</p>
          <h2 className="hub-status-title">{operation.label}</h2>
          <p className="hub-status-meta">
            {operation.vehicle} · {operation.site} · {operation.window}
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

      <section className="hub-section" aria-label="Sections">
        <header className="hub-section-head">
          <h3>Sections</h3>
        </header>
        <div className="hub-shortcuts">
          {SHORTCUTS.map((item) => (
            <button
              key={item.view}
              type="button"
              className="hub-shortcut"
              onClick={() => onNavigate(item.view)}
            >
              <span className="hub-shortcut-label">{item.label}</span>
              <span className="hub-shortcut-hint">{item.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="hub-section" aria-label="Notices">
        <header className="hub-section-head">
          <h3>Notices</h3>
        </header>
        <ul className="hub-notice-list">
          {NOTICES.map((notice) => (
            <NoticeRow key={notice.id} notice={notice} />
          ))}
        </ul>
      </section>

      <section className="hub-section hub-section-split" aria-label="Links and schedule">
        <div>
          <header className="hub-section-head">
            <h3>Links</h3>
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
        <div>
          <header className="hub-section-head">
            <h3>Upcoming</h3>
          </header>
          <ul className="hub-milestone-list">
            {MILESTONES.filter((m) => m.status !== 'done')
              .slice(0, 3)
              .map((m) => (
                <MilestoneRow key={m.id} milestone={m} />
              ))}
          </ul>
          <header className="hub-section-head hub-section-head-spaced">
            <h3>People</h3>
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
