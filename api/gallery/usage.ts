import { requireUser } from '../_lib/auth.js'
import { route } from '../_lib/http.js'
import { storageUsage } from '../_lib/images.js'

/** GET /api/gallery/usage → how much gallery storage is used: { bytes, files } (photos + thumbnails). */
export default route({
  async GET(req, res) {
    await requireUser(req)
    res.status(200).json(await storageUsage())
  },
})
