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
  const hasStream = Boolean(feed.streamUrl?.trim() || feed.snapshotUrl?.trim())

  const body = (
    <div className="camera-frame" data-cam={feed.id} data-has-stream={hasStream ? 'true' : 'false'}>
      {hasStream && feed.snapshotUrl ? (
        <img className="camera-still" src={feed.snapshotUrl} alt="" />
      ) : null}
      <div className="camera-scan" aria-hidden="true" />
      <div className="camera-hud">
        <span className="camera-live" data-status={hasStream ? feed.status : 'standby'}>
          <span className="camera-live-dot" aria-hidden="true" />
          {hasStream
            ? feed.status === 'nominal'
              ? 'Live'
              : feed.status
            : 'No stream'}
        </span>
        <span className="camera-latency">
          {hasStream && feed.latencyMs ? `${feed.latencyMs} ms` : '—'}
        </span>
      </div>
      {!hasStream ? (
        <div className="camera-empty">
          <strong>Stream not connected</strong>
          <span>Add streamUrl / snapshotUrl for this camera.</span>
        </div>
      ) : null}
      <div className="camera-meta">
        <strong>{feed.name}</strong>
        <span>{feed.spot}</span>
        <span className="camera-clock">{feed.lastFrameAt || clock}</span>
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className="camera-tile"
        data-status={hasStream ? feed.status : 'standby'}
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
      data-status={hasStream ? feed.status : 'standby'}
      data-large={large ? 'true' : 'false'}
      data-focused={focused ? 'true' : 'false'}
    >
      {body}
    </div>
  )
}
