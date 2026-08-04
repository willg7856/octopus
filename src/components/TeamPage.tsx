import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  addAccessUser,
  clearAccessUserPassword,
  fetchAccessList,
  removeAccessUser,
  setAccessUserPassword,
  type AccessSnapshot,
} from '../accessApi'
import type { AuthUser } from '../auth'
import { useConfirm } from './ConfirmDialog'

const emptyAccess: AccessSnapshot = {
  canManage: false,
  envUsers: [],
  sharedUsers: [],
  users: [],
  passwordSet: [],
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
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [passwordEmail, setPasswordEmail] = useState<string | null>(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const siteUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://ops.beyondstagezero.com'
    return window.location.origin
  }, [])

  const inviteText = useMemo(() => {
    return [
      'Join Beyond Stage Zero ops (Octopus):',
      siteUrl,
      '',
      'Sign in with your email.',
      'Use the personal password your admin set, or the shared team password if you do not have one yet.',
      access.openAccess
        ? 'Any team email works until an allowlist is set.'
        : 'Ask a teammate to add your email if sign-in is denied.',
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
    const result = await addAccessUser(
      email.trim(),
      newPassword.trim() || undefined,
    )
    setBusy(false)
    if (!result.ok) {
      flash(result.error)
      return
    }
    setAccess(result.access)
    setEmail('')
    setNewPassword('')
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
    if (passwordEmail === target) {
      setPasswordEmail(null)
      setPasswordValue('')
      setPasswordConfirm('')
    }
    flash(`Removed ${target}`)
  }

  function startPasswordEdit(target: string) {
    setPasswordEmail(target)
    setPasswordValue('')
    setPasswordConfirm('')
  }

  function cancelPasswordEdit() {
    setPasswordEmail(null)
    setPasswordValue('')
    setPasswordConfirm('')
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault()
    if (!passwordEmail || busy) return
    if (passwordValue.length < 6) {
      flash('Password must be at least 6 characters')
      return
    }
    if (passwordValue !== passwordConfirm) {
      flash('Passwords do not match')
      return
    }
    setBusy(true)
    const result = await setAccessUserPassword(passwordEmail, passwordValue)
    setBusy(false)
    if (!result.ok) {
      flash(result.error)
      return
    }
    setAccess(result.access)
    cancelPasswordEdit()
    flash(result.message || `Password set for ${passwordEmail}`)
  }

  async function handleClearPassword(target: string) {
    const ok = await confirm(
      `Clear personal password for “${target}”? They will use the shared team password again.`,
    )
    if (!ok) return
    setBusy(true)
    const result = await clearAccessUserPassword(target)
    setBusy(false)
    if (!result.ok) {
      flash(result.error)
      return
    }
    setAccess(result.access)
    if (passwordEmail === target) cancelPasswordEdit()
    flash(result.message || `Cleared password for ${target}`)
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
          Teammates open the link and sign in with their email. They use a
          personal password if you set one below, otherwise the shared team
          password (`OPS_PASSWORD` in Vercel).
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
                allowed too). Personal passwords still apply when set.
              </p>
            ) : (
              <p className="simple-muted">
                Only listed emails can sign in (plus any locked in `OPS_USERS`).
                {access.updatedBy
                  ? ` Last updated by ${access.updatedBy}.`
                  : ''}
              </p>
            )}

            <p className="simple-muted">
              Passwords are stored hashed — you can set or reset them here, but
              you cannot view an existing password.
            </p>

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
                <label>
                  Personal password (optional)
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave blank to use shared team password"
                    minLength={6}
                    disabled={busy}
                    autoComplete="new-password"
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
                  const hasPersonal = access.passwordSet.includes(entry)
                  const editingPassword = passwordEmail === entry
                  return (
                    <li key={entry} className="team-user-row">
                      <div className="team-user-main">
                        <span>
                          <strong>{entry}</strong>
                          <span className="simple-muted">
                            {fromEnv ? 'Locked in OPS_USERS' : 'Shared list'}
                            {' · '}
                            {hasPersonal
                              ? 'Personal password set'
                              : 'Uses shared team password'}
                          </span>
                        </span>
                        {access.canManage ? (
                          <div className="team-user-actions">
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={busy}
                              onClick={() =>
                                editingPassword
                                  ? cancelPasswordEdit()
                                  : startPasswordEdit(entry)
                              }
                            >
                              {editingPassword
                                ? 'Cancel'
                                : hasPersonal
                                  ? 'Change password'
                                  : 'Set password'}
                            </button>
                            {hasPersonal ? (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={busy}
                                onClick={() => void handleClearPassword(entry)}
                              >
                                Use shared
                              </button>
                            ) : null}
                            {!fromEnv ? (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={busy}
                                onClick={() => void handleRemove(entry)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {editingPassword ? (
                        <form
                          className="team-password-form"
                          onSubmit={(e) => void handleSetPassword(e)}
                        >
                          <label>
                            New password
                            <input
                              type="password"
                              value={passwordValue}
                              onChange={(e) => setPasswordValue(e.target.value)}
                              placeholder="At least 6 characters"
                              minLength={6}
                              required
                              disabled={busy}
                              autoComplete="new-password"
                            />
                          </label>
                          <label>
                            Confirm password
                            <input
                              type="password"
                              value={passwordConfirm}
                              onChange={(e) =>
                                setPasswordConfirm(e.target.value)
                              }
                              placeholder="Repeat password"
                              minLength={6}
                              required
                              disabled={busy}
                              autoComplete="new-password"
                            />
                          </label>
                          <div className="simple-form-actions">
                            <button
                              type="submit"
                              className="btn btn-accent"
                              disabled={busy}
                            >
                              Save password
                            </button>
                          </div>
                        </form>
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
