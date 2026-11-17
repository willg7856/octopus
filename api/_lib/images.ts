/**
 * File storage for gallery photos.
 *
 * On Vercel: the "octopus-blob" Vercel Blob store. Octopus signs in to it automatically (OIDC +
 * BLOB_STORE_ID, set when the store was connected), so there's no token to manage.
 * Local dev: files go to .data/uploads and are served by /api/gallery/file, so the whole flow
 * works without touching the real store.
 */

const onVercel = () => process.env.VERCEL === '1'

export function storageConfigured(): boolean {
  return !onVercel() || !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
}

export async function saveImage(pathname: string, data: Buffer, contentType: string): Promise<string> {
  if (onVercel()) {
    const { put } = await import('@vercel/blob')
    const blob = await put(pathname, data, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365, // names are unique, so they can be cached for good
    })
    return blob.url
  }
  const fs = await import('node:fs')
  const path = await import('node:path')
  const file = path.join('.data', 'uploads', pathname)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data)
  return `/api/gallery/file?p=${encodeURIComponent(pathname)}`
}

/** Checks the store can be reached (for /api/health). */
export async function checkStorage(): Promise<'ok' | 'not-configured' | 'error'> {
  if (!onVercel()) return 'ok'
  if (!storageConfigured()) return 'not-configured'
  try {
    const { list } = await import('@vercel/blob')
    await list({ limit: 1, prefix: 'gallery/' })
    return 'ok'
  } catch (err) {
    console.error('[storage]', (err as Error).message)
    return 'error'
  }
}

/** Total size and number of files in gallery storage (photos and thumbnails), cached for a minute. */
let usageCache: { at: number; value: { bytes: number; files: number } } | null = null

export async function storageUsage(): Promise<{ bytes: number; files: number }> {
  if (usageCache && Date.now() - usageCache.at < 60_000) return usageCache.value
  let bytes = 0
  let files = 0
  if (onVercel()) {
    const { list } = await import('@vercel/blob')
    let cursor: string | undefined
    do {
      const page = await list({ prefix: 'gallery/', limit: 1000, cursor })
      for (const b of page.blobs) {
        bytes += b.size
        files++
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
  } else {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else {
          bytes += fs.statSync(p).size
          files++
        }
      }
    }
    walk(path.join('.data', 'uploads', 'gallery'))
  }
  usageCache = { at: Date.now(), value: { bytes, files } }
  return usageCache.value
}

/** Forget the cached usage after an upload, so the number updates straight away. */
export function storageChanged() {
  usageCache = null
}
