import { useMemo, useState } from 'react'
import { useEditor } from '../components/Editor'
import { Icon } from '../components/Icon'
import { SensorSummary } from '../components/SensorSummary'
import { Badge, Button, LinkButton, useToast } from '../components/ui'
import { newId } from '../lib/api'
import { fmtDate } from '../lib/derive'
import { SITE_SEED } from '../lib/siteSeed'
import { useRecords, useStore } from '../lib/store'
import type { Op, Rec } from '../lib/types'

/**
 * The test log: every static fire, grouped by campaign, with results, data and what we learned.
 * Published entries make up the test log on the Tests page of beyondstagezero.com. A firing
 * linked to its test countdown gets its numbers from the sensor data recorded that day.
 */

type Campaign = { code: string; engine?: string; dateLabel?: string; order?: number; objective?: string; photos?: string; drive?: string }
type Firing = {
  code: string
  campaign?: string
  date?: string
  result?: 'success' | 'partial' | 'failure'
  test?: string
  engine?: string
  grade?: string
  propellant?: string
  mass?: string
  burnTime?: string
  peakThrust?: string
  impulse?: string
  peakPressure?: string
  observations?: string
  learned?: string
  photo?: string
  video?: string
  drive?: string
  status?: 'published' | 'draft'
  notes?: string
}

const SITE = 'https://beyondstagezero.com'
const RESULT = {
  success: { label: 'Success', tone: 'good' },
  partial: { label: 'Partial', tone: 'warn' },
  failure: { label: 'Failure', tone: 'bad' },
} as const

