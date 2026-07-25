import { useState, type FormEvent } from 'react'
import type { AuthUser } from '../auth'
import type { Theme } from '../theme'

type SignInProps = {
  theme: Theme
  onToggleTheme: () => void
  onSignedIn: (user: AuthUser) => void
  login: (
    email: string,
    password: string,
  ) => Promise<{ user?: AuthUser; error?: string }>
}

export function SignIn({ theme, onToggleTheme, onSignedIn, login }: SignInProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)
    const result = await login(email, password)
    setPending(false)
    if (result.user) {
      onSignedIn(result.user)
      return
    }
    setError(result.error || 'Sign in failed')
  }

  return (
    <div className="auth-screen">
      <button
        type="button"
        className="theme-toggle auth-theme"
        onClick={onToggleTheme}
        aria-label={`Switch to ${theme === 'light' ? 'night' : 'day'} mode`}
      >
        {theme === 'light' ? 'Night' : 'Day'}
      </button>

      <div className="auth-panel">
        <div className="brand-mark auth-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="brand-kicker">Beyond Stage Zero · Creswick</p>
        <h1 className="brand auth-brand">
          OCTOPUS <em>RANGE</em>
        </h1>
        <p className="auth-copy">
          Crew sign-in for the Goods Shed range board — static fires and launch
          day paths.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-accent auth-submit" disabled={pending}>
            {pending ? 'Checking…' : 'Enter board'}
          </button>
        </form>

        <p className="auth-footnote">Crew only · Goods Shed</p>
      </div>
    </div>
  )
}
