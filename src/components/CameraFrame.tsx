import type { CameraFeed } from '../types'

type CameraFrameProps = {
  feed: CameraFeed
  clock: string
  large?: boolean
  focused?: boolean
  onClick?: () => void
}

export function CameraFrame({
  feed,
  clock,
  large = false,
  focused = false,
  onClick,
}: CameraFrameProps) {
  const body = (
    <div className="camera-frame" data-cam={feed.id}>
      <div className="camera-scan" aria-hidden="true" />
      <div className="camera-hud">
        <span className="camera-live" data-status={feed.status}>
          <span className="camera-live-dot" aria-hidden="true" />
          {feed.status === 'nominal'
            ? 'Live'
            : feed.status === 'standby'
              ? 'Standby'
              : feed.status}
        </span>
        <span className="camera-latency">
          {feed.status === 'standby' ? '—' : `${feed.latencyMs} ms`}
        </span>
      </div>
      <div className="camera-meta">
        <strong>{feed.name}</strong>
        <span>{feed.spot}</span>
        <span className="camera-clock">{clock}</span>
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className="camera-tile"
        data-status={feed.status}
        data-large={large ? 'true' : 'false'}
        data-focused={focused ? 'true' : 'false'}
        onClick={onClick}
        aria-label={`${feed.name} camera`}
      >
        {body}
      </button>
    )
  }

  return (
    <div
      className="camera-tile"
      data-status={feed.status}
      data-large={large ? 'true' : 'false'}
      data-focused={focused ? 'true' : 'false'}
    >
      {body}
    </div>
  )
}
