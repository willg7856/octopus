import { useState } from 'react'

type ConfirmState = {
  message: string
  resolve: (value: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  function confirm(message: string) {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve })
    })
  }

  function settle(value: boolean) {
    state?.resolve(value)
    setState(null)
  }

  const dialog = state ? (
    <div
      className="confirm-backdrop"
      role="presentation"
      onClick={() => settle(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') settle(false)
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirm-title" className="confirm-message">
          {state.message}
        </p>
        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => settle(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent"
            autoFocus
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
