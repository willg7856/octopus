import { useMemo, useState } from 'react'
import { useDialog } from '../components/Dialog'
import { useEditor } from '../components/Editor'
import { Icon } from '../components/Icon'
import { Badge, Button, copyText, LinkButton, useToast } from '../components/ui'
import { newId } from '../lib/api'
import { fmtDate, fmtTime12 } from '../lib/derive'
import { href } from '../lib/router'
import { SITE_SEED } from '../lib/siteSeed'
import { useRecords, useStore } from '../lib/store'
import type { Op, Rec } from '../lib/types'
import { targetOf, heldOf, TClock, useNow, type Countdown } from './countdowns'

type Stat = { label: string; value: string | number; suffix?: string; description?: string; visible?: 'shown' | 'hidden'; order?: number }
type Post = { title: string; body: string; tag?: string; date: string; dateLabel?: string; status: 'published' | 'draft'; link?: string }
type Notice = { label?: string; title: string; active: 'on' | 'off'; link?: string; linkText?: string }
type UpNext = { title: string; code?: string; status?: string; engine?: string; note?: string; steps?: string; link?: string; linkText?: string; visible?: 'shown' | 'hidden'; order?: number }

const SITE = 'https://beyondstagezero.com'

/**
 * One place to update the public website: the notice banner, headline numbers, news and
 * public countdowns. The site reads them from /api/public/stats about once a minute.
 */
