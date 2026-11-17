import { useEffect, useMemo, useRef, useState } from 'react'
import { useDialog } from '../components/Dialog'
import { useEditor } from '../components/Editor'
import { Icon } from '../components/Icon'
import { RangePanel } from '../components/RangePanel'
import { Badge, Button, Empty, LinkButton, useToast } from '../components/ui'
import { fmtDate, fmtTime12 } from '../lib/derive'
import { setParam, useRoute } from '../lib/router'
import { useRecords, useStore } from '../lib/store'
import type { Rec } from '../lib/types'
import { heldOf, targetOf, TClock, useNow, type Countdown } from './countdowns'

type TestCountdown = Countdown & { status?: Status; stream?: string; result?: string }
type Status = 'scheduled' | 'hold' | 'live' | 'done' | 'scrubbed'
type LiveUpdate = { text: string; test: string; kind: Kind }
type Kind = 'update' | 'milestone' | 'hold' | 'go' | 'result'

const SPACE = 'https://beyondstagezero.space'

const STATUSES: { value: Status; label: string; tone: 'neutral' | 'warn' | 'bad' | 'good'; post?: { text: string; kind: Kind } }[] = [
  { value: 'scheduled', label: 'Scheduled', tone: 'neutral' },
  { value: 'hold', label: 'Hold', tone: 'warn', post: { text: 'We are holding.', kind: 'hold' } },
  { value: 'live', label: 'Live', tone: 'bad', post: { text: 'We are live.', kind: 'go' } },
  { value: 'done', label: 'Complete', tone: 'good', post: { text: 'Test complete.', kind: 'result' } },
  { value: 'scrubbed', label: 'Scrubbed', tone: 'neutral', post: { text: 'Today’s test has been scrubbed.', kind: 'hold' } },
]

const KINDS: { value: Kind; label: string }[] = [
  { value: 'update', label: 'Update' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'go', label: 'Go' },
  { value: 'hold', label: 'Hold' },
  { value: 'result', label: 'Result' },
]

const H = 3_600_000

/**
 * Open on the test beyondstagezero.space is showing (same order as /api/public/live): a Live/Hold
 * test, else one finished in the last 12 hours, else the next scheduled one.
 */
function defaultTest(tests: { rec: Rec<TestCountdown>; at: number }[], now: number) {
  const byTouched = (a: { rec: Rec<TestCountdown> }, b: { rec: Rec<TestCountdown> }) => b.rec.updatedAt.localeCompare(a.rec.updatedAt)
  const active = tests.filter((t) => t.rec.data.status === 'live' || t.rec.data.status === 'hold').sort(byTouched)
  if (active[0]) return active[0]
  const justFinished = tests
    .filter((t) => (t.rec.data.status === 'done' || t.rec.data.status === 'scrubbed') && now - Date.parse(t.rec.updatedAt) < 12 * H)
    .sort(byTouched)
  if (justFinished[0]) return justFinished[0]
  const next = tests.filter((t) => (t.rec.data.status ?? 'scheduled') === 'scheduled' && t.at > now - 6 * H).sort((a, b) => a.at - b.at)
  return next[0] ?? tests.sort((a, b) => b.at - a.at)[0]
}

export function TestDayPage() {
  const countdowns = useRecords<TestCountdown>('countdown')
  const updates = useRecords<LiveUpdate>('liveupdate')
  const { params } = useRoute()
  const now = useNow()
  const openEditor = useEditor()

  const tests = useMemo(
    () =>
      countdowns
        .filter((c) => (c.data.category === 'test' || c.data.category === 'launch') && c.data.date)
        .map((rec) => ({ rec, at: targetOf(rec.data) })),
    [countdowns],
  )
  const chosenId = params.get('test')
  const chosen = (chosenId && tests.find((t) => t.rec.id === chosenId)) || defaultTest([...tests], now)

  if (!chosen) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <p className="eyebrow">.space</p>
            <h1>Live test page</h1>
            <p className="muted">Run a test live on <a href={SPACE} target="_blank" rel="noreferrer">beyondstagezero.space</a>.</p>
          </div>
        </header>
        <Empty
          title="No tests yet"
          action={
            <Button variant="primary" icon="plus" onClick={() => openEditor({ type: 'countdown', initial: { category: 'test', public: 'shown' } })}>
              Add a test
            </Button>
          }
        >
          Add a countdown with the type “Test / static fire” and it appears here, ready to run live.
        </Empty>
      </div>
    )
  }

  return <TestConsole test={chosen.rec} at={chosen.at} tests={tests} updates={updates} now={now} />
}

