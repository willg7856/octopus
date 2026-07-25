import type { Channel, OpMode } from '../types'

type ModePanelProps = {
  mode: OpMode
  onModeChange: (mode: OpMode) => void
  channels: Channel[]
  selectedChannelId: string
  onSelectChannel: (id: string) => void
}

const MODES: { id: OpMode; name: string; desc: string; tag: string }[] = [
  {
    id: 'static-fire',
    name: 'Static fire',
    desc: 'Pad instruments into the Goods Shed during ground burns.',
    tag: 'Primary',
  },
  {
    id: 'launch',
    name: 'Launch day',
    desc: 'Pad path plus vehicle telemetry.',
    tag: 'Flight',
  },
  {
    id: 'idle',
    name: 'Idle / bench',
    desc: 'Link up without an active fire.',
    tag: 'Standby',
  },
]

export function ModePanel({
  mode,
  onModeChange,
  channels,
  selectedChannelId,
  onSelectChannel,
}: ModePanelProps) {
  return (
    <aside className="panel" aria-label="Mode and channels">
      <div className="panel-head">
        <h2 className="panel-title">Mode & channels</h2>
        <span className="panel-note">Select</span>
      </div>
      <div className="panel-body">
        <div className="mode-list" role="group" aria-label="Operation mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="mode-btn"
              aria-pressed={mode === m.id}
              onClick={() => onModeChange(m.id)}
            >
              <div className="mode-top">
                <span className="mode-name">{m.name}</span>
                <span className="chip">{m.tag}</span>
              </div>
              <p className="mode-desc">{m.desc}</p>
            </button>
          ))}
        </div>

        <div className="channel-list" role="list" aria-label="Data channels">
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className="channel"
              role="listitem"
              aria-pressed={selectedChannelId === ch.id}
              onClick={() => onSelectChannel(ch.id)}
            >
              <span className="channel-name">{ch.name}</span>
              <span className="live-dot" data-state={ch.status}>
                {ch.status}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
