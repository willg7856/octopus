import { useEffect, useState } from 'react'
import type { EventItem } from '../types'

const STORAGE_KEY = 'octopus-downlink-open'

type EventStreamProps = {
  events: EventItem[]
}

function readStoredOpen(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === '1') return true
    if (value === '0') return false
  } catch {
    /* ignore */
  }
  return false
}

export function EventStream({ events }: EventStreamProps) {
  const [open, setOpen] = useState(readStoredOpen)
  const latest = events[0]

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  return (
    <footer
      className="downlink"
      data-open={open ? 'true' : 'false'}
      aria-label="Octopus event stream"
    >
      <button
        type="button"
        className="downlink-head"
        aria-expanded={open}
        aria-controls="downlink-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="downlink-title-row">
          <span className="downlink-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <h2 className="panel-title">Downlink log</h2>
          <span className="downlink-live">
            <span className="downlink-live-dot" aria-hidden="true" />
            Live
          </span>
          {!open && latest ? (
            <span className="downlink-preview">
              <span className="downlink-level" data-level={latest.level}>
                {latest.level}
              </span>
              <span className="downlink-preview-msg">{latest.message}</span>
            </span>
          ) : null}
        </div>
        <span className="panel-note">
          {open ? `Goods Shed · ${events.length} events` : `${events.length} · expand`}
        </span>
      </button>

      <div
        id="downlink-panel"
        className="downlink-table"
        role="log"
        aria-live="polite"
        hidden={!open}
      >
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
