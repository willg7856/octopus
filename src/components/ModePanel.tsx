import type { Channel, OpMode } from '../types'

type ModePanelProps = {
  mode: OpMode
  onModeChange: (mode: OpMode) => void
  channels: Channel[]
  selectedChannelId: string
  onSelectChannel: (id: string) => void
}

const VIEWS: { id: OpMode; name: string; desc: string }[] = [
  {
    id: 'static-fire',
    name: 'Static fire',
    desc: 'Pad instruments during ground burns.',
  },
  {
    id: 'launch',
    name: 'Launch day',
    desc: 'Pad path plus vehicle telemetry.',
  },
  {
    id: 'idle',
    name: 'Idle',
    desc: 'Bench / no active burn.',
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
    <aside className="panel" aria-label="Data views">
      <div className="panel-head">
        <h2 className="panel-title">Data view</h2>
        <span className="panel-note">Filter</span>
      </div>
      <div className="panel-body">
        <div className="mode-list" role="group" aria-label="Telemetry view">
          {VIEWS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="mode-btn"
              aria-pressed={mode === m.id}
              onClick={() => onModeChange(m.id)}
            >
              <div className="mode-top">
                <span className="mode-name">{m.name}</span>
              </div>
              <p className="mode-desc">{m.desc}</p>
            </button>
          ))}
        </div>

        <div className="channel-list" role="list" aria-label="Channels">
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
