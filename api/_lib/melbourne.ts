/**
 * Countdown dates and times are Creswick wall-clock times with no zone attached.
 * These turn them into real instants (Australia/Melbourne, AEST/AEDT) on the server,
 * matching how beyondstagezero.com reads them.
 */

const TZ = 'Australia/Melbourne'

function offset(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs
}

function parseTime(t: unknown): [number, number] {
  const m = /^\s*(\d{1,2})(?::?(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(String(t ?? ''))
  if (!m) return [0, 0]
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const ap = m[3]?.toLowerCase()
  if (ap === 'a') h = h === 12 ? 0 : h
  else if (ap === 'p') h = h === 12 ? 12 : h + 12
  return [Math.min(h, 23), Math.min(min, 59)]
}

/** The countdown's moment as a UTC timestamp (ms). */
export function melbourneInstant(date: string, time?: unknown): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = parseTime(time)
  const wall = Date.UTC(y!, mo! - 1, d!, h, mi)
  let t = wall - offset(wall)
  t = wall - offset(t) // settle daylight-saving edges
  return t
}

/** Melbourne wall-clock date ("YYYY-MM-DD") and time ("HH:MM") of an instant. */
export function melbourneParts(utcMs: number): { date: string; time: string } {
  const p = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

/**
 * Holds. Putting a test on Hold saves how long was left (`holdLeft`, ms) and every site shows the
 * clock frozen there. Going back to Live or Scheduled moves T-0 to now + that time, saved to the
 * second as `t0`, with date/time updated to match. `t0For` records which date/time `t0` belongs to,
 * so if someone later edits the date or time by hand, that wins.
 */
type CountdownData = Record<string, unknown>
const signature = (d: CountdownData) => `${String(d.date ?? '')}|${String(d.time ?? '')}`

/** The countdown's T-0 as a UTC timestamp (ms), exact to the second after a hold. */
export function countdownInstant(d: CountdownData): number {
  if (typeof d.t0 === 'number' && d.t0For === signature(d)) return d.t0
  return melbourneInstant(String(d.date), d.time)
}

/**
 * Time left on the clock while on Hold (ms; negative if the hold started after T-0), else null.
 * A hold saved before holds stopped the clock has no `holdLeft`; for those, the last time the
 * record was saved (`updatedMs`, normally when Hold was pressed) stands in for when the hold began.
 */
export function holdLeft(d: CountdownData, updatedMs?: number): number | null {
  if (d.status !== 'hold') return null
  if (typeof d.holdLeft === 'number') return d.holdLeft
  if (updatedMs !== undefined && Number.isFinite(updatedMs) && d.date) return countdownInstant(d) - updatedMs
  return null
}

/** Applies hold/resume to a countdown being saved, given what was saved before. */
export function applyHold(before: CountdownData, after: CountdownData, now = Date.now()): CountdownData {
  const was = before.status
  const is = after.status
  const next = { ...after }
  if (is === 'hold' && was !== 'hold' && after.date) {
    next.holdLeft = countdownInstant(before.date ? before : after) - now
  } else if (is === 'hold') {
    // Still holding: keep the frozen time, unless someone just changed the date/time.
    if (signature(after) !== signature(before) && after.date) next.holdLeft = countdownInstant(after) - now
    else if (typeof before.holdLeft === 'number') next.holdLeft = before.holdLeft
  } else if (was === 'hold') {
    const left = typeof before.holdLeft === 'number' ? before.holdLeft : null
    delete next.holdLeft
    if ((is === 'live' || is === 'scheduled') && left !== null && signature(after) === signature(before)) {
      const t0 = now + left
      const { date, time } = melbourneParts(t0)
      next.date = date
      next.time = time
      next.t0 = t0
      next.t0For = signature(next)
    }
  } else {
    delete next.holdLeft
  }
  return next
}
