import type { EventItem } from '../types'

type EventStreamProps = {
  events: EventItem[]
}

export function EventStream({ events }: EventStreamProps) {
  return (
    <footer className="ticker" aria-label="Octopus event stream">
      <div className="ticker-head">
        <h2 className="panel-title">Downlink log</h2>
        <span className="panel-note">Goods Shed · live</span>
      </div>
      <div className="ticker-list">
        {events.map((event) => (
          <div key={event.id} className="event">
            <span className="event-time">{event.time}</span>
            <span className="event-level" data-level={event.level}>
              {event.level}
            </span>
            <span className="event-source">{event.source}</span>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
    </footer>
  )
}
