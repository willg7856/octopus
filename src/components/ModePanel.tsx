import type { Channel, OpMode } from '../types'

type ModePanelProps = {
  mode: OpMode
  onModeChange: (mode: OpMode) => void
  channels: Channel[]
  selectedChannelId: string
  onSelectChannel: (id: string) => void
}

const MODES: { id: OpMode; name: string; desc: string; tone: string; tag: string }[] = [
  {
    id: 'static-fire',
    name: 'Static fire',
    desc: 'View pad instruments as they arrive during ground burns.',
    tone: 'ignition',
    tag: 'Primary',
  },
  {
    id: 'launch',
    name: 'Launch day',
    desc: 'View pad path plus vehicle telemetry on flight day.',
    tone: 'cyan',
    tag: 'Flight',
  },
  {
    id: 'idle',
    name: 'Idle / bench',
    desc: 'Bench / integration view when nothing is live.',
    tone: 'ink',
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
    <aside className="panel" aria-label="Live feeds">
      <div className="panel-head">
        <h2 className="panel-title">Feed & channels</h2>
        <span className="panel-note">View</span>
      </div>
      <div className="panel-body">
        <div className="mode-list" role="group" aria-label="Octopus modes">
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
                <span className="chip" data-tone={m.tone}>
                  {m.tag}
                </span>
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
              <span className="chip" data-tone={statusTone(ch.status)}>
                {ch.status}
              </span>
              <span className="channel-meta">
                {ch.kind.toUpperCase()} · {ch.latencyMs || '—'} ms · drop{' '}
                {ch.dropPct.toFixed(1)}% · {ch.recording ? 'REC' : '—'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

function statusTone(status: Channel['status']) {
  if (status === 'nominal') return 'green'
  if (status === 'degraded') return 'amber'
  if (status === 'lost') return 'red'
  return 'ink'
}
