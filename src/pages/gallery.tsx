import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { Badge, Button, LinkButton, useToast } from '../components/ui'
import { newId } from '../lib/api'
import { fmtDate } from '../lib/derive'
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
  const toast = useToast()
  const dialog = useDialog()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [jobs, setJobs] = useState<Job[]>([])
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ bytes: number; files: number } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const loadUsage = useCallback(() => {
    fetch('/api/gallery/usage', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => u && setUsage(u))
      .catch(() => undefined)
  }, [])
  useEffect(loadUsage, [loadUsage])

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
    loadUsage()
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
    if (!ok) return false
    remove(p as Rec).catch((e) => toast((e as Error).message, { tone: 'bad' }))
    return true
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
          {usage && (
            <p className="gallery-usage small" title="Photos uploaded through Octopus, full size plus thumbnails. Built-in photos from the website aren’t counted.">
              <Icon name="image" size={13} /> <strong>{fmtBytes(usage.bytes)}</strong> of storage used by{' '}
              {Math.ceil(usage.files / 2)} uploaded photo{Math.ceil(usage.files / 2) === 1 ? '' : 's'}
            </p>
          )}
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
                <button className="gallery-img" onClick={() => setOpenId(p.id)} title="Open full screen">
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

      {openId && shown.some((p) => p.id === openId) && (
        <Lightbox
          list={shown}
          id={openId}
          onClose={() => setOpenId(null)}
          onOpen={setOpenId}
          onSave={(p, data) => update(p as Rec, { ...p.data, ...data })}
          onMove={(p, dir) => move(sorted.indexOf(p), dir)}
          canMove={(p, dir) => {
            const i = sorted.indexOf(p)
            return dir < 0 ? i > 0 : i < sorted.length - 1
          }}
          onRemove={async (p) => {
            const next = shown[shown.indexOf(p) + 1] ?? shown[shown.indexOf(p) - 1]
            if (await del(p)) setOpenId(next && next.id !== p.id ? next.id : null)
          }}
        />
      )}

      <p className="muted small site-foot">
        <Icon name="shield" size={13} /> Photos are shrunk to about 2000 px before upload. Hidden photos stay in Octopus but aren’t on the
        website.
      </p>
    </div>
  )
}

