import { requireUser } from './_lib/auth.js'
import { HttpError, q, route } from './_lib/http.js'

/**
 * GET /api/github?days=30 → code pushed across the team's GitHub repos.
 *
 * Which repos: GITHUB_REPOS ("owner/repo,owner/repo") or every repo of GITHUB_OWNER
 * (a user or organisation). GITHUB_TOKEN is optional but strongly recommended —
 * without it GitHub allows only 60 requests an hour, shared by everyone on Vercel.
 */

const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '')
const RANGES = new Set([1, 7, 30, 90, 182, 365])
const CACHE_MS = 10 * 60_000

interface RepoStats {
  repo: string
  url: string
  commits: number
  additions: number | null
  deletions: number | null
}

interface Result {
  days: number
  since: string
  generatedAt: string
  commits: number
  additions: number
  deletions: number
  linesPending: boolean
  contributors: number
  repos: RepoStats[]
  bucket: 'hour' | 'day'
  daily: { date: string; commits: number }[]
  truncated: boolean
}

const cache = new Map<number, { at: number; data: Result }>()

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'octopus-ops-hub',
  }
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return h
}

async function gh<T>(path: string): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`${API}${path}`, { headers: headers() })
  const limited = res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
  if (limited) {
    throw new HttpError(503, 'GitHub rate limit reached. Add a GITHUB_TOKEN on the server to raise it.')
  }
  if (res.status === 202 || res.status === 204) return { status: res.status, body: null }
  if (!res.ok) return { status: res.status, body: null }
  return { status: res.status, body: (await res.json()) as T }
}

async function listRepos(): Promise<string[]> {
  const explicit = (process.env.GITHUB_REPOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[\w.-]+\/[\w.-]+$/.test(s))
  if (explicit.length) return explicit
  const owner = (process.env.GITHUB_OWNER || '').trim()
  if (!owner) {
    throw new HttpError(503, 'GitHub isn’t set up yet. Set GITHUB_OWNER (or GITHUB_REPOS) on the server.', { code: 'not_configured' })
  }
  // Works for both organisations and users.
  let r = await gh<{ full_name: string; archived: boolean; fork: boolean }[]>(`/orgs/${owner}/repos?per_page=100&type=all`)
  if (!Array.isArray(r.body)) r = await gh(`/users/${owner}/repos?per_page=100&type=owner`)
  if (!Array.isArray(r.body)) throw new HttpError(502, `Couldn’t list GitHub repos for “${owner}”.`)
  return (r.body ?? []).filter((x) => !x.archived && !x.fork).map((x) => x.full_name)
}

/** Bucket key: "YYYY-MM-DDTHH" (UTC hour) for a 24-hour range, otherwise "YYYY-MM-DD". */
function dayOf(iso: string, hourly = false) {
  if (hourly) return iso.slice(0, 13)
  return iso.slice(0, 10)
}

async function repoStats(repo: string, since: Date, authors: Set<string>, perDay: Map<string, number>, hourly: boolean) {
  let commits = 0
  let truncated = false
  const shas: string[] = []
  for (let page = 1; page <= 5; page++) {
    const r = await gh<{ sha: string; commit: { author: { date: string; email?: string } | null }; author: { login: string } | null }[]>(
      `/repos/${repo}/commits?since=${since.toISOString()}&per_page=100&page=${page}`,
    )
    const list = r.body ?? []
    for (const c of list) {
      commits++
      shas.push(c.sha)
      const who = c.author?.login ?? c.commit.author?.email
      if (who) authors.add(who.toLowerCase())
      const d = c.commit.author?.date
      if (d) {
        const k = dayOf(d, hourly)
        if (perDay.has(k)) perDay.set(k, perDay.get(k)! + 1)
      }
    }
    if (list.length < 100) break
    if (page === 5) truncated = true
  }

  // Weekly [unixWeekStart, additions, -deletions]. GitHub computes this lazily and answers 202 first.
  let additions: number | null = null
  let deletions: number | null = null
  const shortRange = Date.now() - since.getTime() <= 8 * 86_400_000
  if (commits > 0 && shortRange && commits <= 40) {
    // GitHub's line stats are weekly, too coarse for a day or a week — count each commit instead.
    const details = await Promise.all(
      shas.map((sha) => gh<{ stats?: { additions: number; deletions: number } }>(`/repos/${repo}/commits/${sha}`)),
    )
    additions = 0
    deletions = 0
    for (const d of details) {
      additions += d.body?.stats?.additions ?? 0
      deletions += d.body?.stats?.deletions ?? 0
    }
  } else if (commits > 0) {
    const f = await gh<[number, number, number][]>(`/repos/${repo}/stats/code_frequency`)
    if (Array.isArray(f.body)) {
      additions = 0
      deletions = 0
      const cutoff = since.getTime() / 1000 - 6 * 86400 // include the week the range starts in
      for (const [week, add, del] of f.body) {
        if (week >= cutoff) {
          additions += add
          deletions += Math.abs(del)
        }
      }
    }
  } else {
    additions = 0
    deletions = 0
  }
  return { stats: { repo, url: `https://github.com/${repo}`, commits, additions, deletions }, truncated }
}

export default route({
  async GET(req, res) {
    await requireUser(req)
    const days = Number(q(req, 'days') ?? 30)
    if (!RANGES.has(days)) throw new HttpError(400, 'days must be 1, 7, 30, 90, 182 or 365')

    const hit = cache.get(days)
    if (hit && Date.now() - hit.at < CACHE_MS && !hit.data.linesPending) {
      res.status(200).json(hit.data)
      return
    }

    const now = new Date()
    const since = new Date(now.getTime() - days * 86_400_000)
    const repos = (await listRepos()).slice(0, 30)
    const authors = new Set<string>()
    const perDay = new Map<string, number>()
    const hourly = days <= 1
    if (hourly) for (let i = 24; i >= 0; i--) perDay.set(dayOf(new Date(now.getTime() - i * 3_600_000).toISOString(), true), 0)
    else for (let i = days - 1; i >= 0; i--) perDay.set(dayOf(new Date(now.getTime() - i * 86_400_000).toISOString()), 0)

    const results = await Promise.all(repos.map((r) => repoStats(r, since, authors, perDay, hourly)))
    const list = results.map((r) => r.stats).filter((r) => r.commits > 0).sort((a, b) => b.commits - a.commits)

    const data: Result = {
      days,
      since: since.toISOString(),
      generatedAt: now.toISOString(),
      commits: list.reduce((t, r) => t + r.commits, 0),
      additions: list.reduce((t, r) => t + (r.additions ?? 0), 0),
      deletions: list.reduce((t, r) => t + (r.deletions ?? 0), 0),
      linesPending: list.some((r) => r.additions == null),
      contributors: authors.size,
      repos: list,
      bucket: hourly ? 'hour' : 'day',
      daily: [...perDay.entries()].map(([date, commits]) => ({ date, commits })),
      truncated: results.some((r) => r.truncated),
    }
    cache.set(days, { at: Date.now(), data })
    res.status(200).json(data)
  },
})