function TestConsole({
  test,
  at,
  tests,
  updates,
  now,
}: {
  test: Rec<TestCountdown>
  at: number
  tests: { rec: Rec<TestCountdown>; at: number }[]
  updates: Rec<LiveUpdate>[]
  now: number
}) {
  const { update, create, remove } = useStore()
  const openEditor = useEditor()
  const dialog = useDialog()
  const toast = useToast()
  const d = test.data
  const status: Status = d.status ?? 'scheduled'
  const isPublic = d.public === 'shown'
  const log = updates.filter((u) => u.data.test === test.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const [text, setText] = useState('')
  const [kind, setKind] = useState<Kind>('update')
  const [stream, setStream] = useState(d.stream ?? '')
  const [result, setResult] = useState(d.result ?? '')
  const [posting, setPosting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setStream(d.stream ?? '')
    setResult(d.result ?? '')
  }, [test.id, d.stream, d.result])

  const save = async (patch: Partial<TestCountdown>) => {
    try {
      await update(test as Rec, { ...d, ...patch })
      return true
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
      return false
    }
  }

  const post = async (t: string, k: Kind) => {
    const body = t.trim()
    if (!body) return
    setPosting(true)
    try {
      await create('liveupdate', { text: body, test: test.id, kind: k })
      setText('')
      setKind('update')
      inputRef.current?.focus()
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    } finally {
      setPosting(false)
    }
  }

  const setStatus = async (s: (typeof STATUSES)[number]) => {
    if (s.value === status) return
    if (!(await save({ status: s.value }))) return
    if (s.post) await post(s.post.text, s.post.kind)
    toast(`Status: ${s.label}`, { tone: s.tone === 'bad' ? 'good' : 'neutral' })
  }

  const others = tests.filter((t) => t.rec.id !== test.id).sort((a, b) => b.at - a.at)

  return (
    <div className="page testday">
      <header className="page-head">
        <div>
          <p className="eyebrow">.space · live test page</p>
          <h1>{d.name}</h1>
          <p className="muted">
            {fmtDate(d.date)}
            {d.time ? ` · ${fmtTime12(d.time)}` : ''} · what you do here shows on{' '}
            <a href={SPACE} target="_blank" rel="noreferrer">beyondstagezero.space</a> within seconds.
          </p>
        </div>
        <div className="row gap-s wrap">
          {others.length > 0 && (
            <select className="select-sm" aria-label="Switch test" value={test.id} onChange={(e) => setParam('test', e.target.value)}>
              <option value={test.id}>{d.name}</option>
              {others.map((t) => (
                <option key={t.rec.id} value={t.rec.id}>
                  {t.rec.data.name} · {fmtDate(t.rec.data.date)}
                </option>
              ))}
            </select>
          )}
          <Button icon="edit" onClick={() => openEditor({ type: 'countdown', record: test as Rec })}>Edit test</Button>
          <LinkButton href={SPACE} external icon="external">Open .space</LinkButton>
        </div>
      </header>

      {!isPublic && (
        <div className="drawer-error testday-warn">
          <Icon name="alert" />
          <div>
            <p>This test is team-only, so it isn’t on beyondstagezero.space.</p>
            <Button small variant="primary" onClick={() => save({ public: 'shown' })}>Show it publicly</Button>
          </div>
        </div>
      )}

      <OnSpace testId={test.id} isPublic={isPublic} />

      <section className={`card testday-status status-${status}`}>
        <div className="testday-clock">
          <TClock target={at} now={now} held={heldOf(test)} />
          <Badge tone={STATUSES.find((s) => s.value === status)?.tone}>{STATUSES.find((s) => s.value === status)?.label}</Badge>
        </div>
        <div className="testday-buttons" role="group" aria-label="Test status">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              className={`testday-btn tone-${s.tone}${s.value === status ? ' on' : ''}`}
              aria-pressed={s.value === status}
              onClick={() => setStatus(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="muted small">Changing status also posts an update (Hold, Live, Complete, Scrubbed) — delete it below if you don’t want it.</p>
      </section>

      <RangePanel test={test as Rec} now={now} />

      <div className="testday-grid">
        <section className="card testday-compose">
          <h2 className="card-title">Post an update</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              post(text, kind)
            }}
          >
            <input
              ref={inputRef}
              className="testday-input"
              placeholder="e.g. Igniter armed. Range is clear."
              value={text}
              maxLength={280}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <div className="row between wrap gap-s">
              <div className="chips" role="radiogroup" aria-label="Update type">
                {KINDS.map((k) => (
                  <button
                    type="button"
                    key={k.value}
                    role="radio"
                    aria-checked={kind === k.value}
                    className={`chip${kind === k.value ? ' on' : ''}`}
                    onClick={() => {
                      setKind(k.value)
                      inputRef.current?.focus() // keep typing / Enter to post
                    }}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <Button variant="primary" type="submit" disabled={posting || !text.trim()}>
                {posting ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </form>

          <ul className="testday-log">
            {log.length === 0 && <li className="muted small">No updates yet. They appear on .space newest first.</li>}
            {log.map((u) => (
              <li key={u.id} className={`kind-${u.data.kind}`}>
                <span className="testday-time">
                  {new Date(u.createdAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="testday-kind">{KINDS.find((k) => k.value === u.data.kind)?.label}</span>
                <span className="testday-text">{u.data.text}</span>
                <Button
                  small
                  variant="ghost"
                  icon="trash"
                  aria-label="Delete update"
                  onClick={async () => {
                    if (!(await dialog.confirm({ title: 'Delete this update?', message: u.data.text, confirmLabel: 'Delete', danger: true }))) return
                    remove(u as Rec).catch((e) => toast((e as Error).message, { tone: 'bad' }))
                  }}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="card testday-side">
          <h2 className="card-title">Livestream</h2>
          <form
            className="row gap-s"
            onSubmit={async (e) => {
              e.preventDefault()
              if (await save({ stream: stream.trim() || undefined })) toast('Stream link saved', { tone: 'good' })
            }}
          >
            <input type="url" placeholder="https://youtube.com/live/…" value={stream} onChange={(e) => setStream(e.target.value)} />
            <Button type="submit">Save</Button>
          </form>
          <p className="muted small">YouTube links play right on the page; other links show a “Watch” button.</p>

          <h2 className="card-title an-gap">Result</h2>
          <textarea rows={4} placeholder="What happened — shown on .space once the test is complete." value={result} onChange={(e) => setResult(e.target.value)} />
          <div className="row gap-s">
            <Button
              onClick={async () => {
                if (await save({ result: result.trim() || undefined })) toast('Result saved', { tone: 'good' })
              }}
            >
              Save result
            </Button>
          </div>
        </section>
      </div>

      <SpacePreview />
    </div>
  )
}

type Feed = { current: { id: string; name: string; status: string; updates: unknown[] } | null }
const FEED_LABEL: Record<string, string> = { scheduled: 'Scheduled', hold: 'Hold', live: 'Live', done: 'Complete', scrubbed: 'Scrubbed' }

/** What beyondstagezero.space is showing right now, straight from its public feed. */
function OnSpace({ testId, isPublic }: { testId: string; isPublic: boolean }) {
  const [feed, setFeed] = useState<Feed | null | undefined>(undefined)
  useEffect(() => {
    let stop = false
    const load = () =>
      fetch('/api/public/live', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((f) => !stop && setFeed(f))
        .catch(() => !stop && setFeed(null))
    load()
    const t = setInterval(load, 5_000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [])
  if (feed === undefined) return null
  const c = feed?.current
  const thisOne = c?.id === testId
  return (
    <section className={`card space-onair${thisOne ? ' on' : ''}`}>
      <span className={`space-dot${c && (c.status === 'live' || c.status === 'hold') ? ' space-dot-live' : ''}`} aria-hidden="true" />
      <div>
        <p className="muted small">On beyondstagezero.space right now</p>
        <p className="space-onair-name">
          {feed === null ? 'Can’t reach the public feed' : c ? `${c.name} · ${FEED_LABEL[c.status] ?? c.status}` : 'Standby: no test showing'}
        </p>
        {c && !thisOne && isPublic && (
          <p className="muted small">This test isn’t the one showing. Set it to Live or Hold to put it on .space.</p>
        )}
      </div>
    </section>
  )
}

/** The real .space page, framed, so you can see what viewers see. */
function SpacePreview() {
  const [open, setOpen] = useState(false)
  return (
    <section className="card space-preview">
      <div className="row between wrap gap-s">
        <div>
          <h2 className="card-title">Preview</h2>
          <p className="muted small">Exactly what viewers see on beyondstagezero.space. It updates on its own within a couple of seconds.</p>
        </div>
        <Button icon={open ? 'x' : 'monitor'} onClick={() => setOpen(!open)}>{open ? 'Hide preview' : 'Show preview'}</Button>
      </div>
      {open && <iframe className="space-frame" src={SPACE} title="beyondstagezero.space preview" loading="lazy" />}
    </section>
  )
}
