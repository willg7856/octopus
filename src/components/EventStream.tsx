import type { EventItem } from '../types'

type EventStreamProps = {
  events: EventItem[]
}

export function EventStream({ events }: EventStreamProps) {
  return (
    <footer className="downlink" aria-label="Octopus event stream">
      <div className="downlink-head">
        <div className="downlink-title-row">
          <h2 className="panel-title">Downlink log</h2>
          <span className="downlink-live">
            <span className="downlink-live-dot" aria-hidden="true" />
            Live
          </span>
        </div>
        <span className="panel-note">Goods Shed · {events.length} events</span>
      </div>

      <div className="downlink-table" role="log" aria-live="polite">
        <div className="downlink-cols" aria-hidden="true">
          <span>Time</span>
          <span>Level</span>
          <span>Source</span>
          <span>Message</span>
        </div>
        <div className="downlink-rows">
          {events.map((event) => (
            <div
              key={event.id}
              className="downlink-row"
              data-level={event.level}
            >
              <span className="downlink-time">{event.time}</span>
              <span className="downlink-level" data-level={event.level}>
                {event.level}
              </span>
              <span className="downlink-source">{event.source}</span>
              <span className="downlink-msg">{event.message}</span>
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}
