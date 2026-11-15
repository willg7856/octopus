/**
 * Database access.
 *
 * Production: Postgres via DATABASE_URL (Neon on the Vercel Marketplace, or any Postgres
 * reachable over Neon's serverless driver).
 * Local dev: an embedded Postgres (PGlite) stored in .data/pglite — same SQL, no setup.
 *
 * In production we refuse to run without DATABASE_URL rather than silently writing
 * to throwaway storage. Silent fallbacks are how the old Octopus lost data.
 */

export type Row = Record<string, unknown>
export type Stmt = [text: string, params?: unknown[]]

export interface Db {
  mode: 'postgres' | 'embedded'
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>
  /** Runs statements atomically. Any error rolls all of them back. Returns each statement's rows. */
  transaction(stmts: Stmt[]): Promise<Row[][]>
}

export class DbUnavailableError extends Error {}

const SCHEMA: string[] = [
  `create sequence if not exists rev_seq`,
  `create table if not exists records (
    id text primary key,
    type text not null,
    data jsonb not null,
    version integer not null default 1,
    rev bigint not null default nextval('rev_seq'),
    created_at timestamptz not null default now(),
    created_by text,
    updated_at timestamptz not null default now(),
    updated_by text,
    deleted_at timestamptz
  )`,
  `create index if not exists records_rev_idx on records (rev)`,
  `create index if not exists records_type_idx on records (type)`,
  `create table if not exists history (
    seq bigserial primary key,
    record_id text not null,
    type text not null,
    action text not null,
    data jsonb,
    version integer,
    at timestamptz not null default now(),
    by text
  )`,
  `create index if not exists history_record_idx on history (record_id)`,
  `create table if not exists users (
    email text primary key,
    name text,
    role text not null default 'member',
    password_hash text,
    disabled boolean not null default false,
    created_at timestamptz not null default now(),
    last_login_at timestamptz
  )`,
  // Website page views pushed from Vercel Web Analytics (a Vercel Drain).
  `create table if not exists web_events (
    id bigserial primary key,
    at timestamptz not null,
    host text,
    path text,
    referrer text,
    country text,
    device text,
    session text,
    visitor text
  )`,
  `create index if not exists web_events_at_idx on web_events (at)`,
  `alter table web_events add column if not exists project_id text`,
]

// Cached on globalThis so dev hot-reloads reuse the one embedded database handle.
const g = globalThis as { __octopusDb?: Promise<Db> | null }

export function getDb(): Promise<Db> {
  if (!g.__octopusDb) {
    g.__octopusDb = connect().catch((err) => {
      g.__octopusDb = null
      throw err
    })
  }
  return g.__octopusDb
}

const URL_NAME = /(^|_)(DATABASE_URL|POSTGRES_URL)(_UNPOOLED)?$/

/** Finds the Postgres URL, including names with a custom prefix from the Vercel integration. */
function databaseUrl(): string | undefined {
  const direct = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED
  if (direct) return direct
  for (const [k, v] of Object.entries(process.env)) {
    if (URL_NAME.test(k) && v && /^postgres(ql)?:\/\//.test(v)) return v
  }
  return undefined
}

/** Names (never values) of env vars that look database-related, for the setup error message. */
function dbEnvNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /DATABASE|POSTGRES|PG|NEON/.test(k))
    .sort()
}

async function connect(): Promise<Db> {
  const url = databaseUrl()
  let db: Db
  if (url) {
    db = await connectNeon(url)
  } else if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    const seen = dbEnvNames()
    throw new DbUnavailableError(
      'No database configured. In Vercel: Storage → connect a Neon Postgres database to the Production environment, then redeploy. ' +
        (seen.length
          ? `Database-like settings found, but none hold a postgres:// URL: ${seen.join(', ')}.`
          : 'No database settings are visible to this deployment yet.'),
    )
  } else {
    db = await connectEmbedded()
  }
  for (const stmt of SCHEMA) await db.query(stmt)
  return db
}

async function connectNeon(url: string): Promise<Db> {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)
  return {
    mode: 'postgres',
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[]
    },
    async transaction(stmts) {
      const results = await sql.transaction(stmts.map(([t, p]) => sql.query(t, p ?? [])))
      return results as Row[][]
    },
  }
}

async function connectEmbedded(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const fs = await import('node:fs')
  const dir = process.env.OCTOPUS_DATA_DIR || '.data/pglite'
  fs.mkdirSync(dir, { recursive: true })
  const pg = new PGlite(dir)
  await pg.waitReady
  // PGlite is single-connection; serialise everything through one queue.
  let chain: Promise<unknown> = Promise.resolve()
  const run = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn)
    chain = next.catch(() => undefined)
    return next
  }
  return {
    mode: 'embedded',
    query<T>(text: string, params: unknown[] = []) {
      return run(async () => (await pg.query<T>(text, params)).rows)
    },
    transaction(stmts) {
      return run(() =>
        pg.transaction(async (tx) => {
          const out: Row[][] = []
          for (const [t, p] of stmts) out.push((await tx.query<Row>(t, p ?? [])).rows)
          return out
        }),
      )
    },
  }
}
