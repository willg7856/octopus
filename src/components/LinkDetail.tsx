import type { Channel, ChecklistItem, LinkHop, LinkStatus, Operation } from '../types'

type LinkDetailProps = {
  channel: Channel | null
  operation: Operation
  armed: boolean
  rangeGo: boolean
  checklist: ChecklistItem[]
  checks: Record<string, boolean>
  hops: LinkHop[]
  hopStatus: Record<string, LinkStatus>
  canArm: boolean
  recording: boolean
  onToggleCheck: (id: string) => void
  onArm: () => void
  onMarkEvent: () => void
  onClear: () => void
  onToggleRecording: () => void
  onExport: () => void
  onOpenCameras: () => void
}

export function LinkDetail({
  channel,
  operation,
  armed,
  rangeGo,
  checklist,
  checks,
  hops,
  hopStatus,
  canArm,
  recording,
  onToggleCheck,
  onArm,
  onMarkEvent,
  onClear,
  onToggleRecording,
  onExport,
  onOpenCameras,
}: LinkDetailProps) {
  const readyCount = checklist.filter((c) => checks[c.id]).length

  return (
    <aside className="panel detail-panel" aria-label="Mission ops">
      <div className="panel-head">
        <h2 className="panel-title">Mission ops</h2>
        <span className="panel-note">
          {readyCount}/{checklist.length} ready
        </span>
      </div>
      <div className="detail-body">
        <section className="link-path" aria-label="Data link path">
          <h3 className="section-label">Link path</h3>
          <ol className="hop-list">
            {hops.map((hop, i) => (
              <li key={hop.id} className="hop" data-status={hopStatus[hop.id] ?? 'standby'}>
                {i > 0 ? <span className="hop-join" aria-hidden="true" /> : null}
                <div className="hop-card">
                  <strong>{hop.label}</strong>
                  <span>{hop.detail}</span>
                  <em>{(hopStatus[hop.id] ?? 'standby').toUpperCase()}</em>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="checklist" aria-label="Go / no-go checklist">
          <h3 className="section-label">Pre-arm checklist</h3>
          <ul className="check-list">
            {checklist.map((item) => {
              const on = !!checks[item.id]
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="check-item"
                    data-on={on ? 'true' : 'false'}
                    data-auto={item.auto ? 'true' : 'false'}
                    aria-pressed={on}
                    disabled={item.auto}
                    onClick={() => onToggleCheck(item.id)}
                  >
                    <span className="check-box" aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    <span className="check-label">{item.label}</span>
                    {item.auto ? <span className="check-auto">auto</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {channel ? (
          <section className="link-health">
            <div className="link-health-head">
              <h3 className="detail-title">{channel.name}</h3>
              <span className="chip" data-tone={statusTone(channel.status)}>
                {channel.status}
              </span>
            </div>
            <div className="stat-rows">
              <div className="stat-row">
                <span>Latency</span>
                <span>{channel.latencyMs ? `${channel.latencyMs} ms` : '—'}</span>
              </div>
              <div className="stat-row">
                <span>Drop rate</span>
                <span>{channel.dropPct.toFixed(1)}%</span>
              </div>
              <div className="stat-row">
                <span>Packet age</span>
                <span>{channel.packetAgeMs ? `${channel.packetAgeMs} ms` : '—'}</span>
              </div>
              <div className="stat-row">
                <span>Recording</span>
                <span data-rec={recording ? 'on' : 'off'}>
                  {recording ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="stat-row">
                <span>Session</span>
                <span>{operation.id}</span>
              </div>
            </div>
          </section>
        ) : null}

        <div className="actions">
          <button
            type="button"
            className="btn btn-accent"
            onClick={onArm}
            disabled={!armed && !canArm}
            title={
              !armed && !canArm
                ? 'Complete checklist and set range GO to arm'
                : undefined
            }
          >
            {armed ? 'Disarm ignition enable' : 'Arm ignition enable'}
          </button>
          {!canArm && !armed ? (
            <p className="arm-hint">
              {rangeGo
                ? 'Finish checklist before arming.'
                : 'Range must be GO and checklist complete.'}
            </p>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={onToggleRecording}>
            {recording ? 'Stop shed recording' : 'Start shed recording'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenCameras}>
            Open cameras
          </button>
          <button type="button" className="btn btn-ghost" onClick={onMarkEvent}>
            Mark timeline event
          </button>
          <button type="button" className="btn btn-ghost" onClick={onExport}>
            Export session CSV
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Clear shed buffer
          </button>
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
