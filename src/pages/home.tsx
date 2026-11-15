import { useEffect, useMemo, useState } from 'react'
import { useEditor } from '../components/Editor'
import { GitHubPanel } from '../components/GitHubPanel'
import { LiveStats } from '../components/LiveStats'
import { NextCountdowns } from './countdowns'
import { prettyUrl, RefLink } from '../components/fields'
import { Icon } from '../components/Icon'
import { Button, Empty, Stat } from '../components/ui'
import { api } from '../lib/api'
import {
  daysUntil,
  fmtAgo,
  fmtMoney,
  fmtQty,
  OPEN_STATUSES,
  orderTotal,
  personName,
  useBudgetSummary,
  useReorderList,
} from '../lib/derive'
import { href } from '../lib/router'
import { byType } from '../lib/schema'
import { useRecords, useStore } from '../lib/store'
import type { Desktop, HistoryEntry, Order } from '../lib/types'
import { DueText, StatusBadge } from './money'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function Home() {
  const { user, records } = useStore()
  const openEditor = useEditor()
  const reorder = useReorderList()
  const orders = useRecords<Order>('order')
  const desktops = useRecords<Desktop>('desktop')
  const links = useRecords<{ name: string; url: string; category?: string; description?: string }>('link')
  const budgets = useBudgetSummary()

  const open = orders.filter((o) => OPEN_STATUSES.has(o.data.status))
  const toApprove = open.filter((o) => o.data.status === 'requested')
  const incoming = open
    .filter((o) => o.data.status !== 'requested')
    .sort((a, b) => (a.data.expectedAt ?? '9999').localeCompare(b.data.expectedAt ?? '9999'))
  const overdue = incoming.filter((o) => (daysUntil(o.data.expectedAt) ?? 1) < 0)
  const busy = desktops.filter((d) => d.data.inUseBy)
  const budgetLeft = budgets.filter((b) => b.rec).reduce((s, b) => s + b.allocated - b.spent - b.committed, 0)
  const hasBudgets = budgets.some((b) => b.rec)

  const linkGroups = useMemo(() => {
    const m = new Map<string, typeof links>()
    for (const l of [...links].sort((a, b) => a.data.name.localeCompare(b.data.name))) {
      const k = l.data.category || 'Links'
      m.set(k, [...(m.get(k) ?? []), l])
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [links])

  const isEmpty = records.size === 0

  return (
    <div className="page home">
      <header className="page-head">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{greeting()}, {user.name.split(' ')[0]}</h1>
        </div>
      </header>

      <NextCountdowns />

      {!isEmpty && <LiveStats />}

      <GitHubPanel />

      <div className="quick-actions">
        <QuickAction icon="wrench" label="Log a build" sub="Made something" onClick={() => openEditor({ type: 'movement', initial: { kind: 'made' } })} />
        <QuickAction icon="box" label="Use stock" sub="Took parts off the shelf" onClick={() => openEditor({ type: 'movement', initial: { kind: 'used' } })} />
        <QuickAction icon="cart" label="Request a purchase" sub="Something to buy" onClick={() => openEditor({ type: 'order', initial: { requestedBy: user.name } })} />
        <QuickAction icon="plus" label="New item" sub="Add to inventory" onClick={() => openEditor({ type: 'item' })} />
      </div>

      {isEmpty ? (
        <Empty title="Welcome to Octopus">
          This is the team hub for everything: inventory, builds, orders, budget, processes, remote machines, contacts and
          templates. Start by adding a few items to <a href={href('inventory')}>Inventory</a>, your suppliers to{' '}
          <a href={href('contacts')}>Contacts</a> and your shared drives to <a href={href('links')}>Links</a> — or import a CSV on any page.
        </Empty>
      ) : (
        <>
          <div className="stats">
            <Stat label="Needs reorder" value={reorder.length} tone={reorder.length ? 'warn' : undefined} href={`${href('inventory')}?f=low`} sub="at or below reorder level" />
            <Stat label="To approve" value={toApprove.length} tone={toApprove.length ? 'warn' : undefined} href={`${href('orders')}?f=requested`} sub={toApprove.length ? fmtMoney(toApprove.reduce((s, o) => s + orderTotal(o.data), 0), true) : 'purchase requests'} />
            <Stat label="Incoming" value={incoming.length} href={`${href('orders')}?f=incoming`} sub={overdue.length ? <span className="text-bad">{overdue.length} overdue</span> : 'orders on the way'} />
            {hasBudgets ? (
              <Stat label="Budget left" value={fmtMoney(budgetLeft, true)} tone={budgetLeft < 0 ? 'bad' : undefined} href={href('budget')} sub="after committed orders" />
            ) : (
              <Stat label="Machines in use" value={`${busy.length}/${desktops.length}`} href={href('desktops')} sub="remote desktops" />
            )}
          </div>

          <div className="home-grid">
            <section className="card">
              <header className="card-head">
                <h2 className="card-title">Needs reorder</h2>
                <a className="small" href={`${href('inventory')}?f=low`}>All</a>
              </header>
              {reorder.length === 0 ? (
                <p className="muted">Nothing below its reorder level. Set “Reorder at” on items to get warnings here.</p>
              ) : (
                <ul className="plain-list">
                  {reorder.slice(0, 8).map(({ rec, qty, onOrder }) => (
                    <li key={rec.id} className="row between">
                      <span>
                        <a href={href('inventory', rec.id)} className="strong">{rec.data.name}</a>{' '}
                        <span className={qty <= 0 ? 'text-bad small' : 'text-warn small'}>
                          {fmtQty(qty, rec.data.unit)} left
                        </span>
                        {onOrder > 0 && <span className="muted small"> · {onOrder} on order</span>}
                      </span>
                      {onOrder === 0 && (
                        <Button
                          small
                          onClick={() =>
                            openEditor({
                              type: 'order',
                              initial: {
                                title: `Restock ${rec.data.name}`,
                                supplier: rec.data.supplier,
                                requestedBy: user.name,
                                lines: [{ item: rec.id, qty: Math.max(1, (rec.data.minQty ?? 0) * 2 - qty), unitPrice: rec.data.unitCost }],
                              },
                            })
                          }
                        >
                          Order
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <header className="card-head">
                <h2 className="card-title">Orders</h2>
                <a className="small" href={href('orders')}>All</a>
              </header>
              {open.length === 0 ? (
                <p className="muted">No open orders.</p>
              ) : (
                <ul className="plain-list">
                  {[...toApprove, ...incoming].slice(0, 8).map((o) => (
                    <li key={o.id} className="row between">
                      <span>
                        <a href={href('orders', o.id)} className="strong">{o.data.title}</a>{' '}
                        <span className="muted small">{o.data.supplier ? <RefLink id={o.data.supplier} /> : null}</span>
                      </span>
                      <span className="row gap-s">
                        <DueText order={o.data} />
                        <StatusBadge status={o.data.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {desktops.length > 0 && (
              <section className="card">
                <header className="card-head">
                  <h2 className="card-title">Remote desktops</h2>
                  <a className="small" href={href('desktops')}>Connect</a>
                </header>
                <ul className="plain-list">
                  {desktops.map((d) => (
                    <li key={d.id} className="row between">
                      <span className="strong">{d.data.name}</span>
                      {d.data.inUseBy ? (
                        <span className="small"><span className="dot bg-warn" /> {d.data.inUseBy}</span>
                      ) : (
                        <span className="small muted"><span className="dot bg-good" /> Free</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <RecentActivity />
          </div>
        </>
      )}

      {linkGroups.length > 0 && (
        <section className="links-panel">
          <header className="card-head">
            <h2 className="card-title">Links</h2>
            <a className="small" href={href('links')}>Manage</a>
          </header>
          <div className="link-groups">
            {linkGroups.map(([group, ls]) => (
              <div key={group}>
                <h3 className="eyebrow">{group}</h3>
                <ul className="link-list">
                  {ls.map((l) => (
                    <li key={l.id}>
                      <a href={l.data.url} target="_blank" rel="noreferrer" title={l.data.description ?? prettyUrl(l.data.url)}>
                        <Icon name="external" size={13} /> {l.data.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function QuickAction({ icon, label, sub, onClick }: { icon: 'wrench' | 'box' | 'cart' | 'plus'; label: string; sub: string; onClick: () => void }) {
  return (
    <button className="quick card" onClick={onClick}>
      <span className="quick-icon"><Icon name={icon} size={18} /></span>
      <span>
        <span className="strong">{label}</span>
        <span className="muted small">{sub}</span>
      </span>
    </button>
  )
}

export function describe(e: HistoryEntry): { who: string; what: string; title: string; link?: string } {
  const c = byType.get(e.type)
  const title = c ? c.title(e.data) : e.type
  const who = personName(e.by)
  const noun = c?.singular.toLowerCase() ?? 'record'
  const verb = { create: 'added', update: 'updated', delete: 'deleted', restore: 'restored' }[e.action]
  return { who, what: `${verb} ${noun}`, title, link: e.action !== 'delete' && c ? href(c.key, e.recordId) : undefined }
}

function RecentActivity() {
  const { lastSync } = useStore()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  useEffect(() => {
    api.history({ limit: 12 }).then((r) => setEntries(r.entries), () => setEntries([]))
  }, [lastSync?.getMinutes()])
  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">Recent activity</h2>
        <a className="small" href={href('activity')}>All</a>
      </header>
      {!entries ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ul className="plain-list activity-mini">
          {entries.map((e) => {
            const d = describe(e)
            const isLog = e.type === 'movement'
            return (
              <li key={e.seq}>
                <span className="strong">{d.who}</span> {isLog && e.action === 'create' ? 'logged' : d.what}{' '}
                {isLog ? <RefLink id={(e.data as { item?: string }).item} /> : d.link ? <a href={d.link}>{d.title}</a> : <span>{d.title}</span>}
                <span className="muted small"> · {fmtAgo(e.at)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

