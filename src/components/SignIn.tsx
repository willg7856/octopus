import { useState } from 'react'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { Logo } from './Shell'

export function SignIn({ onSignedIn, notice }: { onSignedIn: (u: User) => void; notice?: string | null }) {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('octopus-email') ?? ''
    } catch {
      return ''
    }
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(notice ?? null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="signin">
      <form
        className="signin-card"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            const { user } = await api.login(email, password)
            try {
              localStorage.setItem('octopus-email', email)
            } catch {
              /* ignore */
            }
            onSignedIn(user)
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <Logo />
        <p className="muted">The Beyond Stage Zero team hub.</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required autoFocus={!email} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required autoFocus={!!email} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small">New here? Ask an admin to add you, then use the team password the first time.</p>
      </form>
    </div>
  )
}
