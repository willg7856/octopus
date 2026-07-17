import type { CameraFeed } from '../types'

type CameraDeckProps = {
  feeds: CameraFeed[]
  clock: string
  active: boolean
  onSelect: () => void
}

export function CameraDeck({ feeds, clock, active, onSelect }: CameraDeckProps) {
  return (
    <section className="camera-deck" aria-label="Pad cameras" data-active={active}>
      <div className="camera-deck-head">
        <h3 className="camera-deck-title">Pad cameras</h3>
        <span className="panel-note">Mux · Goods Shed</span>
      </div>
      <div className="camera-grid">
        {feeds.map((feed) => (
          <button
            key={feed.id}
            type="button"
            className="camera-tile"
            data-status={feed.status}
            onClick={onSelect}
            aria-label={`${feed.name} camera`}
          >
            <div className="camera-frame" data-cam={feed.id}>
              <div className="camera-scan" aria-hidden="true" />
              <div className="camera-hud">
                <span className="camera-live" data-status={feed.status}>
                  <span className="camera-live-dot" aria-hidden="true" />
                  {feed.status === 'nominal' ? 'Live' : feed.status}
                </span>
                <span className="camera-latency">{feed.latencyMs} ms</span>
              </div>
              <div className="camera-meta">
                <strong>{feed.name}</strong>
                <span>{feed.spot}</span>
                <span className="camera-clock">{clock}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
