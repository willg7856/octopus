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
  const next =
    MILESTONES.find((m) => m.status === 'active') ??
    MILESTONES.find((m) => m.status === 'upcoming')
  const quickResources = RESOURCES.filter((r) =>
    ['cad', 'drive', 'planning', 'web'].includes(r.category),
  ).slice(0, 4)

  return (
    <main className="hub-page hub-home" aria-label="Hub home">
      <section className="hub-landing" aria-label="Octopus">
        <div className="hub-landing-media">
          <img
            src="/hub-hero.jpg"
            alt="Creswick Goods Shed and pad at dusk"
            width={1920}
            height={1080}
          />
        </div>
        <div className="hub-landing-copy">
          <p className="hub-landing-kicker">Beyond Stage Zero</p>
          <h2 className="hub-landing-brand">
            Octopus<em>.</em>
          </h2>
          <p className="hub-landing-lede">
            Live data, cameras, files, and people — the Goods Shed’s central
            hub for everything stage-zero.
          </p>
          <div className="hub-actions">
            <button
              type="button"
              className="hub-btn hub-btn-primary"
              onClick={() => onNavigate('live')}
            >
              Open live data
            </button>
            <button
              type="button"
              className="hub-btn hub-btn-ghost"
              onClick={() => onNavigate('cameras')}
            >
              Cameras
            </button>
            <button
              type="button"
              className="hub-btn hub-btn-ghost"
              onClick={() => onNavigate('resources')}
            >
              Resources
            </button>
          </div>
        </div>
      </section>

      <section className="hub-section hub-section-now" aria-label="Current focus">
        <header className="hub-section-head">
          <h3>Now</h3>
          <p>What the team is pointed at this campaign.</p>
        </header>
        <div className="hub-now">
          <div className="hub-now-main">
            <p className="hub-kicker">{operation.id}</p>
            <p className="hub-now-title">{operation.label}</p>
            <p className="hub-now-meta">
              {operation.vehicle} · {operation.site}
            </p>
            <p className="hub-now-window">{operation.window}</p>
          </div>
          <dl className="hub-now-stats">
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
        </div>
      </section>

      <section className="hub-section" aria-label="Important notices">
        <header className="hub-section-head">
          <h3>Notices</h3>
          <p>Read once, then get to work.</p>
        </header>
        <ul className="hub-notice-list">
          {NOTICES.map((notice) => (
            <NoticeRow key={notice.id} notice={notice} />
          ))}
        </ul>
      </section>

      <section className="hub-section" aria-label="Quick links">
        <header className="hub-section-head">
          <h3>Jump in</h3>
          <p>Shared files and planning — full index under Resources.</p>
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
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="hub-text-btn"
          onClick={() => onNavigate('resources')}
        >
          All resources
        </button>
      </section>

      <section className="hub-section hub-section-split" aria-label="Coming up and team">
        <div>
          <header className="hub-section-head">
            <h3>Coming up</h3>
            <p>Program milestones.</p>
          </header>
          <ul className="hub-milestone-list">
            {MILESTONES.filter((m) => m.status !== 'done')
              .slice(0, 3)
              .map((m) => (
                <MilestoneRow key={m.id} milestone={m} />
              ))}
          </ul>
          <button
            type="button"
            className="hub-text-btn"
            onClick={() => onNavigate('timeline')}
          >
            Full timeline
          </button>
        </div>
        <div>
          <header className="hub-section-head">
            <h3>Team</h3>
            <p>{CONTACTS.length} on the roster.</p>
          </header>
          <ul className="hub-contact-preview">
            {CONTACTS.slice(0, 4).map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                <span>{c.role}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="hub-text-btn"
            onClick={() => onNavigate('team')}
          >
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