const fmtBytes = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`

/**
 * Full-screen view of one photo, with its settings in a panel down the right. Changes save as
 * you make them (the caption when you leave the box or press Enter). ← → move between photos.
 */
function Lightbox({
  list,
  id,
  onClose,
  onOpen,
  onSave,
  onMove,
  canMove,
  onRemove,
}: {
  list: Rec<Photo>[]
  id: string
  onClose: () => void
  onOpen: (id: string) => void
  onSave: (p: Rec<Photo>, data: Partial<Photo>) => Promise<unknown>
  onMove: (p: Rec<Photo>, dir: -1 | 1) => Promise<unknown>
  canMove: (p: Rec<Photo>, dir: -1 | 1) => boolean
  onRemove: (p: Rec<Photo>) => void
}) {
  const toast = useToast()
  const i = list.findIndex((p) => p.id === id)
  const p = list[i]!
  const [caption, setCaption] = useState(p.data.caption ?? '')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [loaded, setLoaded] = useState(false)
  const captionRef = useRef<HTMLTextAreaElement>(null)

  // Switching photo: show its caption, and the small version until the full one arrives.
  useEffect(() => {
    setCaption(p.data.caption ?? '')
    setSaved('idle')
    setLoaded(false)
  }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (data: Partial<Photo>) => {
    setSaved('saving')
    try {
      await onSave(p, data)
      setSaved('saved')
    } catch (e) {
      setSaved('idle')
      toast((e as Error).message, { tone: 'bad' })
    }
  }
  const saveCaption = () => {
    if (caption.trim() !== (p.data.caption ?? '')) save({ caption: caption.trim() })
  }
  const go = (dir: -1 | 1) => {
    saveCaption()
    const next = list[i + dir]
    if (next) onOpen(next.id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === captionRef.current) {
        if (e.key === 'Escape') captionRef.current?.blur()
        return
      }
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  })

  const hidden = p.data.visible === 'hidden'
  const kind = p.data.kind ?? 'photo'
  const uploaded = p.data.url.includes('blob.vercel-storage.com') || p.data.url.includes('/api/gallery/file')

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={p.data.caption || 'Photo'}>
      <div className="lightbox-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {/* Thumbnail first (it's already loaded), then the full photo fades in over it */}
        <img className={`lightbox-img thumb${loaded ? ' gone' : ''}`} src={p.data.thumb || p.data.url} alt="" aria-hidden="true" />
        <img
          key={p.id}
          className={`lightbox-img${loaded ? ' loaded' : ''}`}
          src={p.data.url}
          alt={p.data.caption || ''}
          onLoad={() => setLoaded(true)}
        />
        <button className="lightbox-nav prev" onClick={() => go(-1)} disabled={i === 0} aria-label="Previous photo">‹</button>
        <button className="lightbox-nav next" onClick={() => go(1)} disabled={i === list.length - 1} aria-label="Next photo">›</button>
        <span className="lightbox-count">{i + 1} / {list.length}</span>
      </div>

      <aside className="lightbox-panel">
        <header className="lightbox-head">
          <span className="muted small">
            {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved ✓' : 'Changes save as you go'}
          </span>
          <Button small variant="ghost" icon="x" onClick={() => { saveCaption(); onClose() }} aria-label="Close">Close</Button>
        </header>

        <label className="lightbox-field">
          <span className="lightbox-label">Caption</span>
          <textarea
            ref={captionRef}
            rows={3}
            value={caption}
            placeholder="e.g. SF-04 burning, 26 April 2026."
            onChange={(e) => setCaption(e.target.value)}
            onBlur={saveCaption}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                saveCaption()
                captionRef.current?.blur()
              }
            }}
          />
        </label>

        <div className="lightbox-field">
          <span className="lightbox-label">Type</span>
          <div className="chips" role="radiogroup" aria-label="Type">
            {(['photo', 'render', 'team'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className={`chip${kind === k ? ' on' : ''}`} onClick={() => kind !== k && save({ kind: k })}>
                {k === 'photo' ? 'Photo' : k === 'render' ? 'Render' : 'Team'}
              </button>
            ))}
          </div>
        </div>

        <div className="lightbox-field">
          <span className="lightbox-label">On the website</span>
          <div className="chips" role="radiogroup" aria-label="On the website">
            <button type="button" role="radio" aria-checked={!hidden} className={`chip${!hidden ? ' on' : ''}`} onClick={() => hidden && save({ visible: 'shown' })}>Shown</button>
            <button type="button" role="radio" aria-checked={hidden} className={`chip${hidden ? ' on' : ''}`} onClick={() => !hidden && save({ visible: 'hidden' })}>Hidden</button>
          </div>
        </div>

        <div className="lightbox-field">
          <span className="lightbox-label">Position in the gallery</span>
          <div className="row gap-s">
            <Button small onClick={() => onMove(p, -1)} disabled={!canMove(p, -1)}>← Earlier</Button>
            <Button small onClick={() => onMove(p, 1)} disabled={!canMove(p, 1)}>Later →</Button>
          </div>
        </div>

        <dl className="lightbox-meta small">
          {p.data.width && p.data.height ? (<><dt>Size</dt><dd>{p.data.width} × {p.data.height}</dd></>) : null}
          <dt>{uploaded ? 'Uploaded' : 'Added'}</dt>
          <dd>{fmtDate(p.createdAt.slice(0, 10))}{p.createdBy ? ` · ${p.createdBy.split('@')[0]}` : ''}</dd>
          <dt>File</dt>
          <dd><a href={p.data.url} target="_blank" rel="noreferrer">Open the full photo ↗</a></dd>
        </dl>

        <div className="lightbox-foot">
          <Button small variant="ghost" icon="trash" onClick={() => onRemove(p)}>Remove from the gallery</Button>
        </div>
      </aside>
    </div>
  )
}
