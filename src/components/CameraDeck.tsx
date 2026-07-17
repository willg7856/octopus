import type { CameraFeed } from '../types'
import { CameraFrame } from './CameraFrame'

type CameraDeckProps = {
  feeds: CameraFeed[]
  clock: string
  active: boolean
  onSelect: () => void
  onOpenPage: () => void
}

export function CameraDeck({
  feeds,
  clock,
  active,
  onSelect,
  onOpenPage,
}: CameraDeckProps) {
  return (
    <section className="camera-deck" aria-label="Pad cameras" data-active={active}>
      <div className="camera-deck-head">
        <h3 className="camera-deck-title">Pad cameras</h3>
        <button type="button" className="camera-open-page" onClick={onOpenPage}>
          Open page
        </button>
      </div>
      <div className="camera-grid">
        {feeds.map((feed) => (
          <CameraFrame
            key={feed.id}
            feed={feed}
            clock={clock}
            onClick={() => {
              onSelect()
              onOpenPage()
            }}
          />
        ))}
      </div>
    </section>
  )
}
