import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import type { Tone } from '../lib/schema'
import { Icon, type IconKey } from './Icon'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'default'
  icon?: IconKey
  small?: boolean
}

export function Button({ variant = 'default', icon, small, children, className = '', ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}${small ? ' btn-sm' : ''}${children ? '' : ' btn-icon'} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </button>
  )
}

export function LinkButton({
  href,
  icon,
  children,
  variant = 'default',
  small,
  external,
}: {
  href: string
  icon?: IconKey
  children?: ReactNode
  variant?: 'primary' | 'ghost' | 'default'
  small?: boolean
  external?: boolean
}) {
  return (
    <a
      className={`btn btn-${variant}${small ? ' btn-sm' : ''}${children ? '' : ' btn-icon'}`}
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </a>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
      {action}
    </div>
  )
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className={`stat-value${tone ? ` text-${tone}` : ''}`}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </>
  )
  return href ? (
    <a className="stat card" href={href}>
      {body}
    </a>
  ) : (
    <div className="stat card">{body}</div>
  )
}

export function Meter({ parts, max }: { parts: { value: number; tone: Tone; label: string }[]; max: number }) {
  const total = Math.max(max, parts.reduce((s, p) => s + p.value, 0), 1)
  return (
    <div className="meter" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
      {parts.map((p) =>
        p.value > 0 ? (
          <span
            key={p.label}
            className={`meter-part bg-${p.tone}`}
            style={{ width: `${(p.value / total) * 100}%` }}
            title={p.label}
          />
        ) : null,
      )}
    </div>
  )
}

/* ---------- toasts ---------- */

interface Toast {
  id: number
  text: string
  tone: Tone
  action?: { label: string; run: () => void }
}

const ToastCtx = createContext<(text: string, opts?: { tone?: Tone; action?: Toast['action'] }) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, opts: { tone?: Tone; action?: Toast['action'] } = {}) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, text, tone: opts.tone ?? 'neutral', action: opts.action }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.tone === 'bad' ? 9000 : 5000)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast tone-${t.tone}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run()
                  setToasts((all) => all.filter((x) => x.id !== t.id))
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

export function copyText(text: string) {
  return navigator.clipboard.writeText(text)
}
