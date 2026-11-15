/**
 * Every module in Octopus is a "collection" described here. Lists, forms, search,
 * CSV export/import and detail pages are all generated from these definitions, so
 * adding a new module is mostly a matter of adding an entry to COLLECTIONS.
 */
import type { Data, Rec } from './types'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'date'
  | 'select'
  | 'url'
  | 'email'
  | 'phone'
  | 'ref'
  | 'tags'
  | 'lines'

export interface Option {
  value: string
  label: string
  tone?: Tone
}

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'accent'

export interface Field {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: Option[]
  /** For ref fields: the record type this points at. */
  ref?: string
  /** For ref fields: only offer records matching this filter. */
  refFilter?: (d: Data) => boolean
  placeholder?: string
  help?: string
  /** Lay out at half width in forms. */
  half?: boolean
  /** Hide in forms when this returns true. */
  hidden?: (d: Data) => boolean
  /** Default value for new records. */
  initial?: unknown | (() => unknown)
  /** Datalist suggestions (e.g. existing locations). Filled from records of this type/field. */
  suggest?: boolean
  rows?: number
}

export interface Collection {
  /** Route segment, e.g. "inventory". */
  key: string
  /** Record type stored on the server, e.g. "item". */
  type: string
  label: string
  singular: string
  icon: IconName
  blurb: string
  fields: Field[]
  title: (d: Data) => string
  subtitle?: (d: Data) => string
  /** Columns shown in the table view (field keys). */
  columns: string[]
  /** Extra text matched by search beyond title/subtitle. */
  searchText?: (d: Data) => string
  /** Hide from the main sidebar (still searchable / linkable). */
  hiddenInNav?: boolean
  group: 'work' | 'money' | 'team'
}

export type IconName =
  | 'home'
  | 'box'
  | 'wrench'
  | 'cart'
  | 'wallet'
  | 'list'
  | 'monitor'
  | 'users'
  | 'file'
  | 'link'
  | 'clock'
  | 'shield'
  | 'search'
  | 'plus'

const today = () => new Date().toISOString().slice(0, 10)

export const ITEM_KINDS: Option[] = [
  { value: 'made', label: 'Made in-house', tone: 'accent' },
  { value: 'bought', label: 'Bought part', tone: 'info' },
  { value: 'consumable', label: 'Consumable', tone: 'neutral' },
  { value: 'raw', label: 'Raw material', tone: 'neutral' },
  { value: 'tool', label: 'Tool / equipment', tone: 'neutral' },
]

export const MOVEMENT_KINDS: Option[] = [
  { value: 'made', label: 'Made', tone: 'accent' },
  { value: 'received', label: 'Received', tone: 'good' },
  { value: 'used', label: 'Used', tone: 'info' },
  { value: 'scrapped', label: 'Scrapped', tone: 'bad' },
  { value: 'adjusted', label: 'Stock count', tone: 'neutral' },
]

export const ORDER_STATUSES: Option[] = [
  { value: 'requested', label: 'Requested', tone: 'warn' },
  { value: 'approved', label: 'Approved', tone: 'info' },
  { value: 'ordered', label: 'Ordered', tone: 'accent' },
  { value: 'shipped', label: 'Shipped', tone: 'accent' },
  { value: 'received', label: 'Received', tone: 'good' },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
]

export const PROTOCOLS: Option[] = [
  { value: 'rdp', label: 'Windows Remote Desktop (RDP)' },
  { value: 'vnc', label: 'VNC' },
  { value: 'ssh', label: 'SSH' },
  { value: 'anydesk', label: 'AnyDesk' },
  { value: 'teamviewer', label: 'TeamViewer' },
  { value: 'parsec', label: 'Parsec' },
  { value: 'chrome', label: 'Chrome Remote Desktop' },
  { value: 'web', label: 'Web link' },
]

const UNITS = ['ea', 'm', 'mm', 'kg', 'g', 'L', 'mL', 'sheet', 'roll', 'pack', 'set']

const proto = (d: Data) => String(d.protocol ?? '')

