import { useCallback, useEffect, useState } from 'react'
import { useDialog } from '../components/Dialog'
import { RefLink } from '../components/fields'
import { Button, Empty, useToast, Badge } from '../components/ui'
import { api } from '../lib/api'
import { fmtAgo } from '../lib/derive'
import { setParam, useRoute } from '../lib/router'
import { byType, COLLECTIONS, recordTitle } from '../lib/schema'
import { useStore } from '../lib/store'
import type { HistoryEntry, TeamMember } from '../lib/types'
import { describe } from './home'

/* ======================= activity & restore ======================= */

export function ActivityPage() {
  const { params } = useRoute()
  const tab = params.get('tab') === 'deleted' ? 'deleted' : 'all'
  const type = params.get('type') ?? ''
  const { restore, user, records, refresh } = useStore()
  const toast = useToast()
  const dialog = useDialog()
  const isAdmin = user.role === 'admin'
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)

  const load = useCallback(() => {
    setEntries(null)
    api.history({ deleted: tab === 'deleted', limit: 300 }).then(
      (r) => setEntries(r.entries),
      (e) => {
        toast(e.message, { tone: 'bad' })
        setEntries([])
      },
    )
  }, [tab, toast])

  useEffect(load, [load])

  const shown = (entries ?? []).filter((e) => !type || e.type === type)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="muted">
            Every change anyone makes is kept. Deleted things can be restored.
            {isAdmin && ' Admins can erase something permanently, including its history.'}
          </p>
        </div>
      </header>
      <div className="toolbar">
        <div className="chips" role="tablist">
          <button role="tab" aria-selected={tab === 'all'} className={`chip${tab === 'all' ? ' on' : ''}`} onClick={() => setParam('tab', null)}>
            All changes
          </button>
          <button role="tab" aria-selected={tab === 'deleted'} className={`chip${tab === 'deleted' ? ' on' : ''}`} onClick={() => setParam('tab', 'deleted')}>
            Deleted
          </button>
        </div>
        <select className="select-sm" value={type} onChange={(e) => setParam('type', e.target.value || null)} aria-label="Filter by module">
          <option value="">Everything</option>
          {COLLECTIONS.map((c) => (
            <option key={c.type} value={c.type}>{c.label}</option>
          ))}
        </select>
      </div>
      {entries == null ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <Empty title={tab === 'deleted' ? 'Nothing deleted' : 'No activity yet'} />
      ) : (
        <ul className="feed card">
          {shown.map((e, i) => {
            const d = describe(e)
            const c = byType.get(e.type)
            return (
              <li key={e.seq ?? `${e.recordId}-${i}`}>
                <div>
                  <span className="strong">{d.who}</span>{' '}
                  {tab === 'deleted' ? 'deleted' : d.what}{' '}
                  {e.type === 'movement' ? (
                    <>
                      <span>{c?.title(e.data)}</span> of <RefLink id={(e.data as { item?: string }).item} />
                    </>
                  ) : d.link ? (
                    <a href={d.link}>{d.title}</a>
                  ) : (
                    <span className="strong">{d.title}</span>
                  )}
                </div>
                <div className="row gap-s">
                  {tab === 'deleted' && <Badge>{c?.singular ?? e.type}</Badge>}
                  <span className="muted small nowrap">{fmtAgo(e.at)}</span>
                  {isAdmin && (
                    <Button
                      small
                      variant="ghost"
                      className="danger-text"
                      icon="trash"
                      title="Erase permanently"
                      onClick={async () => {
                        const live = records.get(e.recordId)
                        const name = live ? recordTitle(live) : d.title
                        const ok = await dialog.confirm({
                          title: `Erase “${d.title}” for good?`,
                          message: (
                            <>
                              This permanently removes the {c?.singular.toLowerCase() ?? 'record'} and every entry about it from Activity.
                              {live && (
                                <>
                                  {' '}It still exists as <strong>“{name}”</strong> and will be deleted too.
                                </>
                              )}{' '}
                              This can’t be undone.
                            </>
                          ),
                          confirmLabel: 'Erase forever',
                          danger: true,
                        })
                        if (!ok) return
                        try {
                          await api.eraseRecord(e.recordId)
                          toast(`Erased ${d.title}`, { tone: 'good' })
                          refresh(true)
                          load()
                        } catch (err) {
                          toast((err as Error).message, { tone: 'bad' })
                        }
                      }}
                    >
                      Erase
                    </Button>
                  )}
                  {tab === 'deleted' && (
                    <Button
                      small
                      icon="restore"
                      onClick={async () => {
                        try {
                          await restore(e.recordId)
                          toast(`Restored ${d.title}`, { tone: 'good' })
                          load()
                        } catch (err) {
                          toast((err as Error).message, { tone: 'bad' })
                        }
                      }}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ======================= team ======================= */

export function TeamPage() {
  const { user } = useStore()
  const toast = useToast()
  const [team, setTeam] = useState<TeamMember[] | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('member')
  const dialog = useDialog()
  const isAdmin = user.role === 'admin'

  const load = useCallback(() => {
    api.users().then((r) => setTeam(r.users), (e) => toast(e.message, { tone: 'bad' }))
  }, [toast])
  useEffect(load, [load])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast(ok, { tone: 'good' })
      load()
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  const invite = (m: { email: string }) =>
    `You're on the Beyond Stage Zero Octopus team hub.\n\nSign in at ${window.location.origin} with ${m.email} and the team password (ask in chat). Then set your own password under Team → Your password.`

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">Who can sign in to Octopus.</p>
        </div>
      </header>

      <PasswordCard />

      {isAdmin && (
        <form
          className="card add-member"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const r = await api.addUser({ email, name, role })
              await navigator.clipboard?.writeText(invite(r.user)).catch(() => {})
              setEmail('')
              setName('')
            }, 'Added — invite message copied to clipboard')
          }}
        >
          <h2 className="card-title">Add a teammate</h2>
          <div className="form-grid">
            <div className="field half">
              <label htmlFor="m-email">Email</label>
              <input id="m-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field half">
              <label htmlFor="m-name">Name</label>
              <input id="m-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
            </div>
            <div className="field half">
              <label htmlFor="m-role">Access</label>
              <select id="m-role" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Member — can use everything</option>
                <option value="admin">Admin — can also manage the team</option>
              </select>
            </div>
            <div className="field half align-end">
              <Button variant="primary" type="submit" icon="plus">Add teammate</Button>
            </div>
          </div>
          <p className="muted small">New teammates sign in with the shared team password until they set their own.</p>
        </form>
      )}

      <section className="card">
        <h2 className="card-title">Team {team && <span className="muted">({team.length})</span>}</h2>
        {!team ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="table-wrap flat">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hide-s">Email</th>
                  <th>Access</th>
                  <th className="hide-s">Last signed in</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.email} className={m.disabled ? 'pending' : undefined}>
                    <td>
                      <span className="strong">{m.name}</span>
                      {m.email === user.email && <span className="muted small"> (you)</span>}
                      <span className="muted small show-s"><br />{m.email}</span>
                    </td>
                    <td className="hide-s">{m.email}</td>
                    <td>
                      {m.disabled ? <Badge tone="bad">Disabled</Badge> : m.role === 'admin' ? <Badge tone="accent">Admin</Badge> : <Badge>Member</Badge>}
                      {!m.hasPassword && !m.disabled && <span className="muted small"> · team password</span>}
                    </td>
                    <td className="muted small hide-s">{m.lastLoginAt ? fmtAgo(m.lastLoginAt) : 'never'}</td>
                    {isAdmin && (
                      <td className="row-actions">
                        {m.email !== user.email && !m.locked && (
                          <span className="row gap-xs">
                            <Button small variant="ghost" onClick={() => run(() => api.updateUser({ email: m.email, role: m.role === 'admin' ? 'member' : 'admin' }), 'Access updated')}>
                              {m.role === 'admin' ? 'Make member' : 'Make admin'}
                            </Button>
                            <Button
                              small
                              variant="ghost"
                              onClick={async () => {
                                const pw = await dialog.prompt({
                                  title: `Reset password for ${m.name}`,
                                  message: 'Leave it blank to put them back on the shared team password.',
                                  label: 'New password',
                                  type: 'password',
                                  placeholder: 'At least 8 characters',
                                  confirmLabel: 'Reset password',
                                  validate: (v) => (v && v.length < 8 ? 'Use at least 8 characters, or leave it blank.' : null),
                                })
                                if (pw === null) return
                                run(() => api.updateUser({ email: m.email, password: pw || null }), 'Password updated')
                              }}
                            >
                              Reset password
                            </Button>
                            <Button small variant="ghost" onClick={() => run(() => api.updateUser({ email: m.email, disabled: !m.disabled }), m.disabled ? 'Re-enabled' : 'Disabled')}>
                              {m.disabled ? 'Enable' : 'Disable'}
                            </Button>
                            <Button
                              small
                              variant="ghost"
                              className="danger-text"
                              onClick={async () => {
                                const ok = await dialog.confirm({
                                  title: `Remove ${m.name} from the team?`,
                                  message: `${m.email} won’t be able to sign in. Everything they added stays.`,
                                  confirmLabel: 'Remove',
                                  danger: true,
                                })
                                if (ok) run(() => api.removeUser(m.email), 'Removed')
                              }}
                            >
                              Remove
                            </Button>
                          </span>
                        )}
                        {m.locked && <span className="muted small">Set in OPS_ADMINS</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function PasswordCard() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <div className="row gap-s">
        <Button icon="shield" onClick={() => setOpen(true)}>Change your password</Button>
      </div>
    )
  }
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await api.changePassword(current, next)
          toast('Password changed', { tone: 'good' })
          setOpen(false)
          setCurrent('')
          setNext('')
        } catch (err) {
          toast((err as Error).message, { tone: 'bad' })
        }
      }}
    >
      <h2 className="card-title">Your password</h2>
      <div className="form-grid">
        <div className="field half">
          <label htmlFor="pw-cur">Current password</label>
          <input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field half">
          <label htmlFor="pw-new">New password</label>
          <input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
      </div>
      <div className="row gap-s">
        <Button variant="primary" type="submit">Save password</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}
