import { useEffect, useId, useRef, useState } from 'react'

type ConfirmRequest = {
  message: string
  confirmLabel?: string
  noteLabel?: string
  notePlaceholder?: string
  noteRequired?: boolean
  resolve: (value: ConfirmSettle) => void
}

export type ConfirmSettle =
  | false
  | true
  | { ok: true; note: string }

export function useConfirm() {
  const [state, setState] = useState<ConfirmRequest | null>(null)
  const [note, setNote] = useState('')
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const noteId = useId()

  function confirm(
    message: string,
    options?: { confirmLabel?: string },
  ): Promise<boolean> {
    return new Promise((resolve) => {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      setNote('')
      setState({
        message,
        confirmLabel: options?.confirmLabel,
        resolve: (value) => resolve(value === true),
      })
    })
  }

  /** Confirm with an optional/required cause note. */
  function confirmNote(options: {
    message: string
    confirmLabel?: string
    noteLabel?: string
    notePlaceholder?: string
    noteRequired?: boolean
  }): Promise<{ ok: false } | { ok: true; note: string }> {
    return new Promise((resolve) => {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      setNote('')
      setState({
        message: options.message,
        confirmLabel: options.confirmLabel,
        noteLabel: options.noteLabel ?? 'Cause / notes',
        notePlaceholder:
          options.notePlaceholder ?? 'What happened? (required)',
        noteRequired: options.noteRequired ?? true,
        resolve: (value) => {
          if (value && typeof value === 'object' && value.ok) {
            resolve({ ok: true, note: value.note })
          } else {
            resolve({ ok: false })
          }
        },
      })
    })
  }

  function settle(value: ConfirmSettle) {
    state?.resolve(value)
    setState(null)
    setNote('')
    window.setTimeout(() => previouslyFocused.current?.focus?.(), 0)
  }

  const wantsNote = Boolean(state?.noteLabel)
  const noteTrimmed = note.trim()
  const canConfirm =
    !wantsNote || !state?.noteRequired || noteTrimmed.length > 0

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
    window.setTimeout(() => {
      if (wantsNote) noteRef.current?.focus()
      else cancelRef.current?.focus()
    }, 0)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, wantsNote])

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
        {wantsNote ? (
          <label className="confirm-note" htmlFor={noteId}>
            {state.noteLabel}
            <textarea
              ref={noteRef}
              id={noteId}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={state.notePlaceholder}
              required={state.noteRequired}
            />
          </label>
        ) : null}
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
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return
              if (wantsNote) settle({ ok: true, note: noteTrimmed })
              else settle(true)
            }}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { confirm, confirmNote, dialog }
}
