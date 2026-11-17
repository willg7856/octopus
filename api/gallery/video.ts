import { requireUser } from '../_lib/auth.js'
import { HttpError, q, route } from '../_lib/http.js'

/**
 * GET /api/gallery/video?id=YOUTUBE_ID → { title } from YouTube's public oEmbed, so a video added
 * to the gallery starts with its own title as the caption. Unlisted videos work; private ones don't.
 */
export default route({
  async GET(req, res) {
    await requireUser(req)
    const id = q(req, 'id') ?? ''
    if (!/^[\w-]{6,20}$/.test(id)) throw new HttpError(400, 'Bad video id')
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
        { signal: ctrl.signal },
      )
      if (!r.ok) throw new HttpError(404, r.status === 401 || r.status === 403 ? 'That video is private' : 'Couldn’t find that video on YouTube')
      const d = (await r.json()) as { title?: string; author_name?: string }
      res.status(200).json({ title: String(d.title ?? '').slice(0, 300), channel: d.author_name ?? null })
    } catch (e) {
      if (e instanceof HttpError) throw e
      throw new HttpError(502, 'Couldn’t reach YouTube')
    } finally {
      clearTimeout(timer)
    }
  },
})
