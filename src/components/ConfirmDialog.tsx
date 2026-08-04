import { useEffect, useId, useRef, useState } from 'react'

type ConfirmState = {
  message: string
  resolve: (value: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()

  function confirm(message: string) {
    return new Promise<boolean>((resolve) => {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      setState({ message, resolve })
    })
  }

  function settle(value: boolean) {
    state?.resolve(value)
    setState(null)
    window.setTimeout(() => previouslyFocused.current?.focus?.(), 0)
  }

  useEffect(() => {
    if (!state) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        settle(false)
        return
      }
      if (e.key !== 'Tab') return
      const dialog = document.querySelector<HTMLElement>('.confirm-dialog')
      if (!dialog) return
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => !el.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    window.setTimeout(() => cancelRef.current?.focus(), 0)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  const dialog = state ? (
    <div
      className="confirm-backdrop"
      role="presentation"
      onClick={() => settle(false)}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <p id={titleId} className="confirm-message">
          {state.message}
        </p>
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={() => settle(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => settle(true)}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, dialog }
}
