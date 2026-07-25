import { useEffect, useMemo, useState } from 'react'
import type { CameraFeed, CameraGroup, CameraGroupId } from '../types'
import { CameraFrame } from './CameraFrame'

type CameraPageProps = {
  feeds: CameraFeed[]
  groups: CameraGroup[]
  clock: string
  demo: boolean
  onBack: () => void
}

const DEFAULT_ENABLED: Record<CameraGroupId, string[]> = {
  pad: ['pad-wide', 'pad-close'],
  shed: ['shed-ops', 'shed-rack'],
  vehicle: ['veh-avionics', 'veh-fin'],
}

export function CameraPage({
  feeds,
  groups,
  clock,
  demo,
  onBack,
}: CameraPageProps) {
  const [groupId, setGroupId] = useState<CameraGroupId>('pad')
  const [enabledByGroup, setEnabledByGroup] = useState(DEFAULT_ENABLED)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const group = groups.find((g) => g.id === groupId) ?? groups[0]
  const groupFeeds = useMemo(
    () => feeds.filter((f) => f.group === groupId),
    [feeds, groupId],
  )
  const enabledIds = enabledByGroup[groupId]
  const activeFeeds = groupFeeds.filter((f) => enabledIds.includes(f.id))
  const focused =
    focusedId && activeFeeds.some((f) => f.id === focusedId)
      ? activeFeeds.find((f) => f.id === focusedId) ?? null
      : null

  useEffect(() => {
    setFocusedId(null)
  }, [groupId])

  function toggleCamera(id: string) {
    setEnabledByGroup((prev) => {
      const current = prev[groupId]
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id]
      if (next.length === 0) return prev
      return { ...prev, [groupId]: next }
    })
    if (focusedId === id) setFocusedId(null)
  }

  function focusCamera(id: string) {
    setEnabledByGroup((prev) => ({ ...prev, [groupId]: [id] }))
    setFocusedId(id)
  }

  const gridClass =
    activeFeeds.length <= 1
      ? 'camera-page-grid camera-page-grid-1'
      : activeFeeds.length === 2
        ? 'camera-page-grid camera-page-grid-2'
        : activeFeeds.length === 3
          ? 'camera-page-grid camera-page-grid-3'
          : 'camera-page-grid camera-page-grid-4'

  return (
    <section className="camera-page" aria-label="Camera page">
      <div className="camera-page-head">
        <div>
          <p className="brand-kicker">{group.blurb}</p>
          <h2 className="camera-page-title">Cameras</h2>
        </div>
        <div className="camera-page-meta">
          <span className="camera-page-clock">{clock}</span>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            Back to control
          </button>
        </div>
      </div>

      {demo ? (
        <p className="hub-banner" data-level="warn">
          No camera streams connected yet — tiles show placeholders until
          stream URLs are added.
        </p>
      ) : null}

      <div className="camera-page-controls">
        <div className="camera-group-tabs" role="tablist" aria-label="Camera groups">
          {groups.map((g) => {
            const count = feeds.filter((f) => f.group === g.id).length
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                className="camera-group-tab"
                aria-selected={groupId === g.id}
                onClick={() => setGroupId(g.id)}
              >
                {g.label}
                <span className="camera-group-count">{count}</span>
              </button>
            )
          })}
        </div>

        <div
          className="camera-pickers"
          role="group"
          aria-label={`${group.label} cameras`}
        >
          {groupFeeds.map((feed) => {
            const on = enabledIds.includes(feed.id)
            return (
              <div key={feed.id} className="camera-picker-row">
                <button
                  type="button"
                  className="camera-picker"
                  data-on={on ? 'true' : 'false'}
                  data-status={feed.status}
                  aria-pressed={on}
                  onClick={() => toggleCamera(feed.id)}
                  title={feed.spot}
                >
                  <span className="camera-picker-dot" aria-hidden="true" />
                  {feed.name}
                </button>
                <button
                  type="button"
                  className="camera-focus-btn"
                  onClick={() => focusCamera(feed.id)}
                >
                  Focus
                </button>
              </div>
            )
          })}
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
          <p className="camera-page-hint">
            Click feed to return to multi view. Use Focus to solo a camera.
          </p>
          {focused.streamUrl ? (
            <a
              className="hub-text-btn"
              href={focused.streamUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open stream ↗
            </a>
          ) : null}
        </div>
      ) : (
        <div className={gridClass} data-count={activeFeeds.length}>
          {activeFeeds.map((feed) => (
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
