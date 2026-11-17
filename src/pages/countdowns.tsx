import { useEffect, useMemo, useState } from 'react'
import { AddTime } from '../components/AddTime'
import { useEditor } from '../components/Editor'
import { Badge, Button, Empty } from '../components/ui'
import { fmtDate, fmtTime12, parseTime } from '../lib/derive'
import { href } from '../lib/router'
import { byType, labelOf, toneOf } from '../lib/schema'
import { useRecords } from '../lib/store'
import type { Rec } from '../lib/types'

export type Countdown = {
  name: string
  date: string
  time?: string
  category?: string
  public?: 'shown' | 'hidden'
  notes?: string
  status?: string
  /** Exact T-0 (ms) after a hold, valid while date/time still match `t0For`. */
  t0?: number
  t0For?: string
  /** Time left on the clock while on Hold (ms). */
  holdLeft?: number
}

const C = byType.get('countdown')!
const CATEGORY = C.fields.find((f) => f.key === 'category')!.options

/** Target moment in the viewer's local time. Time is optional and may be 12- or 24-hour. */
export function targetOf(d: Countdown): number {
  if (typeof d.t0 === 'number' && d.t0For === `${d.date ?? ''}|${d.time ?? ''}`) return d.t0
  const [y, m, day] = d.date.split('-').map(Number)
  const [hh, mm] = (parseTime(d.time ?? '') ?? '00:00').split(':').map(Number)
  return new Date(y!, m! - 1, day!, hh!, mm!).getTime()
}

/**
 * Time left on a held clock (ms), or undefined if it isn't on Hold. Holds saved before the clock
 * stopped have no `holdLeft`; for those, the record's last save stands in for when the hold began.
 */
export function heldOf(rec: { data: Countdown; updatedAt?: string }): number | undefined {
  const d = rec.data
  if (d.status !== 'hold') return undefined
  if (typeof d.holdLeft === 'number') return d.holdLeft
  return rec.updatedAt && d.date ? targetOf(d) - Date.parse(rec.updatedAt) : undefined
}

/** Re-renders every second while mounted. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "T−12d 04:33:21" before, "T+00:12:09" after. */
export function tClock(diff: number): { sign: '−' | '+'; days: number; hms: string } {
  const sign = diff >= 0 ? '−' : '+'
  let s = Math.floor(Math.abs(diff) / 1000)
  const days = Math.floor(s / 86400)
  s -= days * 86400
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return { sign, days, hms: `${pad(h)}:${pad(m)}:${pad(s % 60)}` }
}

/** A T− clock. Pass `held` (ms left) to show it stopped, as when a test is on Hold. */
export function TClock({ target, now, size = 'l', held }: { target: number; now: number; size?: 'l' | 's'; held?: number | null }) {
  const isHeld = held != null
  const t = tClock(isHeld ? held : target - now)
  return (
    <span
      className={`tclock tclock-${size}${t.sign === '+' ? ' past' : ''}${isHeld ? ' held' : ''}`}
      aria-label={`${isHeld ? 'Holding at ' : ''}T ${t.sign === '−' ? 'minus' : 'plus'} ${t.days} days ${t.hms}`}
    >
      {isHeld && <span className="tclock-hold">Hold</span>}
      <span className="tclock-t">T{t.sign}</span>
      {t.days > 0 && (
        <>
          <span className="tclock-n">{t.days}</span>
          <span className="tclock-u">d</span>
        </>
      )}
      <span className="tclock-n">{t.hms}</span>
    </span>
  )
}

function useSorted() {
  const all = useRecords<Countdown>('countdown')
  return useMemo(
    () => all.filter((r) => r.data.date).map((r) => ({ rec: r, at: targetOf(r.data) })).sort((a, b) => a.at - b.at),
    [all],
  )
}

function CountdownCard({ rec, at, now }: { rec: Rec<Countdown>; at: number; now: number }) {
  const openEditor = useEditor()
  const d = rec.data
  const soon = at - now < 7 * 86400000 && at > now
  return (
    <article className={`card countdown${soon ? ' soon' : ''}${at <= now ? ' done' : ''}`}>
      <header className="row between">
        <div className="row gap-s wrap">
          <Badge tone={toneOf(CATEGORY, d.category)}>{labelOf(CATEGORY, d.category)}</Badge>
          {d.public === 'shown' && <Badge tone="good">On website</Badge>}
        </div>
        <Button small variant="ghost" icon="edit" aria-label={`Edit ${d.name}`} onClick={() => openEditor({ type: 'countdown', record: rec as Rec })} />
      </header>
      <h3 className="countdown-name">{d.name}</h3>
      <TClock target={at} now={now} held={heldOf(rec)} />
      <p className="muted small">
        {fmtDate(d.date)}
        {d.time ? ` · ${fmtTime12(d.time)}` : ''}
      </p>
      {d.notes && <p className="small prewrap">{d.notes}</p>}
      {at > now - 3600000 && <AddTime rec={rec as Rec} compact />}
    </article>
  )
}

export function CountdownsPage() {
  const list = useSorted()
  const now = useNow()
  const openEditor = useEditor()
  const [showPast, setShowPast] = useState(false)
  const upcoming = list.filter((x) => x.at > now - 3600000) // keep T+ visible for an hour
  const past = list.filter((x) => x.at <= now - 3600000).reverse()

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Countdowns</h1>
          <p className="muted">{C.blurb}</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => openEditor({ type: 'countdown' })}>Add countdown</Button>
      </header>

      {upcoming.length === 0 ? (
        <Empty
          title="Nothing coming up"
          action={<Button variant="primary" icon="plus" onClick={() => openEditor({ type: 'countdown' })}>Add a countdown</Button>}
        >
          Add launches, static fires, competition entries, grant reports — anything with a date.
        </Empty>
      ) : (
        <div className="cards">
          {upcoming.map((x) => (
            <div key={x.rec.id}>
              <CountdownCard rec={x.rec} at={x.at} now={now} />
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <section>
          <Button variant="ghost" small onClick={() => setShowPast((s) => !s)}>
            {showPast ? 'Hide' : 'Show'} past ({past.length})
          </Button>
          {showPast && (
            <div className="cards past-cards">
              {past.map((x) => (
                <div key={x.rec.id}>
                  <CountdownCard rec={x.rec} at={x.at} now={now} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** Next few countdowns, for the Home page. */
export function NextCountdowns() {
  const list = useSorted()
  const now = useNow()
  const next = list.filter((x) => x.at > now - 3600000).slice(0, 3)
  if (!next.length) return null
  return (
    <section className="next-countdowns" aria-label="Upcoming countdowns">
      {next.map((x) => (
        <a key={x.rec.id} href={href('countdowns')} className="card next-cd">
          <span className="row between gap-s">
            <span className="strong next-cd-name">{x.rec.data.name}</span>
            <Badge tone={toneOf(CATEGORY, x.rec.data.category)}>{labelOf(CATEGORY, x.rec.data.category)}</Badge>
          </span>
          <TClock target={x.at} now={now} size="s" held={heldOf(x.rec)} />
          <span className="muted small">
            {fmtDate(x.rec.data.date)}
            {x.rec.data.time ? ` · ${fmtTime12(x.rec.data.time)}` : ''}
          </span>
        </a>
      ))}
    </section>
  )
}
