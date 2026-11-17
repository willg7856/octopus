import { randomBytes } from 'node:crypto'
import { requireUser } from '../_lib/auth.js'
import { body, HttpError, route } from '../_lib/http.js'
import { saveImage } from '../_lib/images.js'

/**
 * POST /api/gallery/upload — saves one photo (already shrunk in the browser) to file storage.
 *
 *   { "name": "IMG_1234.jpg", "full": { "type": "image/webp", "data": "<base64>" }, "thumb": { … } }
 *
 * Returns the two public addresses. Octopus then creates the gallery record that points at them,
 * through the normal records API, so it shows up in Activity and can be undone.
 */

const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }
const MAX_FULL = 3_200_000 // bytes, after the browser has resized it
const MAX_THUMB = 600_000

type Part = { type?: unknown; data?: unknown }

function decode(part: Part | undefined, max: number, what: string): { buf: Buffer; ext: string; type: string } {
  const type = String(part?.type ?? '')
  const ext = TYPES[type]
  if (!ext) throw new HttpError(400, `The ${what} must be a WebP, JPEG or PNG image`)
  const buf = Buffer.from(String(part?.data ?? ''), 'base64')
  if (!buf.length) throw new HttpError(400, `The ${what} is empty`)
  if (buf.length > max) throw new HttpError(413, `The ${what} is too big (${Math.round(buf.length / 1024)} KB)`)
  return { buf, ext, type }
}

export default route({
  async POST(req, res) {
    const user = await requireUser(req)
    const b = body<{ name?: unknown; full?: Part; thumb?: Part }>(req)
    const full = decode(b.full, MAX_FULL, 'photo')
    const thumb = decode(b.thumb, MAX_THUMB, 'thumbnail')
    // A readable, unguessable name: gallery/2026-11/b1m-pressure-test-3f9a1c.webp
    const base =
      String(b.name ?? 'photo')
        .replace(/\.[a-z0-9]+$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'photo'
    const id = `${base}-${randomBytes(4).toString('hex')}`
    const month = new Date().toISOString().slice(0, 7)
    const [fullUrl, thumbUrl] = await Promise.all([
      saveImage(`gallery/${month}/${id}.${full.ext}`, full.buf, full.type),
      saveImage(`gallery/${month}/${id}-thumb.${thumb.ext}`, thumb.buf, thumb.type),
    ])
    console.log(`[gallery] ${user.email} uploaded ${id} (${Math.round(full.buf.length / 1024)} KB)`)
    // Local development saves under /api/…; make that a full address so other sites can show it too.
    const abs = (u: string) => (u.startsWith('/') ? `http://${req.headers.host}${u}` : u)
    res.status(200).json({ url: abs(fullUrl), thumb: abs(thumbUrl), bytes: full.buf.length + thumb.buf.length })
  },
})
