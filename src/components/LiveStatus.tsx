import type { Channel, LinkStatus, OpMode } from '../types'

type LiveStatusProps = {
  mode: OpMode
  channels: Channel[]
  selectedChannelId: string
  demo: boolean
  onSelectChannel: (id: string) => void
  onOpenCameras: () => void
  onExport: () => void
}

export function LiveStatus({
  mode,
  channels,
  selectedChannelId,
  demo,
  onSelectChannel,
  onOpenCameras,
  onExport,
}: LiveStatusProps) {
  const visible =
    mode === 'launch'
      ? channels
      : mode === 'static-fire'
        ? channels.filter((c) => c.kind !== 'vehicle')
        : channels

  const selected = channels.find((c) => c.id === selectedChannelId) ?? visible[0]

  return (
    <aside className="panel live-status" aria-label="Link status">
      <div className="panel-head">
        <h2 className="panel-title">Link status</h2>
        <span className="panel-note">{demo ? 'Demo' : 'Live'}</span>
      </div>

      <div className="live-status-body">
        <p className="live-status-blurb">
          Monitoring only
          {demo ? ' — values below are simulated until real feeds are wired.' : '.'}
        </p>

        <div className="live-status-list" role="list">
          {visible.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className="live-status-row"
              role="listitem"
              aria-pressed={selected?.id === ch.id}
              onClick={() => onSelectChannel(ch.id)}
            >
              <span className="live-status-name">{ch.name}</span>
              <span className="live-dot" data-state={ch.status}>
                {statusLabel(ch.status)}
              </span>
              <span className="live-status-meta">
                {ch.latencyMs ? `${ch.latencyMs} ms` : '—'} · {ch.dropPct.toFixed(1)}% drop
                {ch.owner ? ` · ${ch.owner}` : ''}
              </span>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="live-status-detail">
            <p className="hub-kicker">Selected channel</p>
            <p className="live-status-detail-title">{selected.name}</p>
            <dl className="live-status-dl">
              <div>
                <dt>Rate</dt>
                <dd>{selected.rateHz} Hz</dd>
              </div>
              <div>
                <dt>Last packet</dt>
                <dd>{selected.lastPacket}</dd>
              </div>
              <div>
                <dt>Logger</dt>
                <dd>{selected.recording ? 'On' : 'Off'}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="live-status-actions">
          <button type="button" className="hub-btn hub-btn-primary" onClick={onOpenCameras}>
            Open cameras
          </button>
          <button type="button" className="hub-btn" onClick={onExport}>
            Download demo CSV
          </button>
        </div>
      </div>
    </aside>
  )
}

function statusLabel(status: LinkStatus) {
  if (status === 'nominal') return 'OK'
  if (status === 'degraded') return 'Degraded'
  if (status === 'lost') return 'Lost'
  return 'Standby'
}
