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
