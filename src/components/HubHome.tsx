import type { AppView } from './Header'
import type { CameraFeed, Channel, Milestone, Notice, Operation } from '../types'
import {
  CONTACTS,
  MILESTONES,
  NOTICES,
  RESOURCES,
  UPCOMING_EVENTS,
  contactIsReady,
  resourceIsReady,
} from '../hubData'

type HubHomeProps = {
  operation: Operation
  linkLabel: string
  channels: Channel[]
  cameras: CameraFeed[]
  demo: boolean
  onNavigate: (view: AppView) => void
}

const DESTINATIONS: {
  view: AppView
  label: string
  hint: string
  primary?: boolean
}[] = [
  {
    view: 'control',
    label: 'Mission control',
    hint: 'Range, arm, telemetry, ops',
    primary: true,
  },
  {
    view: 'cameras',
    label: 'Cameras',
    hint: 'Pad, Goods Shed, vehicle',
    primary: true,
  },
  {
    view: 'resources',
    label: 'Resources',
    hint: 'Onshape, Drive, calendars',
  },
  { view: 'team', label: 'Team', hint: 'Who to contact' },
  { view: 'timeline', label: 'Timeline', hint: 'Milestones and notes' },
]

export function HubHome({
  operation,
  linkLabel,
  channels,
  cameras,
  demo,
  onNavigate,
}: HubHomeProps) {
  const next =
    MILESTONES.find((m) => m.status === 'active') ??
    MILESTONES.find((m) => m.status === 'upcoming')
  const nextEvent = UPCOMING_EVENTS[0]
  const readyResources = RESOURCES.filter(resourceIsReady).slice(0, 4)
  const pendingResources = RESOURCES.filter((r) => !resourceIsReady(r)).length
  const readyContacts = CONTACTS.filter(contactIsReady)
  const pendingContacts = CONTACTS.length - readyContacts.length

  const camByGroup = {
    pad: summarizeCams(cameras.filter((c) => c.group === 'pad')),
    shed: summarizeCams(cameras.filter((c) => c.group === 'shed')),
    vehicle: summarizeCams(cameras.filter((c) => c.group === 'vehicle')),
  }

  const attention = [
    ...channels
      .filter((c) => c.status === 'degraded' || c.status === 'lost')
      .map((c) => `${c.name}: ${c.status}`),
    ...cameras
      .filter((c) => c.status === 'degraded' || c.status === 'lost')
      .map((c) => `${c.name}: ${c.status}`),
  ].slice(0, 4)

  return (
    <main className="hub-page hub-home" aria-label="Hub home">
      <header className="hub-intro">
        <h2 className="hub-intro-title">Home</h2>
        <p className="hub-intro-copy">
          Team hub — files, people, dates. Open Control for the console.
        </p>
      </header>

      {demo ? (
        <p className="hub-banner" data-level="warn">
          Live data and cameras are demo placeholders until real feeds are
          connected.
        </p>
      ) : null}

      <section className="hub-status" aria-label="Current focus">
        <div className="hub-status-main">
          <p className="hub-kicker">Current focus · {operation.id}</p>
          <p className="hub-status-title">{operation.label}</p>
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
            <dt>Next milestone</dt>
            <dd>{next ? next.date : '—'}</dd>
          </div>
          <div>
            <dt>Next event</dt>
            <dd>{nextEvent?.date ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="hub-section hub-section-split" aria-label="Health">
        <div>
          <header className="hub-section-head">
            <h3>Camera health</h3>
            <button
              type="button"
              className="hub-text-btn"
              onClick={() => onNavigate('cameras')}
            >
              Open cameras
            </button>
          </header>
          <ul className="hub-health-list">
            <li>
              <strong>Pad</strong>
              <span>{camByGroup.pad}</span>
            </li>
            <li>
              <strong>Goods Shed</strong>
              <span>{camByGroup.shed}</span>
            </li>
            <li>
              <strong>Vehicle</strong>
              <span>{camByGroup.vehicle}</span>
            </li>
          </ul>
        </div>
        <div>
          <header className="hub-section-head">
            <h3>Needs attention</h3>
          </header>
          {attention.length > 0 ? (
            <ul className="hub-attention-list">
              {attention.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="hub-empty">
              {demo
                ? 'No live issues — feeds are still demo / standby.'
                : 'Nothing flagged right now.'}
            </p>
          )}
          {(pendingResources > 0 || pendingContacts > 0) && (
            <p className="hub-empty hub-empty-spaced">
              Content gaps: {pendingResources} resource links, {pendingContacts}{' '}
              contacts still need details.
            </p>
          )}
        </div>
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

      <section className="hub-section" aria-label="Notes">
        <header className="hub-section-head">
          <h3>Notes</h3>
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
            <h3>Useful links</h3>
            <button
              type="button"
              className="hub-text-btn"
              onClick={() => onNavigate('resources')}
            >
              All resources
            </button>
          </header>
          {readyResources.length > 0 ? (
            <ul className="hub-link-list">
              {readyResources.map((resource) => (
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
          ) : (
            <p className="hub-empty">
              No external links ready yet — add Onshape / Drive / calendar URLs.
            </p>
          )}
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
              {UPCOMING_EVENTS.map((ev) => (
                <li key={ev.id} className="hub-milestone">
                  <span className="hub-milestone-date">{ev.date}</span>
                  <div>
                    <strong>{ev.title}</strong>
                    <p>{ev.detail}</p>
                  </div>
                </li>
              ))}
              {MILESTONES.filter((m) => m.status !== 'done')
                .slice(0, 2)
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
            {readyContacts.length > 0 ? (
              <ul className="hub-contact-preview">
                {readyContacts.slice(0, 4).map((c) => (
                  <li key={c.id}>
                    <strong>{c.name}</strong>
                    <span>{c.role}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hub-empty">Add names and emails on the Team page data.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function summarizeCams(feeds: CameraFeed[]) {
  if (feeds.length === 0) return 'None'
  const live = feeds.filter((f) => f.status === 'nominal').length
  const degraded = feeds.filter((f) => f.status === 'degraded').length
  const standby = feeds.filter((f) => f.status === 'standby').length
  if (live === 0 && degraded === 0) return `${standby} standby / no stream`
  const parts = []
  if (live) parts.push(`${live} live`)
  if (degraded) parts.push(`${degraded} degraded`)
  if (standby) parts.push(`${standby} standby`)
  return parts.join(' · ')
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
