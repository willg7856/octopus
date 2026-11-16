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
