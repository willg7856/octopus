import { useState } from 'react'
import { CollectionPage, type Column, type Filter } from '../components/CollectionPage'
import { useEditor } from '../components/Editor'
import { FieldValue, prettyUrl } from '../components/fields'
import { Icon } from '../components/Icon'
import { RecordDetail } from '../components/RecordDetail'
import { Badge, Button, copyText, LinkButton, useToast } from '../components/ui'
import { downloadText } from '../lib/csv'
import { fmtAgo } from '../lib/derive'
import { byType, labelOf, PROTOCOLS } from '../lib/schema'
import { useStore } from '../lib/store'
import type { Data, Desktop, Rec, Template } from '../lib/types'
import { RecentBuilds } from './inventory'

const field = (type: string, key: string) => byType.get(type)!.fields.find((f) => f.key === key)!

/* ======================= processes ======================= */

export function ProcessesList() {
  const c = byType.get('process')!
  const filters: Filter[] = [
    { key: 'active', label: 'In use', test: (r) => r.data.status !== 'retired' },
    { key: 'draft', label: 'Drafts', test: (r) => r.data.status === 'draft' },
    { key: 'all', label: 'All', test: () => true },
  ]
  return <CollectionPage c={c} filters={filters} />
}

export function ProcessDetail({ id }: { id: string }) {
  const c = byType.get('process')!
  const openEditor = useEditor()
  const [done, setDone] = useState<Set<number>>(new Set())
  return (
    <RecordDetail
      c={c}
      id={id}
      hideFields={['steps']}
      badge={(r) => <FieldValue field={field('process', 'status')} value={r.data.status} />}
      actions={(r) => (
        <>
          {typeof r.data.docUrl === 'string' && <LinkButton href={r.data.docUrl} external icon="external">Full document</LinkButton>}
          <Button icon="file" onClick={() => window.print()}>Print</Button>
          <Button variant="primary" icon="wrench" onClick={() => openEditor({ type: 'movement', initial: { kind: 'made', process: r.id } })}>
            Log a build
          </Button>
        </>
      )}
    >
      {(r) => {
        const steps = String(r.data.steps ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
        let n = 0
        return (
          <>
            {steps.length > 0 && (
              <section className="card">
                <div className="row between">
                  <h2 className="card-title">Steps</h2>
                  {done.size > 0 && <Button small variant="ghost" onClick={() => setDone(new Set())}>Reset ticks</Button>}
                </div>
                <ol className="steps">
                  {steps.map((s, i) => {
                    if (s.startsWith('!')) {
                      return (
                        <li key={i} className="step-warn">
                          <Icon name="alert" size={15} /> {s.slice(1).trim()}
                        </li>
                      )
                    }
                    n++
                    const on = done.has(i)
                    return (
                      <li key={i} className={on ? 'step done' : 'step'}>
                        <label>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setDone((d) => {
                                const x = new Set(d)
                                if (x.has(i)) x.delete(i)
                                else x.add(i)
                                return x
                              })
                            }
                          />
                          <span className="step-n">{n}</span>
                          <span>{s.replace(/^\d+[.)]\s*/, '')}</span>
                        </label>
                      </li>
                    )
                  })}
                </ol>
                <p className="muted small">Ticks are just for you while you work — they aren’t saved.</p>
              </section>
            )}
            <section className="card">
              <h2 className="card-title">Recent builds using this process</h2>
              <RecentBuilds processId={r.id} />
            </section>
          </>
        )
      }}
    </RecordDetail>
  )
}

/* ======================= remote desktops ======================= */

