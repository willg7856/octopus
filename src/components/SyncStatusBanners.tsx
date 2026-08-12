import type { LabStore } from '../useLabStore'

/** Shared sync error + conflict banners used on Inventory / Hardware / Production. */
export function SyncStatusBanners({ store }: { store: LabStore }) {
  const {
    sync,
    syncError,
    hasLoaded,
    conflict,
    canRetryConflict,
    refresh,
    retryConflict,
    dismissConflict,
  } = store

  return (
    <>
      {sync === 'error' && syncError ? (
        <p className="simple-error" role="alert">
          {syncError}
          {hasLoaded ? (
            <>
              {' '}
              <button
                type="button"
                className="btn btn-ghost simple-inline-action"
                onClick={() => void refresh({ quiet: true })}
              >
                Retry
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {conflict ? (
        <p className="simple-conflict" role="alert">
          Someone else saved first. Live data was refreshed
          {canRetryConflict
            ? ' — retry applies your edit on top of it.'
            : ' — re-apply your edit after reviewing.'}
          {canRetryConflict ? (
            <>
              {' '}
              <button
                type="button"
                className="btn btn-ghost simple-inline-action"
                onClick={() => void retryConflict()}
              >
                Retry edit
              </button>
            </>
          ) : null}{' '}
          <button
            type="button"
            className="btn btn-ghost simple-inline-action"
            onClick={dismissConflict}
          >
            Dismiss
          </button>
        </p>
      ) : null}
    </>
  )
}
