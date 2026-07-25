import type { Contact, Milestone, Notice, ResourceLink } from './types'

/** Edit this file to keep Octopus pointed at the team’s real sources of truth. */

export const RESOURCE_CATEGORY_LABELS: Record<ResourceLink['category'], string> = {
  cad: 'CAD · Onshape',
  drive: 'Google Drive',
  planning: 'Calendar & planning',
  web: 'Web & public',
  ops: 'Ops references',
}

export const RESOURCES: ResourceLink[] = [
  {
    id: 'onshape-stravox',
    category: 'cad',
    title: 'STRAVOX vehicle — Onshape',
    description: 'Airframe, motor, and pad interface models.',
    href: 'https://cad.onshape.com/',
    external: true,
  },
  {
    id: 'onshape-pad',
    category: 'cad',
    title: 'Pad & stand — Onshape',
    description: 'Static-fire stand, load path, and pad geometry.',
    href: 'https://cad.onshape.com/',
    external: true,
  },
  {
    id: 'drive-root',
    category: 'drive',
    title: 'Beyond Stage Zero — Drive',
    description: 'Shared docs, photos, test reports, and exports.',
    href: 'https://drive.google.com/',
    external: true,
  },
  {
    id: 'drive-tests',
    category: 'drive',
    title: 'Test campaign folder',
    description: 'Static-fire / launch folders, delay sheets, and logs.',
    href: 'https://drive.google.com/',
    external: true,
  },
  {
    id: 'drive-media',
    category: 'drive',
    title: 'Media & stills',
    description: 'Pad photography, edit selects, and release assets.',
    href: 'https://drive.google.com/',
    external: true,
  },
  {
    id: 'calendar-team',
    category: 'planning',
    title: 'Team calendar',
    description: 'Build nights, pad days, and travel windows.',
    href: 'https://calendar.google.com/',
    external: true,
  },
  {
    id: 'calendar-ops',
    category: 'planning',
    title: 'Ops / range windows',
    description: 'Fire windows, range coordination, and blackout dates.',
    href: 'https://calendar.google.com/',
    external: true,
  },
  {
    id: 'site-public',
    category: 'web',
    title: 'beyondstagezero.com',
    description: 'Public site and program narrative.',
    href: 'https://www.beyondstagezero.com',
    external: true,
  },
  {
    id: 'ops-live',
    category: 'ops',
    title: 'Live data (this hub)',
    description: 'Pad / vehicle telemetry and link health — view only.',
    href: '#live',
  },
  {
    id: 'ops-cams',
    category: 'ops',
    title: 'Camera wall (this hub)',
    description: 'Pad, Goods Shed, and vehicle camera groups.',
    href: '#cameras',
  },
]

export const CONTACTS: Contact[] = [
  {
    id: 'will',
    name: 'Will',
    role: 'Program / ops lead',
    email: 'willg@beyondstagezero.com',
    notes: 'Primary Octopus access & Vercel ops.',
  },
  {
    id: 'propulsion',
    name: 'Propulsion lead',
    role: 'Motor & static fire',
    email: 'propulsion@beyondstagezero.com',
    notes: 'Replace with real team emails in hubData.ts.',
  },
  {
    id: 'avionics',
    name: 'Avionics lead',
    role: 'Flight computer & RF',
    email: 'avionics@beyondstagezero.com',
  },
  {
    id: 'structures',
    name: 'Structures lead',
    role: 'Airframe & pad stand',
    email: 'structures@beyondstagezero.com',
  },
  {
    id: 'range',
    name: 'Range / safety',
    role: 'Range safety contact',
    email: 'range@beyondstagezero.com',
    phone: '',
    notes: 'For pad-day coordination — not controlled from Octopus.',
  },
]

export const MILESTONES: Milestone[] = [
  {
    id: 'm1',
    date: '2026-Q2',
    title: 'Goods Shed link path proven',
    detail: 'Pad instruments and cameras into the shed over the ops link.',
    status: 'done',
  },
  {
    id: 'm2',
    date: '2026-Q3',
    title: 'B1M static-fire campaign',
    detail: 'Ground burns with thrust / chamber pressure / case temp logged.',
    status: 'active',
  },
  {
    id: 'm3',
    date: '2026-Q4',
    title: 'Flight-day vehicle downlink dry run',
    detail: 'Avionics + GPS path exercised end-to-end without ignition.',
    status: 'upcoming',
  },
  {
    id: 'm4',
    date: '2027-Q1',
    title: 'STRAVOX launch window',
    detail: 'Target launch campaign — exact dates live on the team calendar.',
    status: 'upcoming',
  },
]

export const NOTICES: Notice[] = [
  {
    id: 'n1',
    level: 'info',
    title: 'Live feeds are view-only',
    body: 'Use Live and Cameras to watch the pad and vehicle. Control stays on the dedicated systems.',
  },
  {
    id: 'n2',
    level: 'warn',
    title: 'Some links are placeholders',
    body: 'Replace Onshape, Drive, calendar, and contact emails in hubData.ts with the real team links.',
  },
]