function connectTarget(d: Desktop): { href?: string; download?: () => void; label: string } {
  const host = d.host?.trim()
  const port = d.port ? `:${d.port}` : ''
  switch (d.protocol) {
    case 'rdp':
      return {
        label: 'Download .rdp',
        download: host
          ? () =>
              downloadText(
                `${d.name.replace(/[^\w-]+/g, '_')}.rdp`,
                [`full address:s:${host}${port}`, d.username ? `username:s:${d.username}` : '', 'prompt for credentials:i:1', 'screen mode id:i:2']
                  .filter(Boolean)
                  .join('\r\n'),
                'application/x-rdp',
              )
          : undefined,
      }
    case 'vnc':
      return { label: 'Open in VNC', href: host ? `vnc://${host}${port}` : undefined }
    case 'ssh':
      return { label: 'Open SSH', href: host ? `ssh://${d.username ? `${d.username}@` : ''}${host}${port}` : undefined }
    case 'anydesk':
      return { label: 'Open AnyDesk', href: d.machineId ? `anydesk:${d.machineId.replace(/\s/g, '')}` : undefined }
    case 'teamviewer':
      return { label: 'Open TeamViewer', href: d.machineId ? `https://start.teamviewer.com/${d.machineId.replace(/\s/g, '')}` : undefined }
    default:
      return { label: 'Connect', href: d.url }
  }
}

function addressOf(d: Desktop): string | undefined {
  if (d.machineId) return d.machineId
  if (d.host) return `${d.username ? `${d.username}@` : ''}${d.host}${d.port ? `:${d.port}` : ''}`
  return d.url ? prettyUrl(d.url) : undefined
}

