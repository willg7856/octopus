import { useMemo, useRef, useState } from 'react'
import { useDialog } from '../components/Dialog'
import { useEditor } from '../components/Editor'
import { Icon } from '../components/Icon'
import { Badge, Button, LinkButton, useToast } from '../components/ui'
import { newId } from '../lib/api'
import { SITE_SEED } from '../lib/siteSeed'
import { useRecords, useStore } from '../lib/store'
import type { Op, Rec } from '../lib/types'

/**
 * The Gallery page of beyondstagezero.com, run from Octopus. Photos are shrunk in the browser
 * (about 2000 px, plus a 640 px thumbnail) before upload, so storage stays small and the website
 * stays fast. The files go to Vercel Blob; a "photo" record holds the caption, type and order.
 */

type Photo = {
  url: string
  thumb?: string
  caption?: string
  kind?: 'photo' | 'render' | 'team'
  visible?: 'shown' | 'hidden'
  order?: number
  width?: number
  height?: number
}

const SITE = 'https://beyondstagezero.com'
const FULL_PX = 2000
const THUMB_PX = 640
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'photo', label: 'Photos' },
  { id: 'render', label: 'Renders' },
  { id: 'team', label: 'Team' },
  { id: 'hidden', label: 'Hidden' },
] as const

type Job = { id: string; name: string; state: 'waiting' | 'shrinking' | 'uploading' | 'done' | 'failed'; error?: string }

/** Resizes an image file in the browser. WebP where the browser can make it, otherwise JPEG. */
async function shrink(file: File, maxPx: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Couldn’t read this image. Save it as a JPEG or PNG and try again.')
  }
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const encode = (type: string, q: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q))
  ctx.drawImage(bitmap, 0, 0, width, height)
  let blob = await encode('image/webp', quality)
  if (!blob || blob.type !== 'image/webp') {
    // No WebP encoder (older Safari): JPEG, on white so transparent PNGs don't turn black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    blob = await encode('image/jpeg', quality)
  }
  bitmap.close()
  if (!blob) throw new Error('Couldn’t shrink this image')
  return { blob, width, height }
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('Couldn’t read the shrunk image'))
    r.readAsDataURL(blob)
  })

