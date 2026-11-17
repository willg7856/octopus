import { getDb } from '../_lib/db.js'
import { autoStartDueTests } from '../_lib/autostart.js'
import { countdownInstant, holdLeft } from '../_lib/melbourne.js'
import { HttpError, route } from '../_lib/http.js'

/**
 * GET /api/public/stats — the ONLY unauthenticated data endpoint in Octopus.
 *
 * Read by beyondstagezero.com. It deliberately publishes just:
 *  - "Public numbers" the team marks as Shown, and
 *  - a few build counts calculated from the log, and
 *  - countdowns marked "Shown publicly" (name, date, time, type only — never notes),
 *  - published news posts, the active site notice, the upcoming-test cards and gallery photos (Octopus).
 * Nothing about money, suppliers, contacts, people, machines or orders is ever included.
 * Set PUBLIC_STATS=off on the server to switch it off.
 */

interface Row {
  type: string
  data: Record<string, unknown>
  created_at: string
  updated_at?: string
}

const DAY = 86_400_000

function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return d && m ? `${d} ${months[m - 1]} ${y}` : iso
}

function day(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default route({
  async GET(_req, res) {
    if ((process.env.PUBLIC_STATS || '').toLowerCase() === 'off') throw new HttpError(404, 'Not found')

    const db = await getDb()
    await autoStartDueTests(db) // a GO test that just hit T-0 becomes In progress
    const rows = await db.query<Row>(
      `select type, data, created_at, updated_at from records
       where deleted_at is null and type in ('stat', 'movement', 'process', 'countdown', 'post', 'notice', 'upnext', 'photo')`,
    )

    const now = new Date()
    const monthStart = day(now).slice(0, 8) + '01'
    const since30 = day(new Date(now.getTime() - 29 * DAY))

    const numbers = rows
      .filter((r) => r.type === 'stat' && r.data.visible !== 'hidden' && r.data.label)
      .map((r) => ({
        label: String(r.data.label),
        // Numbers or text like "Apr 2025" / "Q1–Q2'27"
        value: typeof r.data.value === 'number' ? r.data.value : String(r.data.value ?? ''),
        suffix: r.data.suffix ? String(r.data.suffix) : null,
        description: r.data.description ? String(r.data.description) : null,
        order: Number(r.data.order ?? 999),
      }))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
      .map(({ order: _order, ...n }) => n)

    const builds = rows.filter((r) => r.type === 'movement' && r.data.kind === 'made')
    const qty = (r: Row) => Math.abs(Number(r.data.qty) || 0)
    const dateOf = (r: Row) => String(r.data.date ?? day(new Date(r.created_at)))
    const daily = new Map<string, number>()
    for (let i = 29; i >= 0; i--) daily.set(day(new Date(now.getTime() - i * DAY)), 0)
    let lastBuild = ''
    for (const b of builds) {
      const d = dateOf(b)
      if (daily.has(d)) daily.set(d, daily.get(d)! + qty(b))
      if (d > lastBuild) lastBuild = d
    }

    const today = day(new Date(now.getTime() - DAY)) // keep yesterday's for time-zone slack
    const countdowns = rows
      .filter((r) => r.type === 'countdown' && r.data.public === 'shown' && r.data.name && r.data.date && String(r.data.date) >= today)
      .map((r) => ({
        name: String(r.data.name),
        date: String(r.data.date),
        time: r.data.time ? String(r.data.time) : null,
        category: r.data.category ? String(r.data.category) : null,
        // Test-day status, so beyondstagezero.com can point people to the live page
        status: r.data.status ? String(r.data.status) : null,
        // Exact T-0 (moves when a hold ends) and, while on Hold, the frozen time left in ms
        at: new Date(countdownInstant(r.data)).toISOString(),
        held: holdLeft(r.data, r.updated_at ? new Date(String(r.updated_at)).getTime() : undefined),
      }))
      .sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`))

    const posts = rows.filter((r) => r.type === 'post')
    const news = posts
      .filter((r) => r.data.status !== 'draft' && r.data.title && r.data.date)
      .map((r) => ({
        title: String(r.data.title),
        date: String(r.data.date),
        display: r.data.dateLabel ? String(r.data.dateLabel) : longDate(String(r.data.date)),
        tag: r.data.tag ? String(r.data.tag) : null,
        body: String(r.data.body ?? ''),
        link: r.data.link ? String(r.data.link) : null,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 100)

    // "Next tests" cards on the Tests page. Steps are typed one per line as "label | when".
    const upnextRows = rows.filter((r) => r.type === 'upnext')
    const upnext = upnextRows
      .filter((r) => r.data.visible !== 'hidden' && r.data.title)
      .sort((a, b) => (Number(a.data.order) || 999) - (Number(b.data.order) || 999))
      .map((r) => ({
        code: r.data.code ? String(r.data.code) : null,
        title: String(r.data.title),
        engine: r.data.engine ? String(r.data.engine) : null,
        status: r.data.status ? String(r.data.status) : null,
        note: r.data.note ? String(r.data.note) : '',
        steps: String(r.data.steps ?? '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const [label, ...when] = l.split('|')
            return { label: label.trim(), when: when.join('|').trim() || null }
          }),
        link: r.data.link ? String(r.data.link) : null,
        linkText: r.data.linkText ? String(r.data.linkText) : null,
      }))

    // Gallery photos: the full image and a small thumbnail, in the order set in Octopus.
    const photoRows = rows.filter((r) => r.type === 'photo')
    const gallery = photoRows
      .filter((r) => r.data.visible !== 'hidden' && r.data.url)
      .sort((a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0) || String(b.created_at).localeCompare(String(a.created_at)))
      .map((r) => ({
        src: String(r.data.url),
        thumb: r.data.thumb ? String(r.data.thumb) : String(r.data.url),
        caption: r.data.caption ? String(r.data.caption) : '',
        kind: r.data.kind ? String(r.data.kind) : 'photo',
        width: Number(r.data.width) || null,
        height: Number(r.data.height) || null,
        // Videos are YouTube links: the id to embed, and whether it's an upright Short.
        videoId: typeof r.data.videoId === 'string' && /^[\w-]{6,20}$/.test(r.data.videoId) ? r.data.videoId : null,
        vertical: r.data.vertical === true,
      }))

    const notices = rows.filter((r) => r.type === 'notice')
    const active = notices
      .filter((r) => r.data.active !== 'off' && r.data.title)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] // newest active notice wins
    const notice = active
      ? {
          label: active.data.label ? String(active.data.label) : null,
          title: String(active.data.title),
          link: active.data.link ? String(active.data.link) : null,
          linkText: active.data.linkText ? String(active.data.linkText) : null,
        }
      : null

    const body = {
      updatedAt: now.toISOString(),
      // Which parts Octopus manages. Once something exists in Octopus the website uses it,
      // even if that means showing nothing (e.g. every notice switched off).
      managed: {
        numbers: rows.some((r) => r.type === 'stat'),
        news: posts.length > 0,
        notice: notices.length > 0,
        upnext: upnextRows.length > 0,
        gallery: photoRows.length > 0,
      },
      upnext,
      gallery,
      notice,
      numbers,
      news,
      countdowns,
      builds: {
        partsBuilt: builds.reduce((t, b) => t + qty(b), 0),
        partsBuiltThisMonth: builds.filter((b) => dateOf(b) >= monthStart).reduce((t, b) => t + qty(b), 0),
        partsBuiltLast30Days: builds.filter((b) => dateOf(b) >= since30).reduce((t, b) => t + qty(b), 0),
        buildsLogged: builds.length,
        lastBuildDate: lastBuild || null,
        processesInUse: rows.filter((r) => r.type === 'process' && r.data.status !== 'retired').length,
        daily: [...daily.entries()].map(([date, parts]) => ({ date, parts })),
      },
    }

    // Public, cacheable for a minute at the edge so the website stays fast.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    // Short edge cache so test-day changes (Hold, Live) reach beyondstagezero.com within seconds.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5')
    res.status(200).json(body)
  },
})
