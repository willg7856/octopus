import { HttpError, q, route } from '../_lib/http.js'

/** GET /api/gallery/file?p=gallery/… — local development only: serves photos saved to .data/uploads. */
export default route({
  async GET(req, res) {
    if (process.env.VERCEL === '1') throw new HttpError(404, 'Not found')
    const p = q(req, 'p') ?? ''
    if (!/^gallery\/[\w-]+\/[\w.-]+$/.test(p)) throw new HttpError(400, 'Bad path')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const file = path.join('.data', 'uploads', p)
    if (!fs.existsSync(file)) throw new HttpError(404, 'Not found')
    const ext = path.extname(file).slice(1)
    res.setHeader('Content-Type', ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.end(fs.readFileSync(file))
  },
})
