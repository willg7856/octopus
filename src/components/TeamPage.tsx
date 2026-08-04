import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  addAccessUser,
  fetchAccessList,
  removeAccessUser,
  type AccessSnapshot,
} from '../accessApi'
import type { AuthUser } from '../auth'
import { useConfirm } from './ConfirmDialog'

const emptyAccess: AccessSnapshot = {
  canManage: false,
  envUsers: [],
  sharedUsers: [],
  users: [],
  updatedAt: null,
  updatedBy: null,
  openAccess: true,
}

export function TeamPage({ user }: { user: AuthUser | null }) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [access, setAccess] = useState<AccessSnapshot>(emptyAccess)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const siteUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://ops.beyondstagezero.com'
    return window.location.origin
  }, [])

  const inviteText = useMemo(() => {
    return [
      'Join Beyond Stage Zero ops (Octopus):',
      siteUrl,
      '',
      'Sign in with your email and the shared team password.',
      access.openAccess
        ? 'Any team email works until an allowlist is set.'
        : `Ask a teammate to add your email if sign-in is denied.`,
    ].join('\n')
  }, [access.openAccess, siteUrl])

  async function reload() {
    setLoading(true)
    const result = await fetchAccessList()
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setAccess(result.access)
  }

  useEffect(() => {
    void reload()
  }, [])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    const result = await addAccessUser(email.trim())
    setBusy(false)
    if (!result.ok) {
      flash(result.error)
      return
    }
    setAccess(result.access)
    setEmail('')
    flash(result.message || `Added ${email.trim().toLowerCase()}`)
  }

  async function handleRemove(target: string) {
    const ok = await confirm(`Remove “${target}” from the shared allowlist?`)
    if (!ok) return
    setBusy(true)
    const result = await removeAccessUser(target)
    setBusy(false)
    if (!result.ok) {
      flash(result.error)
      return
    }
    setAccess(result.access)
    flash(`Removed ${target}`)
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      flash('Invite text copied')
    } catch {
      flash('Could not copy — select the text manually')
    }
  }

  return (
    <main className="simple-page" aria-label="Team accounts">
      <header className="simple-head">
        <div>
          <h2>Team</h2>
          <p className="simple-muted">
            Share Octopus with teammates and manage who can sign in.
          </p>
        </div>
      </header>

      {error ? (
        <p className="simple-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="team-panel" aria-label="Share ops site">
        <h3>Share the site</h3>
        <p className="simple-muted">
          Teammates open the link, sign in with their email, and use the shared
          team password (`OPS_PASSWORD` in Vercel).
        </p>
        <label>
          Ops URL
          <input className="team-url" value={siteUrl} readOnly />
        </label>
        <pre className="team-invite">{inviteText}</pre>
        <div className="simple-form-actions">
          <button type="button" className="btn btn-accent" onClick={() => void copyInvite()}>
            {copied ? 'Copied' : 'Copy invite'}
          </button>
        </div>
      </section>

      <section className="team-panel" aria-label="Allowed accounts">
        <h3>Allowed accounts</h3>
        {loading ? (
          <p className="simple-muted">Loading…</p>
        ) : (
          <>
            {access.openAccess ? (
              <p className="simple-muted">
                Open access is on — any email + the team password works. Add
                emails below to start an allowlist (env `OPS_USERS` emails stay
                allowed too).
              </p>
            ) : (
              <p className="simple-muted">
                Only listed emails can sign in (plus any locked in `OPS_USERS`).
                {access.updatedBy
                  ? ` Last updated by ${access.updatedBy}.`
                  : ''}
              </p>
            )}

            {access.canManage ? (
              <form className="team-add" onSubmit={(e) => void handleAdd(e)}>
                <label>
                  Add teammate email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@beyondstagezero.com"
                    required
                    disabled={busy}
                  />
                </label>
                <button type="submit" className="btn btn-accent" disabled={busy}>
                  Add account
                </button>
              </form>
            ) : (
              <p className="simple-muted">
                You’re signed in as {user?.email ?? 'a teammate'}. Account edits
                need admin access (`OPS_ADMINS`).
              </p>
            )}

            <ul className="team-user-list">
              {access.users.length === 0 ? (
                <li className="simple-muted">No allowlist yet.</li>
              ) : (
                access.users.map((entry) => {
                  const fromEnv = access.envUsers.includes(entry)
                  return (
                    <li key={entry} className="team-user-row">
                      <span>
                        <strong>{entry}</strong>
                        <span className="simple-muted">
                          {fromEnv ? 'Locked in OPS_USERS' : 'Shared list'}
                        </span>
                      </span>
                      {access.canManage && !fromEnv ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void handleRemove(entry)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  )
                })
              )}
            </ul>
          </>
        )}
      </section>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
      {confirmDialog}
    </main>
  )
}
