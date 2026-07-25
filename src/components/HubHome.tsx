import type { AppView } from './Header'
import type { Milestone, Notice, Operation } from '../types'
import { CONTACTS, MILESTONES, NOTICES, RESOURCES } from '../hubData'

type HubHomeProps = {
  operation: Operation
  linkLabel: string
  cameraCount: number
  onNavigate: (view: AppView) => void
}

export function HubHome({
  operation,
  linkLabel,
  cameraCount,
  onNavigate,
}: HubHomeProps) {
  const next = MILESTONES.find((m) => m.status === 'active') ?? MILESTONES.find((m) => m.status === 'upcoming')
  const quickResources = RESOURCES.filter((r) =>
    ['cad', 'drive', 'planning', 'web'].includes(r.category),
  ).slice(0, 4)

  return (
    <main className="hub-page hub-home" aria-label="Hub home">
      <section className="hub-hero">
        <p className="hub-eyebrow">Beyond Stage Zero · team hub</p>
        <h2 className="hub-title">
          Octopus<em>.</em>
        </h2>
        <p className="hub-lede">
          One place for live pad and vehicle data, camera walls, CAD and Drive
          links, contacts, and the program timeline — not a control console.
        </p>
      </section>

      <section className="hub-section" aria-label="Current focus">
        <header className="hub-section-head">
          <h3>Now</h3>
          <p>What the team is pointed at this campaign.</p>
        </header>
        <div className="hub-now">
          <div className="hub-now-main">
            <p className="hub-kicker">{operation.id}</p>
            <p className="hub-now-title">{operation.label}</p>
            <p className="hub-now-meta">
              {operation.vehicle} · {operation.site} · {operation.window}
            </p>
          </div>
          <dl className="hub-now-stats">
            <div>
              <dt>Link</dt>
              <dd>{linkLabel}</dd>
            </div>
            <div>
              <dt>Cameras</dt>
              <dd>{cameraCount} feeds</dd>
            </div>
            <div>
              <dt>Next</dt>
              <dd>{next ? next.title : '—'}</dd>
            </div>
          </dl>
        </div>
        <div className="hub-actions">
          <button type="button" className="hub-btn hub-btn-primary" onClick={() => onNavigate('live')}>
            Open live data
          </button>
          <button type="button" className="hub-btn" onClick={() => onNavigate('cameras')}>
            Open cameras
          </button>
          <button type="button" className="hub-btn" onClick={() => onNavigate('timeline')}>
            View timeline
          </button>
        </div>
      </section>

      <section className="hub-section" aria-label="Important notices">
        <header className="hub-section-head">
          <h3>Notices</h3>
          <p>Things every teammate should know before digging in.</p>
        </header>
        <ul className="hub-notice-list">
          {NOTICES.map((notice) => (
            <NoticeRow key={notice.id} notice={notice} />
          ))}
        </ul>
      </section>

      <section className="hub-section" aria-label="Quick links">
        <header className="hub-section-head">
          <h3>Quick links</h3>
          <p>Jump to shared files and planning — full list under Resources.</p>
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
                    const view = resource.href.slice(1) as AppView
                    onNavigate(view)
                  }
                }}
              >
                <span className="hub-link-title">{resource.title}</span>
                <span className="hub-link-desc">{resource.description}</span>
                <span className="hub-link-go" aria-hidden="true">
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
        <button type="button" className="hub-text-btn" onClick={() => onNavigate('resources')}>
          All resources
        </button>
      </section>

      <section className="hub-section hub-section-split" aria-label="Coming up and team">
        <div>
          <header className="hub-section-head">
            <h3>Coming up</h3>
            <p>Program milestones — not a full calendar.</p>
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
            <h3>Team</h3>
            <p>{CONTACTS.length} contacts on the roster.</p>
          </header>
          <ul className="hub-contact-preview">
            {CONTACTS.slice(0, 3).map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                <span>{c.role}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="hub-text-btn" onClick={() => onNavigate('team')}>
            Full contact list
          </button>
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
