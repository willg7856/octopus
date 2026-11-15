import { useEffect, useState } from 'react'
import { CollectionPage } from '../components/CollectionPage'
import { Icon } from '../components/Icon'
import { Button, copyText, LinkButton, useToast } from '../components/ui'
import { byType } from '../lib/schema'
import { useStore } from '../lib/store'

interface Feed {
  updatedAt: string
  numbers: { label: string; value: number; suffix: string | null; description: string | null }[]
  builds: { partsBuilt: number; partsBuiltThisMonth: number; buildsLogged: number; processesInUse: number }
}

export function PublicStatsPage() {
  const c = byType.get('stat')!
  const { lastSync } = useStore()
  const toast = useToast()
  const [feed, setFeed] = useState<Feed | null>(null)
  const url = `${window.location.origin}/api/public/stats`

  useEffect(() => {
    fetch('/api/public/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setFeed, () => setFeed(null))
  }, [lastSync?.getMinutes()])

  return (
    <CollectionPage
      c={c}
      defaultSort={{ key: 'order', dir: 1 }}
      detail={false}
      above={
        <section className="card public-feed">
          <div className="row between wrap">
            <div>
              <h2 className="card-title">What the website sees</h2>
              <p className="muted small">
                Only the numbers below marked <em>Shown</em>, plus build counts from the log. Budget, orders, contacts and people are never
                published.
              </p>
            </div>
            <div className="row gap-s">
              <Button small icon="copy" onClick={() => copyText(url).then(() => toast('Feed link copied'))}>Copy feed link</Button>
              <LinkButton small href={url} external icon="external">Open feed</LinkButton>
            </div>
          </div>
          {feed ? (
            <div className="feed-preview">
              {feed.numbers.map((n) => (
                <div key={n.label}>
                  <span className="live-label">{n.label}</span>
                  <span className="feed-value">
                    {n.value.toLocaleString('en-AU')}
                    {n.suffix && <span className="feed-suffix">{n.suffix}</span>}
                  </span>
                </div>
              ))}
              <div>
                <span className="live-label">Parts built (auto)</span>
                <span className="feed-value">{feed.builds.partsBuilt.toLocaleString('en-AU')}</span>
              </div>
              <div>
                <span className="live-label">Builds logged (auto)</span>
                <span className="feed-value">{feed.builds.buildsLogged.toLocaleString('en-AU')}</span>
              </div>
            </div>
          ) : (
            <p className="muted small">
              <Icon name="alert" size={13} /> The public feed is switched off or not reachable.
            </p>
          )}
        </section>
      }
    />
  )
}