export function TestLogPage() {
  const campaigns = useRecords<Campaign>('campaign')
  const firings = useRecords<Firing>('firing')
  const { commit } = useStore()
  const openEditor = useEditor()
  const toast = useToast()
  const [importing, setImporting] = useState(false)

  const sortedCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => (Number(a.data.order) || 999) - (Number(b.data.order) || 999)),
    [campaigns],
  )
  const byCampaign = useMemo(() => {
    const m = new Map<string, Rec<Firing>[]>()
    for (const f of [...firings].sort((a, b) => String(b.data.date ?? '').localeCompare(String(a.data.date ?? '')) || b.data.code.localeCompare(a.data.code))) {
      const k = f.data.campaign && campaigns.some((c) => c.id === f.data.campaign) ? f.data.campaign : ''
      m.set(k, [...(m.get(k) ?? []), f])
    }
    return m
  }, [firings, campaigns])
  const published = firings.filter((f) => f.data.status === 'published').length
  const nextOrder = Math.min(1, ...campaigns.map((c) => Number(c.data.order) || 1)) - 1

  const importSite = async () => {
    setImporting(true)
    const ids = new Map(SITE_SEED.testLog.campaigns.map((c) => [c.code, newId()]))
    const ops: Op[] = [
      ...SITE_SEED.testLog.campaigns.map((c) => ({ op: 'create' as const, id: ids.get(c.code)!, type: 'campaign', data: { ...c } })),
      ...SITE_SEED.testLog.fires.map((f) => ({
        op: 'create' as const,
        id: newId(),
        type: 'firing',
        data: { ...f, campaign: ids.get(f.campaign) ?? '' },
      })),
    ]
    try {
      await commit(ops)
      toast('Imported. The Tests page now reads its test log from Octopus.', { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    } finally {
      setImporting(false)
    }
  }

  const groups: { campaign: Rec<Campaign> | null; items: Rec<Firing>[] }[] = [
    ...sortedCampaigns.map((c) => ({ campaign: c, items: byCampaign.get(c.id) ?? [] })),
    ...(byCampaign.get('')?.length ? [{ campaign: null, items: byCampaign.get('')! }] : []),
  ]

  return (
    <div className="page testlog-page">
      <header className="page-head">
        <div>
          <h1>Test log</h1>
          <p className="muted">
            Every static fire: results, data and what we learned. Published entries are the test log on the{' '}
            <a href={`${SITE}/tests`} target="_blank" rel="noreferrer">Tests page</a>
            {firings.length ? ` (${published} of ${firings.length} published)` : ''}.
          </p>
        </div>
        <div className="row gap-s wrap">
          <LinkButton href={`${SITE}/tests`} external icon="external">Open the Tests page</LinkButton>
          <Button icon="plus" onClick={() => openEditor({ type: 'campaign', initial: { order: nextOrder } })}>Add campaign</Button>
          <Button variant="primary" icon="plus" onClick={() => openEditor({ type: 'firing', initial: { status: 'draft' } })}>Add test</Button>
        </div>
      </header>

      {campaigns.length + firings.length === 0 && (
        <section className="card site-import">
          <div>
            <p className="strong">Start from what’s on the website</p>
            <p className="muted small">
              The Tests page still shows its built-in log: {SITE_SEED.testLog.campaigns.length} campaigns and {SITE_SEED.testLog.fires.length} static
              fires. Bring them into Octopus once, and from then on you add and edit tests here.
            </p>
          </div>
          <Button variant="primary" onClick={importSite} disabled={importing}>{importing ? 'Bringing them in…' : 'Bring them in'}</Button>
        </section>
      )}

      {groups.map(({ campaign, items }) => (
        <section key={campaign?.id ?? 'none'} className="testlog-campaign">
          <header className="testlog-campaign-head">
            <div>
              <h2>
                {campaign ? (
                  <>
                    {campaign.data.code}
                    {campaign.data.engine && <span className="muted"> · {campaign.data.engine}</span>}
                    {campaign.data.dateLabel && <span className="muted small"> · {campaign.data.dateLabel}</span>}
                  </>
                ) : (
                  'No campaign'
                )}
              </h2>
              {campaign?.data.objective && <p className="muted small">{campaign.data.objective}</p>}
            </div>
            {campaign && (
              <div className="row gap-s wrap">
                {campaign.data.drive && <LinkButton href={campaign.data.drive} external icon="external">Drive</LinkButton>}
                <Button small variant="ghost" icon="edit" onClick={() => openEditor({ type: 'campaign', record: campaign as Rec })}>Edit</Button>
                <Button small icon="plus" onClick={() => openEditor({ type: 'firing', initial: { campaign: campaign.id, status: 'draft', engine: campaign.data.engine } })}>
                  Add test
                </Button>
              </div>
            )}
          </header>
          {items.length === 0 ? (
            <p className="muted small">No tests in this campaign yet.</p>
          ) : (
            <div className="testlog-list">
              {items.map((f) => (
                <FiringCard key={f.id} f={f} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function FiringCard({ f }: { f: Rec<Firing> }) {
  const { update } = useStore()
  const openEditor = useEditor()
  const toast = useToast()
  const [showData, setShowData] = useState(false)
  const countdowns = useRecords<{ name?: string }>('countdown')
  const d = f.data
  const r = RESULT[d.result ?? 'partial'] ?? RESULT.partial
  const test = d.test ? countdowns.find((c) => c.id === d.test) : undefined
  const specs: [string, string | undefined][] = [
    ['Burn time', d.burnTime],
    ['Peak thrust', d.peakThrust],
    ['Total impulse', d.impulse],
    ['Peak pressure', d.peakPressure],
    ['Propellant', [d.propellant, d.mass].filter(Boolean).join(' · ') || undefined],
  ]
  const fill = async (fields: Record<string, string>) => {
    try {
      await update(f as Rec, { ...d, ...fields })
      toast(`${d.code}: filled in from the sensor data`, { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  return (
    <article className={`card testlog-fire${d.status === 'draft' ? ' draft' : ''}`}>
      <header className="testlog-fire-head">
        <button className="testlog-fire-title" onClick={() => openEditor({ type: 'firing', record: f as Rec })} title="Edit">
          <span className="testlog-code">{d.code}</span>
          <span className="muted small">{d.date ? fmtDate(d.date) : ''}{d.engine ? ` · ${d.engine}` : ''}</span>
        </button>
        <div className="row gap-s wrap">
          <Badge tone={r.tone}>{r.label}</Badge>
          {d.status === 'published' ? <Badge tone="good">Published</Badge> : <Badge>Draft</Badge>}
        </div>
      </header>
      <dl className="testlog-specs">
        {specs.filter(([, v]) => v && v !== '—').map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {d.learned && <p className="small testlog-learned"><span className="muted">Learned: </span>{d.learned}</p>}
      <div className="row gap-s wrap testlog-links">
        <Button small variant="ghost" icon="edit" onClick={() => openEditor({ type: 'firing', record: f as Rec })}>Edit</Button>
        {d.drive && <LinkButton href={d.drive} external icon="external">Google Drive</LinkButton>}
        {d.video && <LinkButton href={d.video} external icon="play">Video</LinkButton>}
        {d.test ? (
          <Button small variant={showData ? 'default' : 'ghost'} onClick={() => setShowData(!showData)}>
            <Icon name="chart" size={14} /> {showData ? 'Hide sensor data' : `Sensor data${test?.data.name ? ` · ${test.data.name}` : ''}`}
          </Button>
        ) : (
          <span className="muted small">Link its test countdown (Edit → Countdown / sensor data) to get burn time, thrust and impulse from the readings.</span>
        )}
      </div>
      {showData && d.test && <SensorSummary testId={d.test} name={d.code} onFill={fill} />}
    </article>
  )
}
