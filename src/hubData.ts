import type {
  Contact,
  Milestone,
  Notice,
  ResourceLink,
  UpcomingEvent,
} from './types'

/**
 * TEAM CONTENT — fill this file with real links and people.
 *
 * Anything marked needsLink: true (or href '#') shows as “Needs link” in the UI.
 * Prefer full URLs (https://…).
 */

export const RESOURCE_CATEGORY_LABELS: Record<ResourceLink['category'], string> = {
  cad: 'CAD · Onshape',
  drive: 'Google Drive',
  planning: 'Calendar & planning',
  ops: 'Ops references',
  web: 'Web',
}

export const RESOURCES: ResourceLink[] = [
  {
    id: 'onshape-stravox',
    category: 'cad',
    title: 'STRAVOX vehicle — Onshape',
    description: 'Airframe, motor, and pad interface models.',
    href: '',
    external: true,
    needsLink: true,
  },
  {
    id: 'onshape-pad',
    category: 'cad',
    title: 'Pad & stand — Onshape',
    description: 'Static-fire stand, load path, and pad geometry.',
    href: '',
    external: true,
    needsLink: true,
  },
  {
    id: 'drive-root',
    category: 'drive',
    title: 'Beyond Stage Zero — Drive root',
    description: 'Top-level shared Drive folder.',
    href: '',
    external: true,
    needsLink: true,
  },
  {
    id: 'drive-tests',
    category: 'drive',
    title: 'Test campaign folder',
    description: 'Static-fire / launch folders, delay sheets, and logs.',
    href: '',
    external: true,
    needsLink: true,
  },
  {
    id: 'drive-media',
    category: 'drive',
    title: 'Media & stills',
    description: 'Pad photography, edit selects, and release assets.',
    href: '',
    external: true,
    needsLink: true,
  },
  {
    id: 'calendar-team',
    category: 'planning',
    title: 'Team calendar',
    description: 'Build nights, pad days, and travel.',
    href: '',
    external: true,
    needsLink: true,
  },
  {
    id: 'calendar-ops',
    category: 'planning',
    title: 'Ops / range windows',
    description: 'Fire windows and blackout dates.',
    href: '',
    external: true,
    needsLink: true,
  },
  {
    id: 'ops-checklist',
    category: 'ops',
    title: 'Pad-day checklist',
    description: 'Shared checklist or runbook doc.',
    href: '',
    external: true,
    needsLink: true,
  },
  {
    id: 'ops-control',
    category: 'ops',
    title: 'Mission control',
    description: 'Range, arm, telemetry, and ops console.',
    href: '#control',
  },
  {
    id: 'ops-cams',
    category: 'ops',
    title: 'Cameras',
    description: 'Pad, Goods Shed, and vehicle groups.',
    href: '#cameras',
  },
  {
    id: 'site-public',
    category: 'web',
    title: 'beyondstagezero.com',
    description: 'Public site.',
    href: 'https://www.beyondstagezero.com',
    external: true,
  },
]

export const CONTACTS: Contact[] = [
  {
    id: 'will',
    name: 'Will',
    role: 'Program / ops',
    email: 'willg@beyondstagezero.com',
    phone: '',
    chat: '',
    notes: 'Octopus / Vercel access.',
    escalateOrder: 1,
  },
  {
    id: 'propulsion',
    name: '',
    role: 'Propulsion',
    email: '',
    phone: '',
    chat: '',
    notes: 'Motor & static fire.',
    escalateOrder: 2,
  },
  {
    id: 'avionics',
    name: '',
    role: 'Avionics / RF',
    email: '',
    phone: '',
    chat: '',
    notes: 'Flight computer & link path.',
    escalateOrder: 3,
  },
  {
    id: 'structures',
    name: '',
    role: 'Structures',
    email: '',
    phone: '',
    chat: '',
    notes: 'Airframe & pad stand.',
    escalateOrder: 4,
  },
  {
    id: 'range',
    name: '',
    role: 'Range / safety',
    email: '',
    phone: '',
    chat: '',
    notes: 'Pad-day range contact.',
    escalateOrder: 1,
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
    detail: 'Ground burns with thrust / chamber / case temp logged.',
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
    detail: 'Target launch campaign — exact dates on the team calendar.',
    status: 'upcoming',
  },
]

/** Specific dated events — replace with real calendar items. */
export const UPCOMING_EVENTS: UpcomingEvent[] = [
  {
    id: 'e1',
    date: 'TBD',
    title: 'Next build night',
    detail: 'Add the real date from the team calendar.',
  },
  {
    id: 'e2',
    date: 'TBD',
    title: 'Next pad day',
    detail: 'Add the real date / window.',
  },
]

export const NOTICES: Notice[] = [
  {
    id: 'n1',
    level: 'warn',
    title: 'Control & cameras are demo until wired',
    body: 'Telemetry, range/arm UI, and camera tiles work locally for practice. Real streams and hardware still need connecting.',
  },
  {
    id: 'n2',
    level: 'warn',
    title: 'Shared links need filling in',
    body: 'Onshape, Drive, calendars, and several contacts are blank — drop real URLs and names into hubData.ts.',
  },
  {
    id: 'n3',
    level: 'info',
    title: 'Ignition enable ≠ flight computer',
    body: 'Mission control can arm ignition enable when checklist + range GO. The flight computer stays separate.',
  },
]

export function resourceIsReady(resource: ResourceLink) {
  if (resource.needsLink) return false
  if (!resource.href || resource.href === '#') return false
  if (resource.href.startsWith('#')) return true
  return /^https?:\/\//i.test(resource.href)
}

export function contactIsReady(contact: Contact) {
  return Boolean(contact.name.trim() && contact.email.trim())
}
