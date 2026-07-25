import { MILESTONES, NOTICES, UPCOMING_EVENTS } from '../hubData'
import type { Milestone } from '../types'

export function TimelinePage() {
  return (
    <main className="hub-page hub-page-inner" aria-label="Program timeline">
      <header className="hub-page-head">
        <h2 className="hub-page-title">Timeline</h2>
        <p className="hub-page-lede">
          Near-term events and program milestones. Day-to-day scheduling also
          lives on the team calendar under Resources.
        </p>
      </header>

      <section className="hub-section" aria-label="Upcoming events">
        <header className="hub-section-head">
          <h3>Upcoming</h3>
        </header>
        <ul className="team-list">
          {UPCOMING_EVENTS.map((ev) => (
            <li key={ev.id} className="team-item">
              <div className="team-item-main">
                <strong>{ev.title}</strong>
                <span className="team-item-role">{ev.date}</span>
              </div>
              <p className="team-item-notes">{ev.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="hub-section" aria-label="Standing notices">
        <header className="hub-section-head">
          <h3>Notes</h3>
        </header>
        <ul className="hub-notice-list">
          {NOTICES.map((n) => (
            <li key={n.id} className="hub-notice" data-level={n.level}>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="hub-section" aria-label="Milestones">
        <header className="hub-section-head">
          <h3>Milestones</h3>
        </header>
        <ol className="hub-timeline">
          {MILESTONES.map((m) => (
            <TimelineItem key={m.id} milestone={m} />
          ))}
        </ol>
      </section>
    </main>
  )
}

function TimelineItem({ milestone }: { milestone: Milestone }) {
  return (
    <li className="hub-timeline-item" data-status={milestone.status}>
      <span className="hub-timeline-mark" aria-hidden="true" />
      <div className="hub-timeline-body">
        <div className="hub-timeline-meta">
          <span className="hub-milestone-date">{milestone.date}</span>
          <span className="hub-status-pill" data-status={milestone.status}>
            {milestone.status}
          </span>
        </div>
        <strong>{milestone.title}</strong>
        <p>{milestone.detail}</p>
      </div>
    </li>
  )
}
