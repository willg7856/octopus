import { getDb, type Row, type Stmt } from './db.js'
import { HttpError } from './http.js'

export interface RecordOut {
  id: string
  type: string
  data: Record<string, unknown>
  version: number
  rev: number
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

export type Op =
  | { op: 'create'; id: string; type: string; data: Record<string, unknown> }
  | { op: 'update'; id: string; version: number; data: Record<string, unknown> }
  | { op: 'delete'; id: string; version: number }
  | { op: 'restore'; id: string }

const TYPE_RE = /^[a-z][a-z0-9_-]{0,31}$/
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/
const MAX_BYTES = 200_000
/** Postgres division_by_zero — used below to abort a transaction when a version check fails. */
const CONFLICT_CODE = '22012'

const COLS = `id, type, data, version, rev::text as rev, created_at, created_by, updated_at, updated_by, deleted_at`

export function toRecord(r: Row): RecordOut {
  const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString())
  return {
    id: r.id as string,
    type: r.type as string,
    data: r.data as Record<string, unknown>,
    version: Number(r.version),
    rev: Number(r.rev),
    createdAt: iso(r.created_at)!,
    createdBy: (r.created_by as string) ?? null,
    updatedAt: iso(r.updated_at)!,
    updatedBy: (r.updated_by as string) ?? null,
    deletedAt: iso(r.deleted_at),
  }
}

function checkData(data: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'Record data must be an object')
  }
  const json = JSON.stringify(data)
  if (json.length > MAX_BYTES) throw new HttpError(413, 'Record is too large')
  return json
}

/**
 * Each statement writes the record and its history row together, so the audit trail
 * can never miss a change. Updates/deletes return `1/count` so that a stale version
 * raises division_by_zero and aborts the whole transaction instead of half-applying.
 */
function toStmt(op: Op, by: string): Stmt {
  if (!ID_RE.test(op.id)) throw new HttpError(400, 'Invalid record id')
  switch (op.op) {
    case 'create': {
      if (!TYPE_RE.test(op.type)) throw new HttpError(400, 'Invalid record type')
      return [
        `with r as (
           insert into records (id, type, data, created_by, updated_by)
           values ($1, $2, $3::jsonb, $4, $4) returning *
         ), h as (
           insert into history (record_id, type, action, data, version, by)
           select id, type, 'create', data, version, $4 from r
         )
         select ${COLS} from r`,
        [op.id, op.type, checkData(op.data), by],
      ]
    }
    case 'update':
      return [
        `with r as (
           update records set data = $3::jsonb, version = version + 1, rev = nextval('rev_seq'),
             updated_at = now(), updated_by = $4
           where id = $1 and version = $2 and deleted_at is null returning *
         ), h as (
           insert into history (record_id, type, action, data, version, by)
           select id, type, 'update', data, version, $4 from r
         )
         select ${COLS}, 1 / (select count(*)::int from r) as ok
         from (select 1) one left join r on true`,
        [op.id, op.version, checkData(op.data), by],
      ]
    case 'delete':
      return [
        `with r as (
           update records set deleted_at = now(), version = version + 1, rev = nextval('rev_seq'),
             updated_at = now(), updated_by = $3
           where id = $1 and version = $2 and deleted_at is null returning *
         ), h as (
           insert into history (record_id, type, action, data, version, by)
           select id, type, 'delete', data, version, $3 from r
         )
         select ${COLS}, 1 / (select count(*)::int from r) as ok
         from (select 1) one left join r on true`,
        [op.id, op.version, by],
      ]
    case 'restore':
      return [
        `with r as (
           update records set deleted_at = null, version = version + 1, rev = nextval('rev_seq'),
             updated_at = now(), updated_by = $2
           where id = $1 and deleted_at is not null returning *
         ), h as (
           insert into history (record_id, type, action, data, version, by)
           select id, type, 'restore', data, version, $2 from r
         )
         select ${COLS}, 1 / (select count(*)::int from r) as ok
         from (select 1) one left join r on true`,
        [op.id, by],
      ]
    default:
      throw new HttpError(400, 'Unknown operation')
  }
}

function isConflict(err: unknown): boolean {
  const e = err as { code?: string; message?: string; sourceError?: { code?: string } }
  return (
    e?.code === CONFLICT_CODE ||
    e?.sourceError?.code === CONFLICT_CODE ||
    /division by zero/i.test(e?.message ?? '')
  )
}

function isDuplicate(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  return e?.code === '23505' || /duplicate key/i.test(e?.message ?? '')
}

/** Applies ops atomically. On a version conflict, returns 409 with the current server copies. */
export async function applyOps(ops: Op[], by: string): Promise<RecordOut[]> {
  if (!Array.isArray(ops) || ops.length === 0) throw new HttpError(400, 'No changes sent')
  if (ops.length > 200) throw new HttpError(400, 'Too many changes in one request')
  const stmts = ops.map((op) => toStmt(op, by))
  const db = await getDb()
  try {
    const results = await db.transaction(stmts)
    return results.map((rows) => toRecord(rows[0]!))
  } catch (err) {
    if (isConflict(err) || isDuplicate(err)) {
      const ids = ops.map((o) => o.id)
      const current = await db.query(`select ${COLS} from records where id = any($1)`, [ids])
      throw new HttpError(
        409,
        'Someone else changed this while you were editing. Nothing was saved.',
        { code: 'conflict', current: current.map(toRecord) },
      )
    }
    throw err
  }
}

export async function listRecords(sinceRev?: number): Promise<{ records: RecordOut[]; rev: number }> {
  const db = await getDb()
  // Read the high-water mark first so a write landing mid-request is picked up next poll.
  const [{ rev }] = await db.query<{ rev: string }>(
    `select coalesce(max(rev), 0)::text as rev from records`,
  )
  const rows =
    sinceRev != null
      ? await db.query(`select ${COLS} from records where rev > $1 and rev <= $2 order by rev`, [
          sinceRev,
          rev,
        ])
      : await db.query(`select ${COLS} from records where deleted_at is null and rev <= $1 order by rev`, [
          rev,
        ])
  return { records: rows.map(toRecord), rev: Number(rev) }
}
