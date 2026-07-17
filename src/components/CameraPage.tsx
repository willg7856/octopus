import { useState } from 'react'
import type { CameraFeed, RangeState } from '../types'
import { CameraFrame } from './CameraFrame'

type CameraPageProps = {
  feeds: CameraFeed[]
  clock: string
  range: RangeState
  onBack: () => void
}

export function CameraPage({ feeds, clock, range, onBack }: CameraPageProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focused = feeds.find((f) => f.id === focusedId) ?? null

  return (
    <section className="camera-page" aria-label="Camera page">
      <div className="camera-page-head">
        <div>
          <p className="brand-kicker">Pad camera mux · Goods Shed</p>
          <h2 className="camera-page-title">Cameras</h2>
        </div>
        <div className="camera-page-meta">
          <span className="camera-page-range" data-range={range}>
            Range {range === 'go' ? 'GO' : range === 'hold' ? 'HOLD' : 'NO-GO'}
          </span>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back to console
          </button>
        </div>
      </div>

      {focused ? (
        <div className="camera-page-focus">
          <CameraFrame
            feed={focused}
            clock={clock}
            large
            focused
            onClick={() => setFocusedId(null)}
          />
          <p className="camera-page-hint">Click feed to return to dual view</p>
        </div>
      ) : (
        <div className="camera-page-grid">
          {feeds.map((feed) => (
            <CameraFrame
              key={feed.id}
              feed={feed}
              clock={clock}
              large
              onClick={() => setFocusedId(feed.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