export const COLLECTIONS: Collection[] = [
  {
    key: 'inventory',
    type: 'item',
    label: 'Inventory',
    singular: 'Item',
    icon: 'box',
    group: 'work',
    blurb: 'Everything we make, buy and keep on the shelf. Stock is calculated from the log.',
    title: (d) => String(d.name ?? 'Untitled item'),
    subtitle: (d) => [d.partNumber, d.revision && `rev ${d.revision}`].filter(Boolean).join(' · '),
    columns: ['partNumber', 'kind', 'location', 'supplier'],
    searchText: (d) => [d.supplierPartNo, d.location, (d.tags as string[] | undefined)?.join(' ')].join(' '),
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Nozzle insert, M4 cap screw' },
      { key: 'partNumber', label: 'Part number', type: 'text', half: true, placeholder: 'BSZ-0001' },
      { key: 'revision', label: 'Revision', type: 'text', half: true, placeholder: 'A' },
      { key: 'kind', label: 'Type', type: 'select', options: ITEM_KINDS, half: true, initial: 'bought' },
      { key: 'unit', label: 'Unit', type: 'select', options: UNITS.map((u) => ({ value: u, label: u })), half: true, initial: 'ea' },
      { key: 'location', label: 'Location', type: 'text', half: true, suggest: true, placeholder: 'Shelf B2' },
      { key: 'minQty', label: 'Reorder at', type: 'number', half: true, help: 'Flag as low stock at or below this quantity.' },
      { key: 'unitCost', label: 'Unit cost', type: 'money', half: true },
      { key: 'supplier', label: 'Supplier', type: 'ref', ref: 'contact', half: true, refFilter: (d) => d.kind === 'supplier' },
      { key: 'supplierPartNo', label: 'Supplier part no.', type: 'text', half: true, hidden: (d) => d.kind === 'made' },
      { key: 'orderUrl', label: 'Reorder link', type: 'url', half: true, hidden: (d) => d.kind === 'made' },
      { key: 'process', label: 'How it’s made', type: 'ref', ref: 'process', hidden: (d) => d.kind !== 'made' },
      { key: 'tags', label: 'Tags', type: 'tags', placeholder: 'engine, avionics' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'log',
    type: 'movement',
    label: 'Build & stock log',
    singular: 'Log entry',
    icon: 'wrench',
    group: 'work',
    blurb: 'Every part made, received, used or scrapped. This is what stock levels are built from.',
    title: (d) => `${labelOf(MOVEMENT_KINDS, d.kind)} ${d.qty ?? ''}`,
    columns: ['date', 'kind', 'item', 'qty', 'process', 'by'],
    searchText: (d) => [d.serials, d.lot, d.notes].join(' '),
    fields: [
      { key: 'kind', label: 'What happened', type: 'select', options: MOVEMENT_KINDS, required: true, initial: 'made' },
      { key: 'item', label: 'Item', type: 'ref', ref: 'item', required: true },
      { key: 'qty', label: 'Quantity', type: 'number', required: true, half: true, initial: 1,
        help: 'For a stock count, enter the change (+ or −).' },
      { key: 'date', label: 'Date', type: 'date', half: true, initial: today },
      { key: 'process', label: 'Process followed', type: 'ref', ref: 'process', hidden: (d) => d.kind !== 'made' },
      { key: 'order', label: 'Order', type: 'ref', ref: 'order', hidden: (d) => d.kind !== 'received' },
      { key: 'serials', label: 'Serial numbers', type: 'text', placeholder: 'SN-014, SN-015', hidden: (d) => d.kind !== 'made' },
      { key: 'lot', label: 'Batch / lot', type: 'text', half: true },
      { key: 'by', label: 'Done by', type: 'text', half: true, suggest: true },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Settings, issues, inspection results…' },
    ],
  },
  {
    key: 'orders',
    type: 'order',
    label: 'Orders',
    singular: 'Order',
    icon: 'cart',
    group: 'money',
    blurb: 'Purchase requests through to delivery. Receiving an order adds its items to stock.',
    title: (d) => String(d.title ?? 'Untitled order'),
    subtitle: (d) => String(d.orderNumber ?? ''),
    columns: ['status', 'supplier', 'budget', 'expectedAt'],
    searchText: (d) => [d.orderNumber, d.tracking, d.notes,
      ...((d.lines as { description?: string }[] | undefined) ?? []).map((l) => l.description)].join(' '),
    fields: [
      { key: 'title', label: 'What’s it for', type: 'text', required: true, placeholder: 'e.g. Igniter parts for static fire 3' },
      { key: 'status', label: 'Status', type: 'select', options: ORDER_STATUSES, required: true, half: true, initial: 'requested' },
      { key: 'supplier', label: 'Supplier', type: 'ref', ref: 'contact', half: true, refFilter: (d) => d.kind === 'supplier' },
      { key: 'lines', label: 'Items', type: 'lines' },
      { key: 'shipping', label: 'Shipping & fees', type: 'money', half: true },
      { key: 'budget', label: 'Budget', type: 'ref', ref: 'budget', half: true },
      { key: 'orderNumber', label: 'Order / PO number', type: 'text', half: true },
      { key: 'requestedBy', label: 'Requested by', type: 'text', half: true, suggest: true },
      { key: 'orderedAt', label: 'Ordered on', type: 'date', half: true },
      { key: 'expectedAt', label: 'Expected', type: 'date', half: true },
      { key: 'receivedAt', label: 'Received on', type: 'date', half: true },
      { key: 'tracking', label: 'Tracking', type: 'text', half: true },
      { key: 'url', label: 'Order link', type: 'url', half: true },
      { key: 'invoiceUrl', label: 'Invoice / receipt', type: 'url', half: true, help: 'Link to the PDF in Drive or the supplier portal.' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'budget',
    type: 'budget',
    label: 'Budget',
    singular: 'Budget line',
    icon: 'wallet',
    group: 'money',
    blurb: 'What we have to spend, and what orders have committed and spent against it.',
    title: (d) => String(d.name ?? 'Untitled budget'),
    subtitle: (d) => [d.category, d.period].filter(Boolean).join(' · '),
    columns: ['category', 'period', 'amount', 'owner'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Propulsion — FY26' },
      { key: 'amount', label: 'Allocated', type: 'money', required: true, half: true },
      { key: 'period', label: 'Period', type: 'text', half: true, suggest: true, placeholder: 'FY26' },
      { key: 'category', label: 'Category', type: 'text', half: true, suggest: true, placeholder: 'Propulsion' },
      { key: 'owner', label: 'Owner', type: 'text', half: true, suggest: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'processes',
    type: 'process',
    label: 'Processes',
    singular: 'Process',
    icon: 'list',
    group: 'work',
    blurb: 'How we do things — step-by-step procedures you can follow and log builds against.',
    title: (d) => String(d.title ?? 'Untitled process'),
    subtitle: (d) => [d.code, d.revision && `rev ${d.revision}`].filter(Boolean).join(' · '),
    columns: ['code', 'category', 'status', 'owner'],
    searchText: (d) => String(d.steps ?? ''),
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Grain casting' },
      { key: 'code', label: 'Code', type: 'text', half: true, placeholder: 'PRC-012' },
      { key: 'revision', label: 'Revision', type: 'text', half: true, placeholder: 'A' },
      { key: 'category', label: 'Category', type: 'text', half: true, suggest: true, placeholder: 'Machining' },
      { key: 'status', label: 'Status', type: 'select', half: true, initial: 'active', options: [
        { value: 'draft', label: 'Draft', tone: 'warn' },
        { value: 'active', label: 'In use', tone: 'good' },
        { value: 'retired', label: 'Retired', tone: 'neutral' },
      ] },
      { key: 'owner', label: 'Owner', type: 'text', half: true, suggest: true },
      { key: 'docUrl', label: 'Full document', type: 'url', half: true },
      { key: 'steps', label: 'Steps', type: 'textarea', rows: 10,
        help: 'One step per line. Lines starting with “!” show as warnings.' },
      { key: 'equipment', label: 'Tools & materials', type: 'tags' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'desktops',
    type: 'desktop',
    label: 'Remote desktops',
    singular: 'Remote desktop',
    icon: 'monitor',
    group: 'work',
    blurb: 'Connect to shop and CAD machines. Claim one so others know it’s in use.',
    title: (d) => String(d.name ?? 'Untitled machine'),
    subtitle: (d) => String(d.purpose ?? ''),
    columns: ['protocol', 'host', 'location'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. CAD workstation' },
      { key: 'protocol', label: 'Connect with', type: 'select', options: PROTOCOLS, required: true, initial: 'rdp' },
      { key: 'host', label: 'Host / IP', type: 'text', half: true, placeholder: 'cad-01.local',
        hidden: (d) => ['anydesk', 'teamviewer', 'parsec', 'chrome', 'web'].includes(proto(d)) },
      { key: 'port', label: 'Port', type: 'number', half: true,
        hidden: (d) => !['rdp', 'vnc', 'ssh'].includes(proto(d)) },
      { key: 'username', label: 'Username', type: 'text', half: true,
        hidden: (d) => !['rdp', 'ssh'].includes(proto(d)) },
      { key: 'machineId', label: 'Machine ID', type: 'text', half: true, placeholder: '123 456 789',
        hidden: (d) => !['anydesk', 'teamviewer'].includes(proto(d)) },
      { key: 'url', label: 'Link', type: 'url',
        hidden: (d) => !['parsec', 'chrome', 'web'].includes(proto(d)),
        help: 'The URL you open to connect (e.g. remotedesktop.google.com/access/session/…).' },
      { key: 'purpose', label: 'Used for', type: 'text', half: true, placeholder: 'CAD, CNC, DAQ' },
      { key: 'location', label: 'Location', type: 'text', half: true, suggest: true },
      { key: 'notes', label: 'Notes', type: 'textarea',
        help: 'Don’t put passwords here — keep them in the team password manager.' },
    ],
  },
  {
    key: 'contacts',
    type: 'contact',
    label: 'Contacts',
    singular: 'Contact',
    icon: 'users',
    group: 'team',
    blurb: 'Suppliers, partners, customers and anyone else we work with.',
    title: (d) => String(d.name ?? 'Unnamed'),
    subtitle: (d) => [d.role, d.company].filter(Boolean).join(' · '),
    columns: ['kind', 'company', 'email', 'phone'],
    searchText: (d) => [d.email, d.phone, d.accountNumber, (d.tags as string[] | undefined)?.join(' ')].join(' '),
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'kind', label: 'Type', type: 'select', half: true, initial: 'person', options: [
        { value: 'person', label: 'Person' },
        { value: 'supplier', label: 'Supplier', tone: 'info' },
        { value: 'customer', label: 'Customer', tone: 'good' },
        { value: 'partner', label: 'Partner', tone: 'accent' },
        { value: 'service', label: 'Service / venue' },
      ] },
      { key: 'company', label: 'Company', type: 'text', half: true, suggest: true },
      { key: 'role', label: 'Role', type: 'text', half: true },
      { key: 'email', label: 'Email', type: 'email', half: true },
      { key: 'phone', label: 'Phone', type: 'phone', half: true },
      { key: 'website', label: 'Website', type: 'url', half: true },
      { key: 'accountNumber', label: 'Our account no.', type: 'text', half: true },
      { key: 'address', label: 'Address', type: 'textarea', rows: 2 },
      { key: 'tags', label: 'Tags', type: 'tags' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'templates',
    type: 'template',
    label: 'Templates',
    singular: 'Template',
    icon: 'file',
    group: 'team',
    blurb: 'Starting points for forms, reports and letters. Google Docs links open as a fresh copy.',
    title: (d) => String(d.name ?? 'Untitled template'),
    subtitle: (d) => String(d.category ?? ''),
    columns: ['category', 'url'],
    searchText: (d) => String(d.body ?? ''),
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Static fire test report' },
      { key: 'category', label: 'Category', type: 'text', suggest: true, half: true, placeholder: 'Reports' },
      { key: 'url', label: 'Document link', type: 'url', half: true,
        help: 'Google Docs/Sheets/Slides links get a “Make a copy” button.' },
      { key: 'body', label: 'Text template', type: 'textarea', rows: 10,
        help: 'Optional. Plain text people can copy, e.g. an email or checklist.' },
      { key: 'notes', label: 'When to use it', type: 'textarea', rows: 2 },
    ],
  },
  {
    key: 'links',
    type: 'link',
    label: 'Links',
    singular: 'Link',
    icon: 'link',
    group: 'team',
    blurb: 'Shared drives, calendars, tools and accounts — pinned to the home page.',
    title: (d) => String(d.name ?? 'Untitled link'),
    subtitle: (d) => String(d.description ?? ''),
    columns: ['category', 'url'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Team Drive' },
      { key: 'url', label: 'URL', type: 'url', required: true },
      { key: 'category', label: 'Group', type: 'text', suggest: true, half: true, placeholder: 'Drive, Tools, Accounts' },
      { key: 'description', label: 'Description', type: 'text', half: true },
    ],
  },
]

export const byKey = new Map(COLLECTIONS.map((c) => [c.key, c]))
export const byType = new Map(COLLECTIONS.map((c) => [c.type, c]))

export function labelOf(options: Option[] | undefined, value: unknown): string {
  return options?.find((o) => o.value === value)?.label ?? String(value ?? '')
}

export function toneOf(options: Option[] | undefined, value: unknown): Tone {
  return options?.find((o) => o.value === value)?.tone ?? 'neutral'
}

export function recordTitle(rec: Rec | undefined): string {
  if (!rec) return '—'
  return byType.get(rec.type)?.title(rec.data) ?? rec.id
}

export function initialData(c: Collection, extra: Data = {}): Data {
  const d: Data = {}
  for (const f of c.fields) {
    if (f.initial !== undefined) d[f.key] = typeof f.initial === 'function' ? (f.initial as () => unknown)() : f.initial
  }
  return { ...d, ...extra }
}