export function SitePage() {
  const stats = useRecords<Stat>('stat')
  const posts = useRecords<Post>('post')
  const notices = useRecords<Notice>('notice')
  const countdowns = useRecords<Countdown>('countdown')
  const upnext = useRecords<UpNext>('upnext')
  const { commit } = useStore()
  const openEditor = useEditor()
  const toast = useToast()
  const dialog = useDialog()
  const [importing, setImporting] = useState(false)

  // Offer to bring in whichever parts Octopus doesn't manage yet.
  const missing = [
    notices.length === 0 && 'notice',
    stats.length === 0 && `${SITE_SEED.numbers.length} track-record numbers`,
    posts.length === 0 && `${SITE_SEED.news.length} news posts`,
    upnext.length === 0 && `${SITE_SEED.upnext.length} upcoming tests`,
  ].filter(Boolean) as string[]
  const missingText = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0]

  const importSite = async () => {
    const ok = await dialog.confirm({
      title: 'Bring in what’s on the website now?',
      message: `Copies the website’s ${missingText} into Octopus, so you can edit them here.`,
      confirmLabel: 'Bring them in',
    })
    if (!ok) return
    setImporting(true)
    const ops: Op[] = [
      ...(notices.length ? [] : [{ op: 'create' as const, id: newId(), type: 'notice', data: { ...SITE_SEED.notice } }]),
      ...(stats.length ? [] : SITE_SEED.numbers.map((n) => ({ op: 'create' as const, id: newId(), type: 'stat', data: { ...n } }))),
      ...(posts.length ? [] : SITE_SEED.news.map((n) => ({ op: 'create' as const, id: newId(), type: 'post', data: { ...n } }))),
      ...(upnext.length ? [] : SITE_SEED.upnext.map((n) => ({ op: 'create' as const, id: newId(), type: 'upnext', data: { ...n } }))),
    ]
    try {
      await commit(ops)
      toast('Imported — the website now reads from Octopus', { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page site-page">
      <header className="page-head">
        <div>
          <h1>BSZ site</h1>
          <p className="muted">
            What’s on <a href={SITE} target="_blank" rel="noreferrer">beyondstagezero.com</a> right now. Change anything here and the
            website updates within about a minute — no code, no redeploy.
          </p>
        </div>
        <div className="row gap-s wrap">
          <LinkButton href={SITE} external icon="external">Open the site</LinkButton>
          <Button variant="primary" icon="plus" onClick={() => openEditor({ type: 'post' })}>Write a news post</Button>
        </div>
      </header>

      {missing.length > 0 && (
        <section className="card site-import">
          <div>
            <p className="strong">Start from what’s on the website</p>
            <p className="muted small">
              The website still shows its built-in {missingText}. Bring{' '}
              {missing.length === 1 ? 'it' : 'them'} into Octopus once, and from then on you edit {missing.length === 1 ? 'it' : 'them'} here.
            </p>
          </div>
          <Button variant="primary" onClick={importSite} disabled={importing}>
            {importing ? 'Bringing them in…' : 'Bring them in'}
          </Button>
        </section>
      )}

      <NoticeCard notices={notices} />
      <NumbersCard stats={stats} />
      <UpNextCard items={upnext} />
      <NewsCard posts={posts} />
      <CountdownsCard countdowns={countdowns} />

      <p className="muted small site-foot">
        <Icon name="shield" size={13} /> Only what’s on this page reaches the website. Budget, orders, contacts and people never leave Octopus.{' '}
        <button className="linkish" onClick={() => copyText(`${window.location.origin}/api/public/stats`).then(() => toast('Feed link copied'))}>
          Copy the feed link
        </button>
      </p>
    </div>
  )
}

/* ---------------- notice ---------------- */

function NoticeCard({ notices }: { notices: Rec<Notice>[] }) {
  const openEditor = useEditor()
  const { update } = useStore()
  const toast = useToast()
  const sorted = [...notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const live = sorted.find((n) => n.data.active !== 'off')
  const toggle = async (n: Rec<Notice>) => {
    try {
      await update(n as Rec, { ...n.data, active: n.data.active === 'off' ? 'on' : 'off' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }
  return (
    <section className="card site-card">
      <header className="site-card-head">
        <div>
          <h2 className="card-title">Notice banner</h2>
          <p className="muted small">The “what’s happening now” banner on the home, B1M and Tests pages.</p>
        </div>
        <Button small icon="plus" onClick={() => openEditor({ type: 'notice' })}>New notice</Button>
      </header>
      {live ? (
        <div className="site-notice-preview">
          {live.data.label && <span className="site-notice-label">{live.data.label}</span>}
          <span className="site-notice-title">{live.data.title}</span>
          {live.data.link && <span className="site-notice-link">{live.data.linkText || 'Find out more'} →</span>}
        </div>
      ) : (
        <p className="muted small">{notices.length ? 'No notice is showing on the website.' : 'No notice yet.'}</p>
      )}
      {sorted.length > 0 && (
        <ul className="site-list">
          {sorted.map((n) => (
            <li key={n.id}>
              <button className="site-list-main" onClick={() => openEditor({ type: 'notice', record: n as Rec })}>
                <span className="strong">{n.data.title}</span>
                {n.data.label && <span className="muted small">{n.data.label}</span>}
              </button>
              {n === live ? <Badge tone="good">Showing</Badge> : n.data.active === 'off' ? <Badge>Hidden</Badge> : <Badge tone="info">Older</Badge>}
              <Button small variant="ghost" onClick={() => toggle(n)}>{n.data.active === 'off' ? 'Show' : 'Hide'}</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---------------- numbers ---------------- */

function NumbersCard({ stats }: { stats: Rec<Stat>[] }) {
  const openEditor = useEditor()
  const sorted = useMemo(
    () => [...stats].sort((a, b) => (a.data.order ?? 999) - (b.data.order ?? 999) || a.data.label.localeCompare(b.data.label)),
    [stats],
  )
  const nextOrder = Math.max(0, ...stats.map((s) => Number(s.data.order) || 0)) + 1
  return (
    <section className="card site-card">
      <header className="site-card-head">
        <div>
          <h2 className="card-title">Headline numbers</h2>
          <p className="muted small">The “Track record” on the About page. Click a number to change it.</p>
        </div>
        <Button small icon="plus" onClick={() => openEditor({ type: 'stat', initial: { order: nextOrder } })}>Add number</Button>
      </header>
      {sorted.length === 0 ? (
        <p className="muted small">No numbers yet.</p>
      ) : (
        <div className="site-numbers">
          {sorted.map((s) => (
            <button
              key={s.id}
              className={`site-number${s.data.visible === 'hidden' ? ' hidden' : ''}`}
              onClick={() => openEditor({ type: 'stat', record: s as Rec })}
              title="Edit"
            >
              <span className="site-number-value">
                {String(s.data.value)}
                {s.data.suffix && <span className="site-number-suffix">{s.data.suffix}</span>}
              </span>
              <span className="site-number-label">{s.data.label}</span>
              {s.data.description && <span className="site-number-note">{s.data.description}</span>}
              {s.data.visible === 'hidden' && <Badge>Hidden</Badge>}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/* ---------------- upcoming tests ---------------- */

function UpNextCard({ items }: { items: Rec<UpNext>[] }) {
  const openEditor = useEditor()
  const { commit } = useStore()
  const toast = useToast()
  const sorted = useMemo(
    () => [...items].sort((a, b) => (Number(a.data.order) || 999) - (Number(b.data.order) || 999) || a.data.title.localeCompare(b.data.title)),
    [items],
  )
  const nextOrder = Math.max(0, ...items.map((s) => Number(s.data.order) || 0)) + 1

  // Up/down swaps positions; positions are renumbered 1..n so they stay tidy.
  const move = async (i: number, dir: -1 | 1) => {
    const list = [...sorted]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    const ops: Op[] = list
      .map((r, k) => ({ r, order: k + 1 }))
      .filter(({ r, order }) => Number(r.data.order) !== order)
      .map(({ r, order }) => ({ op: 'update' as const, id: r.id, version: r.version, data: { ...r.data, order } }))
    try {
      await commit(ops)
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  return (
    <section className="card site-card">
      <header className="site-card-head">
        <div>
          <h2 className="card-title">Upcoming tests</h2>
          <p className="muted small">
            The “Next tests” cards on the <a href={`${SITE}/tests#next-tests`} target="_blank" rel="noreferrer">Tests page</a>. Click one to edit
            it, or use the arrows to change the order.
          </p>
        </div>
        <Button small icon="plus" onClick={() => openEditor({ type: 'upnext', initial: { order: nextOrder, visible: 'shown' } })}>Add test</Button>
      </header>
      {sorted.length === 0 ? (
        <p className="muted small">No upcoming tests. The Tests page shows its built-in list until you add one (or bring them in above).</p>
      ) : (
        <ul className="site-list">
          {sorted.map((u, i) => {
            const steps = String(u.data.steps ?? '').split(/\r?\n/).filter((l) => l.trim())
            return (
              <li key={u.id} className={u.data.visible === 'hidden' ? 'draft' : ''}>
                <button className="site-list-main" onClick={() => openEditor({ type: 'upnext', record: u as Rec })}>
                  <span className="strong">
                    {u.data.code && <span className="muted">{u.data.code} · </span>}
                    {u.data.title}
                  </span>
                  <span className="muted small">
                    {[u.data.status, u.data.engine, steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
                  </span>
                </button>
                {u.data.visible === 'hidden' && <Badge>Hidden</Badge>}
                <span className="site-move">
                  <Button small variant="ghost" aria-label={`Move ${u.data.title} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                  <Button small variant="ghost" aria-label={`Move ${u.data.title} down`} disabled={i === sorted.length - 1} onClick={() => move(i, 1)}>↓</Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ---------------- news ---------------- */

function NewsCard({ posts }: { posts: Rec<Post>[] }) {
  const openEditor = useEditor()
  const { update } = useStore()
  const toast = useToast()
  const sorted = [...posts].sort((a, b) => b.data.date.localeCompare(a.data.date) || b.createdAt.localeCompare(a.createdAt))
  const publish = async (p: Rec<Post>) => {
    try {
      await update(p as Rec, { ...p.data, status: p.data.status === 'draft' ? 'published' : 'draft' })
      toast(p.data.status === 'draft' ? 'Published — on the website within a minute' : 'Moved back to drafts', { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }
  return (
    <section className="card site-card">
      <header className="site-card-head">
        <div>
          <h2 className="card-title">News</h2>
          <p className="muted small">
            Posts on the <a href={`${SITE}/news`} target="_blank" rel="noreferrer">News page</a>, newest first. Drafts stay here until you publish them.
          </p>
        </div>
        <Button small variant="primary" icon="plus" onClick={() => openEditor({ type: 'post' })}>Write a post</Button>
      </header>
      {sorted.length === 0 ? (
        <p className="muted small">No posts yet.</p>
      ) : (
        <ul className="site-list site-posts">
          {sorted.map((p) => (
            <li key={p.id} className={p.data.status === 'draft' ? 'draft' : undefined}>
              <button className="site-list-main" onClick={() => openEditor({ type: 'post', record: p as Rec })}>
                <span className="muted small nowrap">
                  {p.data.dateLabel || fmtDate(p.data.date)}
                  {p.data.tag ? ` · ${p.data.tag}` : ''}
                </span>
                <span className="strong">{p.data.title}</span>
                <span className="muted small clamp-1">{p.data.body}</span>
              </button>
              {p.data.status === 'draft' ? <Badge tone="warn">Draft</Badge> : <Badge tone="good">Live</Badge>}
              <Button small variant="ghost" onClick={() => publish(p)}>{p.data.status === 'draft' ? 'Publish' : 'Unpublish'}</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---------------- countdowns ---------------- */

function CountdownsCard({ countdowns }: { countdowns: Rec<Countdown>[] }) {
  const now = useNow()
  const openEditor = useEditor()
  const shown = countdowns
    .filter((c) => c.data.public === 'shown' && c.data.date)
    .map((c) => ({ rec: c, at: targetOf(c.data) }))
    .filter((x) => x.at > now - 3_600_000)
    .sort((a, b) => a.at - b.at)
  return (
    <section className="card site-card">
      <header className="site-card-head">
        <div>
          <h2 className="card-title">Countdowns on the website</h2>
          <p className="muted small">
            Countdowns marked “Shown publicly”. Manage them all on <a href={href('countdowns')}>Countdowns</a>.
          </p>
        </div>
        <Button small icon="plus" onClick={() => openEditor({ type: 'countdown', initial: { public: 'shown' } })}>Add countdown</Button>
      </header>
      {shown.length === 0 ? (
        <p className="muted small">None showing.</p>
      ) : (
        <ul className="site-list">
          {shown.map((x) => (
            <li key={x.rec.id}>
              <button className="site-list-main" onClick={() => openEditor({ type: 'countdown', record: x.rec as Rec })}>
                <span className="strong">{x.rec.data.name}</span>
                <span className="muted small">
                  {fmtDate(x.rec.data.date)}
                  {x.rec.data.time ? ` · ${fmtTime12(x.rec.data.time)}` : ''}
                </span>
              </button>
              <TClock target={x.at} now={now} size="s" held={heldOf(x.rec)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
