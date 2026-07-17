import type { CameraFeed, Channel, Operation } from '../types'
import { CameraDeck } from './CameraDeck'

type LinkDetailProps = {
  channel: Channel | null
  operation: Operation
  armed: boolean
  clock: string
  cameras: CameraFeed[]
  onArm: () => void
  onMarkEvent: () => void
  onClear: () => void
  onToggleRecording: () => void
  onSelectCameras: () => void
}

export function LinkDetail({
  channel,
  operation,
  armed,
  clock,
  cameras,
  onArm,
  onMarkEvent,
  onClear,
  onToggleRecording,
  onSelectCameras,
}: LinkDetailProps) {
  return (
    <aside className="panel detail-panel" aria-label="Link detail">
      <div className="panel-head">
        <h2 className="panel-title">Pad ops</h2>
        <span className="panel-note">{channel?.id ?? '—'}</span>
      </div>
      <div className="detail-body">
        <CameraDeck
          feeds={cameras}
          clock={clock}
          active={channel?.id === 'pad-video'}
          onSelect={onSelectCameras}
        />

        {channel ? (
          <div className="link-health">
            <div className="link-health-head">
              <h3 className="detail-title">{channel.name}</h3>
              <span className="chip" data-tone={statusTone(channel.status)}>
                {channel.status}
              </span>
            </div>
            <p className="detail-copy">
              {channel.kind === 'pad'
                ? 'Pad instrument path into the Goods Shed.'
                : channel.kind === 'vehicle'
                  ? 'Vehicle telemetry path — armed on flight days.'
                  : 'Mission control logging on the shed side.'}
            </p>

            <div className="stat-rows">
              <div className="stat-row">
                <span>Latency</span>
                <span>{channel.latencyMs ? `${channel.latencyMs} ms` : '—'}</span>
              </div>
              <div className="stat-row">
                <span>Packet age</span>
                <span>
                  {channel.packetAgeMs ? `${channel.packetAgeMs} ms` : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span>Drop rate</span>
                <span>{channel.dropPct.toFixed(1)}%</span>
              </div>
              <div className="stat-row">
                <span>Rate</span>
                <span>{channel.rateHz} Hz</span>
              </div>
              <div className="stat-row">
                <span>Recording</span>
                <span data-rec={channel.recording ? 'on' : 'off'}>
                  {channel.recording ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="stat-row">
                <span>Operation</span>
                <span>{operation.id}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="detail-copy">Select a channel to inspect the link.</p>
        )}

        <div className="actions">
          <button type="button" className="btn btn-accent" onClick={onArm}>
            {armed ? 'Disarm ignition enable' : 'Arm ignition enable'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onToggleRecording}>
            {channel?.recording ? 'Stop shed recording' : 'Start shed recording'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onMarkEvent}>
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

function statusTone(status: Channel['status']) {
  if (status === 'nominal') return 'green'
  if (status === 'degraded') return 'amber'
  if (status === 'lost') return 'red'
  return 'ink'
}
