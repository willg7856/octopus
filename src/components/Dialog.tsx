import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red button, and Cancel gets focus so Enter is the safe choice. */
  danger?: boolean
}

interface PromptOptions extends ConfirmOptions {
  label: string
  placeholder?: string
  type?: 'text' | 'password'
  initial?: string
  /** Return an error message to block submission. */
  validate?: (value: string) => string | null
}

interface DialogApi {
  confirm(opts: ConfirmOptions): Promise<boolean>
  prompt(opts: PromptOptions): Promise<string | null>
}

type Pending = { id: number } & (
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }
)

let nextId = 1

const DialogCtx = createContext<DialogApi>({
  confirm: async () => false,
  prompt: async () => null,
})

/** In-app replacement for window.confirm / window.prompt. */
export const useDialog = () => useContext(DialogCtx)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ id: nextId++, kind: 'confirm', opts, resolve })),
    [],
  )
  const prompt = useCallback(
    (opts: PromptOptions) => new Promise<string | null>((resolve) => setPending({ id: nextId++, kind: 'prompt', opts, resolve })),
    [],
  )
  const [api] = useState<DialogApi>(() => ({ confirm, prompt }))

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {pending && <DialogBox key={pending.id} pending={pending} done={() => setPending(null)} />}
    </DialogCtx.Provider>
  )
}

function DialogBox({ pending, done }: { pending: Pending; done: () => void }) {
  const { opts } = pending
  const isPrompt = pending.kind === 'prompt'
  const [value, setValue] = useState(isPrompt ? (pending.opts as PromptOptions).initial ?? '' : '')
  const [error, setError] = useState<string | null>(null)
  const restoreFocus = useRef<Element | null>(document.activeElement)

  const finish = useCallback(
    (ok: boolean) => {
      if (pending.kind === 'confirm') pending.resolve(ok)
      else {
        if (ok) {
          const err = pending.opts.validate?.(value) ?? null
          if (err) {
            setError(err)
            return
          }
        }
        pending.resolve(ok ? value : null)
      }
      done()
      ;(restoreFocus.current as HTMLElement | null)?.focus?.()
    },
    [pending, value, done],
  )

  // Capture Escape before anything underneath (like the edit drawer) sees it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        e.preventDefault()
        finish(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [finish])

  const p = isPrompt ? (opts as PromptOptions) : null

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && finish(false)}>
      <form
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onSubmit={(e) => {
          e.preventDefault()
          finish(true)
        }}
      >
        <div className="dialog-body">
          {opts.danger && (
            <span className="dialog-icon">
              <Icon name="alert" size={18} />
            </span>
          )}
          <div className="dialog-text">
            <h2 id="dialog-title">{opts.title}</h2>
            {opts.message && <div className="dialog-message">{opts.message}</div>}
            {p && (
              <div className="field">
                <label htmlFor="dialog-input">{p.label}</label>
                <input
                  id="dialog-input"
                  type={p.type ?? 'text'}
                  autoComplete={p.type === 'password' ? 'new-password' : 'off'}
                  placeholder={p.placeholder}
                  value={value}
                  autoFocus
                  aria-invalid={error ? true : undefined}
                  onChange={(e) => {
                    setValue(e.target.value)
                    setError(null)
                  }}
                />
                {error && <p className="help text-bad">{error}</p>}
              </div>
            )}
          </div>
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn" autoFocus={!p && opts.danger} onClick={() => finish(false)}>
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button type="submit" className={`btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus={!p && !opts.danger}>
            {opts.confirmLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}
