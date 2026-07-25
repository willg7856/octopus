import type {
  Channel,
  ChecklistItem,
  LinkHop,
  LinkStatus,
  Operation,
} from '../types'

type MissionOpsProps = {
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
  demo: boolean
  onToggleCheck: (id: string) => void
  onArm: () => void
  onMarkEvent: () => void
  onClear: () => void
  onToggleRecording: () => void
  onExport: () => void
  onOpenCameras: () => void
}

export function MissionOps({
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
  demo,
  onToggleCheck,
  onArm,
  onMarkEvent,
  onClear,
  onToggleRecording,
  onExport,
  onOpenCameras,
}: MissionOpsProps) {
  return (
    <aside className="panel mission-ops" aria-label="Mission ops">
      <div className="panel-head">
        <h2 className="panel-title">Mission ops</h2>
        <span className="panel-note">{operation.id}</span>
      </div>

      <div className="mission-ops-body">
        {demo ? (
          <p className="hub-banner" data-level="warn">
            Demo console — controls are local UI only until hardware is wired.
          </p>
        ) : null}

        <section className="ops-block">
          <h3 className="ops-block-title">Link path</h3>
          <ol className="link-hops">
            {hops.map((hop, i) => (
              <li key={hop.id} className="link-hop">
                <span className="live-dot" data-state={hopStatus[hop.id] ?? 'standby'}>
                  {hop.label}
                </span>
                <span className="link-hop-detail">{hop.detail}</span>
                {i < hops.length - 1 ? (
                  <span className="link-hop-arrow" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="ops-block">
          <h3 className="ops-block-title">Pre-arm checklist</h3>
          <ul className="checklist">
            {checklist.map((item) => {
              const on = !!checks[item.id]
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="checklist-item"
                    data-on={on ? 'true' : 'false'}
                    data-auto={item.auto ? 'true' : 'false'}
                    disabled={item.auto}
                    aria-pressed={on}
                    onClick={() => onToggleCheck(item.id)}
                  >
                    <span className="checklist-box" aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    <span>{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {channel ? (
          <section className="ops-block">
            <h3 className="ops-block-title">Selected channel</h3>
            <p className="ops-channel-name">{channel.name}</p>
            <dl className="ops-channel-dl">
              <div>
                <dt>Status</dt>
                <dd className="live-dot" data-state={channel.status}>
                  {channel.status}
                </dd>
              </div>
              <div>
                <dt>Rate</dt>
                <dd>{channel.rateHz} Hz</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>{channel.latencyMs ? `${channel.latencyMs} ms` : '—'}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="ops-block ops-actions">
          <button
            type="button"
            className="hub-btn hub-btn-primary"
            data-armed={armed ? 'true' : 'false'}
            disabled={!armed && !canArm}
            onClick={onArm}
            title={
              !armed && !canArm
                ? 'Complete checklist and set range GO to arm'
                : undefined
            }
          >
            {armed ? 'Disarm ignition enable' : 'Arm ignition enable'}
          </button>
          <p className="ops-arm-hint">
            {rangeGo
              ? canArm || armed
                ? 'Ignition enable only — not the flight computer.'
                : 'Checklist incomplete.'
              : 'Range must be GO before arming.'}
          </p>
          <button type="button" className="hub-btn" onClick={onToggleRecording}>
            {recording ? 'Stop shed recording' : 'Start shed recording'}
          </button>
          <button type="button" className="hub-btn" onClick={onOpenCameras}>
            Open cameras
          </button>
          <button type="button" className="hub-btn" onClick={onMarkEvent}>
            Mark timeline event
          </button>
          <button type="button" className="hub-btn" onClick={onExport}>
            Export session CSV
          </button>
          <button type="button" className="hub-btn" onClick={onClear}>
            Clear shed buffer
          </button>
        </section>
      </div>
    </aside>
  )
}
