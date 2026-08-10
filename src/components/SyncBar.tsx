import { downloadHardwareLabExport } from '../exportHardware'
import { formatUpdatedLabel, type LabSyncState } from '../useLabStore'
import type { HardwareLabState } from '../hardwareData'

type SyncBarProps = {
  sync: LabSyncState
  saving: boolean
  conflict?: boolean
  updatedAt: string | null
  updatedBy: string | null
  lab: HardwareLabState
  onRefresh: () => void
  exportLabel?: string
}

export function SyncBar({
  sync,
  saving,
  conflict,
  updatedAt,
  updatedBy,
  lab,
  onRefresh,
  exportLabel = 'Export CSV',
}: SyncBarProps) {
  const updated = formatUpdatedLabel(updatedAt, updatedBy)

  return (
    <div className="simple-sync-bar" aria-live="polite">
      {saving ? <span className="simple-sync">Saving…</span> : null}
      {sync === 'shared' && !saving ? (
        <span className="simple-sync simple-sync-ok">Live</span>
      ) : null}
      {sync === 'local' && !saving ? (
        <span className="simple-sync">Local</span>
      ) : null}
      {sync === 'error' && !saving ? (
        <span className="simple-sync simple-sync-error">Offline</span>
      ) : null}
      {updated ? <span className="simple-sync-meta">{updated}</span> : null}
      {conflict ? (
        <span className="simple-conflict" role="status">
          Conflict
        </span>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost simple-sync-refresh"
        onClick={onRefresh}
        disabled={sync === 'loading' || saving}
        aria-label="Refresh shared lab"
        title="Refresh"
      >
        Refresh
      </button>
      <details className="simple-more">
        <summary className="btn btn-ghost" aria-label="More actions">
          More
        </summary>
        <div className="simple-more-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="simple-more-item"
            onClick={(e) => {
              downloadHardwareLabExport(lab)
              const details = e.currentTarget.closest('details')
              if (details) details.open = false
            }}
            disabled={sync === 'loading'}
          >
            {exportLabel}
          </button>
        </div>
      </details>
    </div>
  )
}