async function uploadOne(file: File, onState: (s: Job['state']) => void) {
  onState('shrinking')
  let full = await shrink(file, FULL_PX, 0.86)
  if (full.blob.size > 3_000_000) full = await shrink(file, FULL_PX, 0.72)
  const thumb = await shrink(file, THUMB_PX, 0.8)
  onState('uploading')
  const res = await fetch('/api/gallery/upload', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      full: { type: full.blob.type, data: await toBase64(full.blob) },
      thumb: { type: thumb.blob.type, data: await toBase64(thumb.blob) },
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { url?: string; thumb?: string; error?: string }
  if (!res.ok || !body.url) throw new Error(body.error || `Upload failed (${res.status})`)
  return { url: body.url, thumb: body.thumb ?? body.url, width: full.width, height: full.height }
}

export function GalleryPage() {
  const photos = useRecords<Photo>('photo')
  const { commit, create, update, remove } = useStore()
  const openEditor = useEditor()
  const toast = useToast()
  const dialog = useDialog()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [jobs, setJobs] = useState<Job[]>([])
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const sorted = useMemo(
    () =>
      [...photos].sort(
        (a, b) => (Number(a.data.order) || 0) - (Number(b.data.order) || 0) || b.createdAt.localeCompare(a.createdAt),
      ),
    [photos],
  )
  const shown = sorted.filter((p) =>
    filter === 'all' ? true : filter === 'hidden' ? p.data.visible === 'hidden' : (p.data.kind ?? 'photo') === filter && p.data.visible !== 'hidden',
  )
  const onSite = photos.filter((p) => p.data.visible !== 'hidden').length

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(f.name))
    if (!list.length) return
    const batch: Job[] = list.map((f) => ({ id: newId(), name: f.name, state: 'waiting' }))
    setJobs((j) => [...batch, ...j.filter((x) => x.state !== 'done')])
    const setState = (id: string, state: Job['state'], error?: string) =>
      setJobs((j) => j.map((x) => (x.id === id ? { ...x, state, error } : x)))
    let front = Math.min(0, ...photos.map((p) => Number(p.data.order) || 0))
    let ok = 0
    // One at a time: phones run out of memory decoding several big photos at once.
    for (let i = 0; i < list.length; i++) {
      const job = batch[i]!
      try {
        const up = await uploadOne(list[i]!, (s) => setState(job.id, s))
        front -= 1 // newest uploads go first
        await create('photo', { ...up, caption: '', kind: 'photo', visible: 'shown', order: front })
        setState(job.id, 'done')
        ok++
      } catch (e) {
        setState(job.id, 'failed', (e as Error).message)
      }
    }
    if (ok) toast(`${ok} photo${ok === 1 ? '' : 's'} added to the gallery. Click one to add a caption.`, { tone: 'good' })
    setTimeout(() => setJobs((j) => j.filter((x) => x.state !== 'done')), 4000)
  }

  const move = async (i: number, dir: -1 | 1) => {
    const list = [...sorted]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    const ops: Op[] = list
      .map((r, k) => ({ r, order: k + 1 }))
      .filter(({ r, order }) => Number(r.data.order) !== order)
      .map(({ r, order }) => ({ op: 'update' as const, id: r.id, version: r.version, data: { ...r.data, order } }))
    try {
      await commit(ops)
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    }
  }

  const toggle = (p: Rec<Photo>) =>
    update(p as Rec, { ...p.data, visible: p.data.visible === 'hidden' ? 'shown' : 'hidden' }).catch((e) =>
      toast((e as Error).message, { tone: 'bad' }),
    )

  const del = async (p: Rec<Photo>) => {
    const ok = await dialog.confirm({
      title: 'Remove this photo?',
      message: 'It comes off the website straight away. You can bring it back from Activity → Deleted.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (ok) remove(p as Rec).catch((e) => toast((e as Error).message, { tone: 'bad' }))
  }

  const importSite = async () => {
    setImporting(true)
    try {
      await commit(SITE_SEED.gallery.map((g) => ({ op: 'create' as const, id: newId(), type: 'photo', data: { ...g } })))
      toast('Imported. The Gallery page now reads from Octopus.', { tone: 'good' })
    } catch (e) {
      toast((e as Error).message, { tone: 'bad' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      className={`page gallery-page${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        addFiles(e.dataTransfer.files)
      }}
    >
      <header className="page-head">
        <div>
          <h1>Gallery</h1>
          <p className="muted">
            The <a href={`${SITE}/gallery`} target="_blank" rel="noreferrer">Gallery page</a> on beyondstagezero.com.{' '}
            {photos.length ? `${onSite} photo${onSite === 1 ? '' : 's'} on the website.` : ''} Drop photos anywhere on this page, or add them
            from your phone.
          </p>
        </div>
        <div className="row gap-s wrap">
          <LinkButton href={`${SITE}/gallery`} external icon="external">Open the gallery</LinkButton>
          <Button variant="primary" icon="upload" onClick={() => input.current?.click()}>Add photos</Button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      {photos.length === 0 && (
        <section className="card site-import">
          <div>
            <p className="strong">Start from what’s on the website</p>
            <p className="muted small">
              The Gallery page still shows its {SITE_SEED.gallery.length} built-in photos. Bring them into Octopus once, and from then on you
              add, remove and caption them here.
            </p>
          </div>
          <Button variant="primary" onClick={importSite} disabled={importing}>{importing ? 'Bringing them in…' : 'Bring them in'}</Button>
        </section>
      )}

      {jobs.length > 0 && (
        <ul className="card gallery-jobs" aria-live="polite">
          {jobs.map((j) => (
            <li key={j.id} className={`job-${j.state}`}>
              <span className="gallery-job-name">{j.name}</span>
              <span className="muted small">
                {j.state === 'waiting' ? 'Waiting' : j.state === 'shrinking' ? 'Shrinking…' : j.state === 'uploading' ? 'Uploading…' : j.state === 'done' ? 'Added ✓' : j.error}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="chips" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`chip${filter === f.id ? ' on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="muted small">{photos.length ? 'Nothing here.' : 'No photos yet.'}</p>
      ) : (
        <div className="gallery-grid">
          {shown.map((p) => {
            const i = sorted.indexOf(p)
            const hidden = p.data.visible === 'hidden'
            return (
              <figure key={p.id} className={`gallery-tile${hidden ? ' hidden' : ''}`}>
                <button className="gallery-img" onClick={() => openEditor({ type: 'photo', record: p as Rec })} title="Edit caption and type">
                  <img src={p.data.thumb || p.data.url} alt={p.data.caption || ''} loading="lazy" />
                  {hidden && <span className="gallery-badge"><Badge>Hidden</Badge></span>}
                  {p.data.kind && p.data.kind !== 'photo' && <span className="gallery-kind">{p.data.kind === 'render' ? 'Render' : 'Team'}</span>}
                </button>
                <figcaption>
                  <span className={p.data.caption ? '' : 'muted'}>{p.data.caption || 'Add a caption'}</span>
                  <span className="gallery-actions">
                    <Button small variant="ghost" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>←</Button>
                    <Button small variant="ghost" aria-label="Move later" disabled={i === sorted.length - 1} onClick={() => move(i, 1)}>→</Button>
                    <Button small variant="ghost" onClick={() => toggle(p)} aria-label={hidden ? 'Show on website' : 'Hide from website'}>
                      {hidden ? 'Show' : 'Hide'}
                    </Button>
                    <Button small variant="ghost" icon="trash" aria-label="Remove photo" onClick={() => del(p)} />
                  </span>
                </figcaption>
              </figure>
            )
          })}
        </div>
      )}

      <p className="muted small site-foot">
        <Icon name="shield" size={13} /> Photos are shrunk to about 2000 px before upload. Hidden photos stay in Octopus but aren’t on the
        website.
      </p>
    </div>
  )
}
