import type { Channel, Operation } from '../types'

type LinkDetailProps = {
  channel: Channel | null
  operation: Operation
  armed: boolean
  onArm: () => void
  onMarkEvent: () => void
  onClear: () => void
}

export function LinkDetail({
  channel,
  operation,
  armed,
  onArm,
  onMarkEvent,
  onClear,
}: LinkDetailProps) {
  return (
    <aside className="panel" aria-label="Link detail">
      <div className="panel-head">
        <h2 className="panel-title">Selected channel</h2>
        <span className="panel-note">{channel?.id ?? '—'}</span>
      </div>
      <div className="detail-body">
        {channel ? (
          <>
            <div>
              <h3 className="detail-title">{channel.name}</h3>
              <p className="detail-copy">
                {channel.kind === 'pad'
                  ? 'Pad instrument path into the Goods Shed.'
                  : channel.kind === 'vehicle'
                    ? 'Vehicle telemetry path — armed on flight days.'
                    : 'Mission control logging on the shed side.'}
              </p>
            </div>

            <div className="stat-rows">
              <div className="stat-row">
                <span>Status</span>
                <span>{channel.status}</span>
              </div>
              <div className="stat-row">
                <span>Rate</span>
                <span>{channel.rateHz} Hz</span>
              </div>
              <div className="stat-row">
                <span>Latency</span>
                <span>{channel.latencyMs ? `${channel.latencyMs} ms` : '—'}</span>
              </div>
              <div className="stat-row">
                <span>Last packet</span>
                <span>{channel.lastPacket}</span>
              </div>
              <div className="stat-row">
                <span>Operation</span>
                <span>{operation.id}</span>
              </div>
              <div className="stat-row">
                <span>Vehicle</span>
                <span>{operation.vehicle}</span>
              </div>
            </div>
          </>
        ) : (
          <p className="detail-copy">Select a channel to inspect the link.</p>
        )}

        <div className="actions">
          <button type="button" className="btn btn-accent" onClick={onArm}>
            {armed ? 'Disarm ignition enable' : 'Arm ignition enable'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onMarkEvent}>
            Mark timeline event
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Clear shed buffer
          </button>
        </div>
      </div>
    </aside>
  )
}
