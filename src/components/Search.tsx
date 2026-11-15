import { useEffect, useMemo, useRef, useState } from 'react'
import { href, navigate } from '../lib/router'
import { byType, COLLECTIONS } from '../lib/schema'
import { useStore } from '../lib/store'
import type { Data } from '../lib/types'
import { useEditor } from './Editor'
import { Icon } from './Icon'

interface Hit {
  id: string
  label: string
  sub?: string
  kind: string
  run: () => void
  score: number
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { records } = useStore()
  const openEditor = useEditor()
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setHi(0)
    }
  }, [open])

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase()
    const words = needle.split(/\s+/).filter(Boolean)
    const actions: Hit[] = [
      { id: 'a-build', label: 'Log a build', kind: 'Action', score: 0, run: () => openEditor({ type: 'movement', initial: { kind: 'made' } }) },
      { id: 'a-use', label: 'Use stock', kind: 'Action', score: 0, run: () => openEditor({ type: 'movement', initial: { kind: 'used' } }) },
      ...COLLECTIONS.map((c) => ({
        id: `new-${c.type}`,
        label: `New ${c.singular.toLowerCase()}`,
        kind: 'Action',
        score: 0,
        run: () => openEditor({ type: c.type }),
      })),
      ...COLLECTIONS.map((c) => ({ id: `go-${c.key}`, label: c.label, kind: 'Go to', score: 0, run: () => navigate(href(c.key)) })),
      { id: 'go-activity', label: 'Activity & restore', kind: 'Go to', score: 0, run: () => navigate(href('activity')) },
      { id: 'go-team', label: 'Team', kind: 'Go to', score: 0, run: () => navigate(href('team')) },
    ]
    if (!words.length) return actions.slice(0, 8)

    const match = (hay: string) => {
      const h = hay.toLowerCase()
      if (!words.every((w) => h.includes(w))) return 0
      return h.startsWith(words[0]!) ? 3 : 1
    }

    const out: Hit[] = []
    for (const a of actions) {
      const s = match(`${a.kind} ${a.label}`)
      if (s) out.push({ ...a, score: s - 0.5 })
    }
    for (const r of records.values()) {
      const c = byType.get(r.type)
      if (!c || r.type === 'movement') continue
      const d = r.data as Data
      const title = c.title(d)
      const sub = c.subtitle?.(d)
      const tScore = match(title)
      const s = tScore ? tScore + 1 : match(`${title} ${sub ?? ''} ${c.searchText?.(d) ?? ''}`)
      if (!s) continue
      out.push({
        id: r.id,
        label: title,
        sub,
        kind: c.singular,
        score: s,
        run: () => {
          if (r.type === 'link' && typeof d.url === 'string') window.open(d.url, '_blank', 'noreferrer')
          else navigate(href(c.key, r.id))
        },
      })
    }
    return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 40)
  }, [q, records, openEditor])

  useEffect(() => setHi(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [hi])

  if (!open) return null

  const go = (h: Hit | undefined) => {
    if (!h) return
    onClose()
    h.run()
  }

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search Octopus">
        <div className="palette-input">
          <Icon name="search" />
          <input
            ref={inputRef}
            autoFocus
            placeholder="Search parts, orders, contacts, processes… or type an action"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setHi((h) => Math.min(h + 1, hits.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setHi((h) => Math.max(h - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                go(hits[hi])
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="palette-list" ref={listRef} role="listbox">
          {hits.length === 0 && <li className="muted palette-empty">No matches for “{q}”</li>}
          {hits.map((h, i) => (
            <li
              key={h.id}
              role="option"
              aria-selected={i === hi}
              className={i === hi ? 'hi' : undefined}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                go(h)
              }}
            >
              <span className="palette-label">
                <span className="strong">{h.label}</span>
                {h.sub && <span className="muted small">{h.sub}</span>}
              </span>
              <span className="palette-kind">{h.kind}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
