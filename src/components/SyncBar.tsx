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
    <div className="simple-head-actions">
      {saving ? <span className="simple-sync">Saving…</span> : null}
      {sync === 'shared' && !saving ? (
        <span className="simple-sync simple-sync-ok">Live</span>
      ) : null}
      {updated ? <span className="simple-sync-meta">{updated}</span> : null}
      {conflict ? (
        <span className="simple-conflict" role="status">
          Conflict — review and re-apply
        </span>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onRefresh}
        disabled={sync === 'loading' || saving}
      >
        Refresh
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => downloadHardwareLabExport(lab)}
        disabled={sync === 'loading'}
      >
        {exportLabel}
      </button>
    </div>
  )
}