function DesktopCard({ r }: { r: Rec<Desktop> }) {
  const { update, user } = useStore()
  const openEditor = useEditor()
  const toast = useToast()
  const d = r.data
  const t = connectTarget(d)
  const mine = d.inUseBy === user.name
  const addr = addressOf(d)

  const setClaim = async (claim: boolean) => {
    const next: Data = { ...d }
    if (claim) {
      next.inUseBy = user.name
      next.inUseSince = new Date().toISOString()
    } else {
      delete next.inUseBy
      delete next.inUseSince
    }
    try {
      await update(r as Rec, next)
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  return (
    <article className={`card desktop${d.inUseBy ? ' in-use' : ''}`}>
      <header className="row between">
        <div>
          <h3 className="strong">{d.name}</h3>
          <p className="muted small">{[d.purpose, d.location].filter(Boolean).join(' · ') || labelOf(PROTOCOLS, d.protocol)}</p>
        </div>
        <Button small variant="ghost" icon="edit" aria-label={`Edit ${d.name}`} onClick={() => openEditor({ type: 'desktop', record: r as Rec })} />
      </header>
      <div className="desktop-meta">
        <Badge tone="neutral">{labelOf(PROTOCOLS, d.protocol).replace(/ \(.*\)/, '')}</Badge>
        {addr && (
          <button className="mono small copyable" title="Copy" onClick={() => copyText(addr).then(() => toast('Copied address'))}>
            {addr} <Icon name="copy" size={12} />
          </button>
        )}
      </div>
      {d.inUseBy ? (
        <p className="in-use-line">
          <span className="dot bg-warn" /> In use by <strong>{mine ? 'you' : d.inUseBy}</strong>{' '}
          <span className="muted">since {fmtAgo(d.inUseSince)}</span>
        </p>
      ) : (
        <p className="in-use-line muted"><span className="dot bg-good" /> Free</p>
      )}
      {d.notes && <p className="small muted prewrap clamp">{d.notes}</p>}
      <footer className="row gap-s wrap">
        {t.download ? (
          <Button variant="primary" icon="play" onClick={() => { t.download!(); if (!d.inUseBy) setClaim(true) }}>{t.label}</Button>
        ) : t.href ? (
          <a className="btn btn-primary" href={t.href} target="_blank" rel="noreferrer" onClick={() => { if (!d.inUseBy) setClaim(true) }}>
            <Icon name="play" size={16} /> {t.label}
          </a>
        ) : (
          <span className="muted small">Add connection details to connect.</span>
        )}
        {d.inUseBy ? (
          <Button onClick={() => setClaim(false)}>{mine ? 'I’m done' : 'Mark free'}</Button>
        ) : (
          <Button onClick={() => setClaim(true)}>Claim</Button>
        )}
      </footer>
    </article>
  )
}

export function DesktopsList() {
  const c = byType.get('desktop')!
  const filters: Filter<Desktop>[] = [
    { key: 'all', label: 'All', test: () => true },
    { key: 'free', label: 'Free', test: (r) => !r.data.inUseBy },
    { key: 'busy', label: 'In use', test: (r) => !!r.data.inUseBy },
  ]
  return (
    <CollectionPage<Desktop>
      c={c}
      filters={filters}
      card={(r) => <DesktopCard r={r} />}
      above={
        <p className="note small">
          <Icon name="shield" size={14} /> Connecting opens your own remote-desktop app — Octopus never stores machine passwords.
          Connecting marks the machine as yours; hit <em>I’m done</em> when you finish.
        </p>
      }
    />
  )
}

/* ======================= contacts ======================= */

export function ContactsList() {
  const c = byType.get('contact')!
  const kind = field('contact', 'kind')
  const filters: Filter[] = [
    { key: 'all', label: 'All', test: () => true },
    ...kind.options!.map((o) => ({ key: o.value, label: o.label + (o.value === 'person' ? 's' : o.value.endsWith('s') ? '' : 's'), test: (r: Rec) => r.data.kind === o.value })),
  ]
  const columns: Column[] = [
    { key: 'kind', label: 'Type', className: 'hide-s', render: (r) => <FieldValue field={kind} value={r.data.kind} /> },
    {
      key: 'email',
      label: 'Email',
      render: (r) => <FieldValue field={field('contact', 'email')} value={r.data.email} />,
      sort: (r) => String(r.data.email ?? ''),
    },
    { key: 'phone', label: 'Phone', className: 'nowrap', render: (r) => <FieldValue field={field('contact', 'phone')} value={r.data.phone} /> },
  ]
  return <CollectionPage c={c} filters={filters} columns={columns} />
}

export function ContactDetail({ id }: { id: string }) {
  const c = byType.get('contact')!
  return (
    <RecordDetail
      c={c}
      id={id}
      actions={(r) => (
        <>
          {typeof r.data.email === 'string' && <LinkButton href={`mailto:${r.data.email}`} icon="mail">Email</LinkButton>}
          {typeof r.data.phone === 'string' && <LinkButton href={`tel:${r.data.phone.replace(/\s/g, '')}`} icon="phone">Call</LinkButton>}
          {typeof r.data.website === 'string' && <LinkButton href={r.data.website} external icon="external">Website</LinkButton>}
        </>
      )}
    />
  )
}

/* ======================= templates ======================= */

/** Google Docs/Sheets/Slides: turn an /edit link into a /copy link so people start fresh. */
export function copyUrl(url?: string): string | undefined {
  if (!url) return undefined
  const m = url.match(/^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation|drawings)\/d\/([\w-]+)/)
  return m ? `https://docs.google.com/${m[1]}/d/${m[2]}/copy` : undefined
}

function TemplateCard({ r }: { r: Rec<Template> }) {
  const openEditor = useEditor()
  const toast = useToast()
  const d = r.data
  const copy = copyUrl(d.url)
  return (
    <article className="card template">
      <header className="row between">
        <div>
          <h3 className="strong">{d.name}</h3>
          {d.category && <p className="muted small">{d.category}</p>}
        </div>
        <Button small variant="ghost" icon="edit" aria-label={`Edit ${d.name}`} onClick={() => openEditor({ type: 'template', record: r as Rec })} />
      </header>
      {d.notes && <p className="small">{d.notes}</p>}
      {d.body && <pre className="template-body">{d.body}</pre>}
      <footer className="row gap-s wrap">
        {copy && <LinkButton href={copy} external variant="primary" icon="copy">Make a copy</LinkButton>}
        {d.url && <LinkButton href={d.url} external icon="external">{copy ? 'View original' : 'Open'}</LinkButton>}
        {d.body && (
          <Button icon="copy" onClick={() => copyText(d.body!).then(() => toast('Copied to clipboard', { tone: 'good' }))}>
            Copy text
          </Button>
        )}
      </footer>
    </article>
  )
}

export function TemplatesList() {
  const c = byType.get('template')!
  return <CollectionPage<Template> c={c} card={(r) => <TemplateCard r={r} />} />
}

/* ======================= links ======================= */

export function LinksList() {
  const c = byType.get('link')!
  const columns: Column[] = [
    { key: 'category', label: 'Group', sort: (r) => String(r.data.category ?? ''), render: (r) => String(r.data.category ?? '—') },
    { key: 'url', label: 'URL', render: (r) => <FieldValue field={field('link', 'url')} value={r.data.url} /> },
  ]
  return <CollectionPage c={c} columns={columns} detail={false} />
}

