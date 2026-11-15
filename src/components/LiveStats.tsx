import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtAgo, fmtDate, fmtMoney, movementDelta, orderTotal, personName, useStock } from '../lib/derive'
import { useRecords, useStore } from '../lib/store'
import type { Desktop, Item, Movement, Order } from '../lib/types'

const DAY = 86_400_000

function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Australian financial year start (1 July) for today. */
function fyStart(now = new Date()): string {
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}-07-01`
}

/** Counts from the previous value to the new one. Skips the animation for reduced motion. */
function useCountUp(target: number, ms = 900): number {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = from.current
    if (reduce || start === target) {
      from.current = target
      setShown(target)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - k, 3)
      const v = start + (target - start) * eased
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = target
    }
  }, [target, ms])
  return shown
}

function Counter({ value, format = (n) => Math.round(n).toLocaleString('en-AU') }: { value: number; format?: (n: number) => string }) {
  const v = useCountUp(value)
  return <>{format(v)}</>
}

interface Tile {
  label: string
  value: number
  format?: (n: number) => string
  sub: string
}

export function LiveStats() {
  const movements = useRecords<Movement>('movement')
  const items = useRecords<Item>('item')
  const orders = useRecords<Order>('order')
  const desktops = useRecords<Desktop>('desktop')
  const stock = useStock()
  const { records, lastSync } = useStore()

  const s = useMemo(() => {
    const now = new Date()
    const today = localDay(now)
    const monthStart = today.slice(0, 8) + '01'
    const weekAgo = localDay(new Date(now.getTime() - 6 * DAY))
    const fy = fyStart(now)
    const dayOf = (m: { data: Movement; createdAt: string }) => m.data.date ?? localDay(new Date(m.createdAt))

    const builds = movements.filter((m) => m.data.kind === 'made')
    const builtAll = builds.reduce((t, m) => t + Math.abs(Number(m.data.qty) || 0), 0)
    const builtMonth = builds.filter((m) => dayOf(m) >= monthStart).reduce((t, m) => t + Math.abs(Number(m.data.qty) || 0), 0)
    const buildsWeek = builds.filter((m) => dayOf(m) >= weekAgo).length
    const lastBuild = [...builds].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

    let units = 0
    let value = 0
    for (const it of items) {
      const q = Math.max(0, stock.get(it.id) ?? 0)
      units += q
      if (it.data.unitCost) value += q * it.data.unitCost
    }

    const delivered = orders.filter((o) => o.data.status === 'received')
    const spentFy = delivered
      .filter((o) => (o.data.receivedAt ?? localDay(new Date(o.updatedAt))) >= fy)
      .reduce((t, o) => t + orderTotal(o.data), 0)

    const monthAgo = new Date(now.getTime() - 30 * DAY).toISOString()
    const people = new Set<string>()
    for (const r of records.values()) if (r.updatedAt >= monthAgo && r.updatedBy) people.add(r.updatedBy)

    // Parts built per day, last 30 days
    const days: { day: string; qty: number; entries: number }[] = []
    for (let i = 29; i >= 0; i--) days.push({ day: localDay(new Date(now.getTime() - i * DAY)), qty: 0, entries: 0 })
    const idx = new Map(days.map((d, i) => [d.day, i]))
    for (const m of builds) {
      const i = idx.get(dayOf(m))
      if (i != null) {
        days[i]!.qty += movementDelta(m.data)
        days[i]!.entries++
      }
    }

    const tiles: Tile[] = [
      { label: 'Parts built', value: builtAll, sub: builtMonth ? `+${builtMonth.toLocaleString('en-AU')} this month` : 'all time' },
      {
        label: 'Builds this week',
        value: buildsWeek,
        sub: lastBuild ? `last by ${lastBuild.data.by || personName(lastBuild.createdBy)}, ${fmtAgo(lastBuild.createdAt)}` : 'none logged yet',
      },
      { label: 'Units on the shelf', value: units, sub: value ? `${fmtMoney(value, true)} of stock` : `${items.length} items tracked` },
      { label: `Spent FY${String(Number(fy.slice(2, 4)) + 1)}`, value: spentFy, format: (n) => fmtMoney(n, true), sub: `${delivered.length} order${delivered.length === 1 ? '' : 's'} delivered` },
      { label: 'Machines in use', value: desktops.filter((d) => d.data.inUseBy).length, format: (n) => `${Math.round(n)}/${desktops.length}`, sub: 'remote desktops' },
      { label: 'Active this month', value: people.size, sub: people.size === 1 ? 'person editing' : 'people editing' },
    ]
    return { tiles, days, builtLast30: days.reduce((t, d) => t + d.qty, 0) }
  }, [movements, items, orders, desktops, stock, records])

  return (
    <section className="live" aria-label="BSZ live statistics">
      <header className="live-head">
        <span className="live-title">
          <span className="live-dot" aria-hidden="true" /> BSZ live
        </span>
        <span className="live-sync">{lastSync ? `updated ${fmtAgo(lastSync.toISOString())}` : 'loading…'}</span>
      </header>
      <div className="live-grid">
        {s.tiles.map((t) => (
          <div key={t.label} className="live-tile">
            <span className="live-label">{t.label}</span>
            <span className="live-value">
              <Counter value={t.value} format={t.format} />
            </span>
            <span className="live-sub">{t.sub}</span>
          </div>
        ))}
      </div>
      <BuildChart days={s.days} total={s.builtLast30} />
    </section>
  )
}

function BuildChart({ days, total }: { days: { day: string; qty: number; entries: number }[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.qty))
  const W = 600
  const H = 72
  const gap = 2
  const bw = W / days.length - gap
  const h = hover != null ? days[hover]! : null

  return (
    <figure className="live-chart">
      <figcaption>
        <span className="live-label">Parts built · last 30 days</span>
        <span className="live-chart-readout" aria-live="polite">
          {h ? (
            <>
              <strong>{h.qty}</strong> on {fmtDate(h.day)}
              {h.entries > 0 && ` · ${h.entries} build${h.entries > 1 ? 's' : ''}`}
            </>
          ) : (
            <>
              <strong>{total}</strong> total
            </>
          )}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Parts built per day over the last 30 days, ${total} in total`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="live-axis" />
        {days.map((d, i) => {
          const x = i * (bw + gap)
          const bh = d.qty > 0 ? Math.max(3, (d.qty / max) * (H - 6)) : 0
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}>
              {/* Full-height hit target, bigger than the bar */}
              <rect x={x} y={0} width={bw + gap} height={H} fill="transparent" />
              {bh > 0 ? (
                <path
                  className={`live-bar${hover === i ? ' on' : ''}`}
                  d={`M${x},${H} V${H - bh + 2} q0,-2 2,-2 h${bw - 4} q2,0 2,2 V${H} Z`}
                />
              ) : (
                <rect x={x} y={H - 2} width={bw} height={1} className="live-zero" />
              )}
            </g>
          )
        })}
      </svg>
      <div className="live-chart-axis" aria-hidden="true">
        <span>{fmtDate(days[0]!.day).slice(0, 5)}</span>
        <span>today</span>
      </div>
    </figure>
  )
}
