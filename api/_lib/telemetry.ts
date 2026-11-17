import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Db } from './db.js'

/**
 * Live sensor data from the range laptop (chamber pressure and friends).
 *
 * The laptop sends small batches (a few a second) to /api/range/ingest with the range key. Each
 * batch is one row in `telemetry`: samples are `{ t: epoch ms, <channel>: number, … }`.
 * The team reads it near-instantly in Octopus (/api/range/data); the public gets a delayed,
 * thinned-out copy inside /api/public/live.
 */

export type Sample = { t: number } & Record<string, number>
export type Units = Record<string, string>

export const CHANNEL = /^[a-z][a-z0-9_]{0,23}$/
export const MAX_CHANNELS = 8

/** How the public sees a test's data: off, delayed by N seconds, or only after the test ends. */
export type PublicMode = 'off' | 'after' | number
export function publicMode(v: unknown): PublicMode {
  if (v === 'off' || v === 'after') return v
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 30 // default: 30 s behind
}

// ——— Range key: a long random secret; only its hash is stored. ———

const KEY_SETTING = 'range_key_hash'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export function newRangeKey(): string {
  return 'bszr_' + randomBytes(24).toString('base64url')
}

export async function saveRangeKey(db: Db, key: string, by: string) {
  await db.query(
    `insert into settings (key, value, updated_at, updated_by) values ($1, $2, now(), $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [KEY_SETTING, sha(key), by],
  )
  keyCache = null
}

export async function rangeKeyInfo(db: Db): Promise<{ set: boolean; updatedAt?: string; updatedBy?: string }> {
  const [row] = await db.query<{ updated_at: string; updated_by: string | null }>(
    'select updated_at, updated_by from settings where key = $1',
    [KEY_SETTING],
  )
  return row ? { set: true, updatedAt: new Date(row.updated_at).toISOString(), updatedBy: row.updated_by ?? undefined } : { set: false }
}

let keyCache: { hash: string | null; at: number } | null = null

export async function checkRangeKey(db: Db, presented: string | undefined): Promise<boolean> {
  if (!presented) return false
  if (!keyCache || Date.now() - keyCache.at > 30_000) {
    const [row] = await db.query<{ value: string }>('select value from settings where key = $1', [KEY_SETTING])
    keyCache = { hash: row?.value ?? null, at: Date.now() }
  }
  if (!keyCache.hash) return false
  const a = Buffer.from(sha(presented))
  const b = Buffer.from(keyCache.hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ——— Which test incoming data belongs to ———

export interface TestRow {
  id: string
  data: Record<string, unknown>
  updated_at: string
}

export async function testRows(db: Db): Promise<TestRow[]> {
  return db.query<TestRow>(
    `select id, data, updated_at from records
     where type = 'countdown' and deleted_at is null and data->>'category' in ('test', 'launch')`,
  )
}

/** The test that's on now: Live or Hold (latest touched), else one finished in the last 15 minutes. */
export function activeTest(tests: TestRow[], now = Date.now()): TestRow | undefined {
  const touched = (t: TestRow) => new Date(t.updated_at).getTime()
  const byRecent = (a: TestRow, b: TestRow) => touched(b) - touched(a)
  const on = tests.filter((t) => t.data.status === 'live' || t.data.status === 'hold').sort(byRecent)
  if (on[0]) return on[0]
  return tests
    .filter((t) => (t.data.status === 'done' || t.data.status === 'scrubbed') && now - touched(t) < 15 * 60_000)
    .sort(byRecent)[0]
}

// ——— Validation ———

export function cleanSamples(raw: unknown, now = Date.now()): { samples: Sample[]; error?: string } {
  if (!Array.isArray(raw)) return { samples: [], error: 'samples must be a list' }
  if (raw.length > 2000) return { samples: [], error: 'Too many samples in one batch (max 2000)' }
  const out: Sample[] = []
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue
    const t = Number((s as Record<string, unknown>).t)
    if (!Number.isFinite(t) || Math.abs(t - now) > 24 * 3600_000) continue
    const clean: Sample = { t: Math.round(t) }
    let n = 0
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (k === 't') continue
      if (!CHANNEL.test(k) || typeof v !== 'number' || !Number.isFinite(v)) continue
      if (++n > MAX_CHANNELS) break
      clean[k] = Math.round(v * 1000) / 1000
    }
    if (n > 0) out.push(clean)
  }
  out.sort((a, b) => a.t - b.t)
  return { samples: out }
}

export function cleanUnits(raw: unknown): Units | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Units = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (CHANNEL.test(k) && typeof v === 'string' && v.length <= 12) out[k] = v
  }
  return Object.keys(out).length ? out : null
}

// ——— Thinning for the public chart ———

/**
 * Reduces samples to at most `max` points by time buckets, keeping each channel's highest value
 * in a bucket (so pressure peaks survive). Returns rows of [t, ch1, ch2, …] in `channels` order.
 */
export function thin(samples: Sample[], channels: string[], max = 600): (number | null)[][] {
  if (samples.length <= max) return samples.map((s) => [s.t, ...channels.map((c) => (c in s ? s[c] : null))])
  const t0 = samples[0].t
  const span = samples[samples.length - 1].t - t0 || 1
  const buckets: (number | null)[][] = []
  for (const s of samples) {
    const i = Math.min(max - 1, Math.floor(((s.t - t0) / span) * max))
    const b = (buckets[i] ??= [s.t, ...channels.map(() => null)])
    channels.forEach((c, j) => {
      if (!(c in s)) return
      const cur = b[j + 1]
      if (cur == null || s[c] > cur) b[j + 1] = s[c]
    })
  }
  return buckets.filter(Boolean)
}

// ——— Test summary from the readings ———

const G0 = 9.80665 // m/s² — kgf to newtons

export interface TestSummary {
  samples: number
  channels: string[]
  units: Units
  from: number
  to: number
  burn: { start: number; end: number; seconds: number; basis: 'thrust' | 'chamber' } | null
  thrust: { peakKg: number; peakN: number; peakAt: number; avgKg: number; avgN: number; impulseNs: number; motorClass: string } | null
  chamber: { peak: number; peakAt: number; avg: number; unit: string } | null
}

/** Motor class from total impulse (N·s): A is up to 2.5 N·s and each letter doubles. */
export function motorClass(ns: number): string {
  if (!(ns > 0)) return '—'
  if (ns <= 2.5) return 'A'
  const i = Math.ceil(Math.log2(ns / 2.5))
  return i < 26 ? String.fromCharCode(65 + i) : '—'
}

/**
 * Works out the burn from the readings: the burn runs from the first to the last reading above
 * 5% of peak thrust (at least 0.5 kg), or of peak chamber pressure if there's no load cell.
 * Impulse is the area under the thrust curve over that window (trapezoids), in N·s.
 */
export function summarize(samples: Sample[], units: Units = {}): TestSummary | null {
  if (!samples.length) return null
  const s = [...samples].sort((a, b) => a.t - b.t)
  const channels = [...new Set(s.flatMap((x) => Object.keys(x).filter((k) => k !== 't')))]
  const peakOf = (ch: string) => {
    let peak = -Infinity
    let at = 0
    for (const x of s) if (ch in x && x[ch] > peak) [peak, at] = [x[ch], x.t]
    return peak === -Infinity ? null : { peak, at }
  }
  const window = (ch: string, floor: number) => {
    const p = peakOf(ch)
    if (!p || p.peak <= floor) return null
    const th = Math.max(floor, p.peak * 0.05)
    const above = s.filter((x) => ch in x && x[ch] >= th)
    if (above.length < 2) return null
    return { start: above[0].t, end: above[above.length - 1].t }
  }
  const tw = channels.includes('thrust') ? window('thrust', 0.5) : null
  const cw = !tw && channels.includes('chamber') ? window('chamber', 5) : null
  const w = tw ?? cw
  const burn = w ? { ...w, seconds: Math.round((w.end - w.start) / 10) / 100, basis: (tw ? 'thrust' : 'chamber') as 'thrust' | 'chamber' } : null

  let thrust: TestSummary['thrust'] = null
  const tp = peakOf('thrust')
  if (tp) {
    let impulseKgS = 0
    if (burn) {
      const inBurn = s.filter((x) => 'thrust' in x && x.t >= burn.start && x.t <= burn.end)
      for (let i = 1; i < inBurn.length; i++) {
        const dt = (inBurn[i].t - inBurn[i - 1].t) / 1000
        if (dt > 0 && dt < 2) impulseKgS += ((Math.max(0, inBurn[i].thrust) + Math.max(0, inBurn[i - 1].thrust)) / 2) * dt
      }
    }
    const impulseNs = impulseKgS * G0
    const avgKg = burn && burn.seconds > 0 ? impulseKgS / burn.seconds : 0
    const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d
    thrust = {
      peakKg: r(tp.peak),
      peakN: r(tp.peak * G0, 1),
      peakAt: tp.at,
      avgKg: r(avgKg),
      avgN: r(avgKg * G0, 1),
      impulseNs: r(impulseNs, 1),
      motorClass: motorClass(impulseNs),
    }
  }

  let chamber: TestSummary['chamber'] = null
  const cp = peakOf('chamber')
  if (cp) {
    const inBurn = burn ? s.filter((x) => 'chamber' in x && x.t >= burn.start && x.t <= burn.end) : []
    const avg = inBurn.length ? inBurn.reduce((t, x) => t + x.chamber, 0) / inBurn.length : 0
    chamber = { peak: Math.round(cp.peak * 10) / 10, peakAt: cp.at, avg: Math.round(avg * 10) / 10, unit: units.chamber ?? 'psi' }
  }

  return { samples: s.length, channels, units, from: s[0].t, to: s[s.length - 1].t, burn, thrust, chamber }
}

/** All of a test's readings, oldest first, with the channels' units. */
export async function testSamples(db: Db, testId: string): Promise<{ samples: Sample[]; units: Units }> {
  const rows = await db.query<{ samples: Sample[] | string; units: Units | string | null }>(
    'select samples, units from telemetry where test_id = $1 order by id',
    [testId],
  )
  const parse = <T,>(v: T | string): T => (typeof v === 'string' ? (JSON.parse(v) as T) : v)
  const samples: Sample[] = []
  let units: Units = {}
  for (const r of rows) {
    samples.push(...parse(r.samples))
    if (r.units) units = { ...units, ...parse(r.units) }
  }
  samples.sort((a, b) => a.t - b.t)
  return { samples, units }
}
