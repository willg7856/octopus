import type { Db } from './db.js'
import { countdownInstant } from './melbourne.js'
import { applyOps, type Op } from './records.js'

/**
 * When a test on GO reaches T-0, it becomes In progress by itself (and posts "Test in progress."),
 * exactly as if someone had pressed the button.
 *
 * There's no background timer on Vercel, so this runs whenever Octopus is asked for data: the
 * public feeds behind beyondstagezero.space and .com (polled every few seconds on test day) and the
 * Octopus app's own sync. At most once every 2 seconds per server instance. Only tests whose T-0
 * passed in the last 6 hours are switched, so an old test left on GO is never touched.
 */

const WINDOW_MS = 6 * 3600_000
let lastRun = 0
let running: Promise<void> | null = null

export function autoStartDueTests(db: Db): Promise<void> {
  if (running) return running
  if (Date.now() - lastRun < 2000) return Promise.resolve()
  lastRun = Date.now()
  running = run(db)
    .catch((err) => console.error('autostart', err))
    .finally(() => {
      running = null
    })
  return running
}

async function run(db: Db) {
  const rows = await db.query<{ id: string; data: Record<string, unknown> | string; version: number }>(
    `select id, data, version from records
     where type = 'countdown' and deleted_at is null and data->>'category' in ('test', 'launch')
       and coalesce(data->>'status', 'scheduled') = 'scheduled' and data->>'date' is not null`,
  )
  const now = Date.now()
  for (const r of rows) {
    const data = typeof r.data === 'string' ? (JSON.parse(r.data) as Record<string, unknown>) : r.data
    const at = countdownInstant(data)
    if (!(at <= now && at > now - WINDOW_MS)) continue
    const ops: Op[] = [
      { op: 'update', id: r.id, version: Number(r.version), data: { ...data, status: 'live' } },
      {
        op: 'create',
        id: `auto${r.id.slice(0, 8)}${now.toString(36)}`.slice(0, 40),
        type: 'liveupdate',
        data: { test: r.id, text: 'T-0. Test in progress.', kind: 'go' },
      },
    ]
    try {
      await applyOps(ops, 'Octopus (automatic at T-0)')
    } catch {
      // Someone (or another server) changed it at the same moment; their change stands.
    }
  }
}
