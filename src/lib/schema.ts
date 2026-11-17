/**
 * Every module in Octopus is a "collection" described here. Lists, forms, search,
 * CSV export/import and detail pages are all generated from these definitions, so
 * adding a new module is mostly a matter of adding an entry to COLLECTIONS.
 */
import { fmtTime12 } from './derive'
import type { Data, Rec } from './types'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'date'
  | 'time'
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
  group: 'work' | 'money' | 'team' | 'site'
}

export type IconName =
  | 'home'
  | 'image'
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
  | 'chart'
  | 'alert'
  | 'play'

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
    key: 'income',
    type: 'income',
    label: 'Income',
    singular: 'Income',
    icon: 'wallet',
    group: 'money',
    blurb: 'Money coming in — sponsorships, grants, sales, donations and prizes.',
    title: (d) => String(d.title ?? 'Untitled income'),
    subtitle: (d) => String(d.reference ?? ''),
    columns: ['amount', 'category', 'from', 'date', 'status'],
    searchText: (d) => String(d.notes ?? ''),
    fields: [
      { key: 'title', label: 'What for', type: 'text', required: true, placeholder: 'e.g. Engineering faculty sponsorship' },
      { key: 'amount', label: 'Amount', type: 'money', required: true, half: true },
      { key: 'date', label: 'Date', type: 'date', required: true, half: true, initial: today },
      { key: 'category', label: 'Type', type: 'select', half: true, initial: 'sponsorship', options: [
        { value: 'sponsorship', label: 'Sponsorship', tone: 'accent' },
        { value: 'grant', label: 'Grant', tone: 'info' },
        { value: 'sales', label: 'Sales', tone: 'good' },
        { value: 'donation', label: 'Donation', tone: 'neutral' },
        { value: 'prize', label: 'Prize', tone: 'warn' },
        { value: 'other', label: 'Other', tone: 'neutral' },
      ] },
      { key: 'status', label: 'Status', type: 'select', half: true, required: true, initial: 'received', options: [
        { value: 'expected', label: 'Expected', tone: 'warn' },
        { value: 'received', label: 'Received', tone: 'good' },
      ] },
      { key: 'from', label: 'From', type: 'ref', ref: 'contact', half: true },
      { key: 'reference', label: 'Invoice / reference', type: 'text', half: true },
      { key: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
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
    key: 'countdowns',
    type: 'countdown',
    label: 'Countdowns',
    singular: 'Countdown',
    icon: 'clock',
    group: 'work',
    blurb: 'T-minus clocks to launches, static fires and deadlines. The next few also show on Home.',
    title: (d) => String(d.name ?? 'Untitled countdown'),
    subtitle: (d) => [d.date && String(d.date).split('-').reverse().join('/'), d.time && fmtTime12(d.time)].filter(Boolean).join(' · '),
    columns: ['date', 'time', 'category', 'public'],
    searchText: (d) => String(d.notes ?? ''),
    fields: [
      { key: 'name', label: 'What’s happening', type: 'text', required: true, placeholder: 'e.g. Static fire 3, Grant report due' },
      { key: 'date', label: 'Date', type: 'date', required: true, half: true },
      { key: 'time', label: 'Time', type: 'time', half: true,
        help: 'Optional, e.g. 2:30 pm. Leave blank for midnight at the start of the day.' },
      { key: 'category', label: 'Type', type: 'select', half: true, initial: 'deadline', options: [
        { value: 'launch', label: 'Launch', tone: 'accent' },
        { value: 'test', label: 'Test / static fire', tone: 'warn' },
        { value: 'deadline', label: 'Deadline', tone: 'bad' },
        { value: 'event', label: 'Event', tone: 'info' },
        { value: 'milestone', label: 'Milestone', tone: 'good' },
      ] },
      { key: 'public', label: 'On the website', type: 'select', half: true, initial: 'hidden', options: [
        { value: 'hidden', label: 'Team only', tone: 'neutral' },
        { value: 'shown', label: 'Shown publicly', tone: 'good' },
      ] },
      { key: 'status', label: 'Test status', type: 'select', half: true, initial: 'scheduled',
        hidden: (d) => d.category !== 'test' && d.category !== 'launch', options: [
        { value: 'scheduled', label: 'GO', tone: 'good' },
        { value: 'hold', label: 'Hold', tone: 'warn' },
        { value: 'live', label: 'In progress', tone: 'bad' },
        { value: 'done', label: 'Complete', tone: 'good' },
        { value: 'scrubbed', label: 'Scrubbed', tone: 'neutral' },
      ] },
      { key: 'stream', label: 'Livestream link', type: 'url', half: true, placeholder: 'YouTube / X / Twitch link',
        hidden: (d) => d.category !== 'test' && d.category !== 'launch' },
      { key: 'result', label: 'Result (public)', type: 'textarea', rows: 2,
        hidden: (d) => d.category !== 'test' && d.category !== 'launch',
        help: 'Shown on beyondstagezero.space once the test is complete.' },
      { key: 'telemetry', label: 'Live sensor data on .space', type: 'select', half: true, initial: '30',
        hidden: (d) => d.category !== 'test' && d.category !== 'launch', options: [
        { value: 'off', label: 'Team only', tone: 'neutral' },
        { value: '10', label: '10 s delay', tone: 'good' },
        { value: '30', label: '30 s delay', tone: 'good' },
        { value: '60', label: '60 s delay', tone: 'good' },
        { value: 'after', label: 'After the test', tone: 'info' },
      ] },
      { key: 'notes', label: 'Notes (team only)', type: 'textarea', rows: 2 },
    ],
  },
  {
    key: 'live-updates',
    type: 'liveupdate',
    label: 'Live updates',
    singular: 'Live update',
    icon: 'clock',
    group: 'site',
    hiddenInNav: true,
    blurb: 'Updates posted during a test, shown on beyondstagezero.space.',
    title: (d) => String(d.text ?? '').slice(0, 80) || 'Update',
    columns: ['test', 'kind'],
    fields: [
      { key: 'text', label: 'Update', type: 'text', required: true, placeholder: 'e.g. Igniter armed. Range is clear.' },
      { key: 'test', label: 'Test', type: 'ref', ref: 'countdown', required: true, half: true },
      { key: 'kind', label: 'Type', type: 'select', half: true, initial: 'update', options: [
        { value: 'update', label: 'Update', tone: 'neutral' },
        { value: 'milestone', label: 'Milestone', tone: 'accent' },
        { value: 'hold', label: 'Hold', tone: 'warn' },
        { value: 'go', label: 'Go', tone: 'good' },
        { value: 'result', label: 'Result', tone: 'info' },
      ] },
    ],
  },
  {
    key: 'public-stats',
    type: 'stat',
    label: 'Headline numbers',
    singular: 'Headline number',
    icon: 'monitor',
    group: 'site',
    hiddenInNav: true,
    blurb: 'The track-record numbers on beyondstagezero.com. Change one here and the website updates within a minute.',
    title: (d) => String(d.label ?? 'Untitled number'),
    subtitle: (d) => (d.visible === 'hidden' ? 'Hidden from the website' : ''),
    columns: ['value', 'visible', 'order'],
    fields: [
      { key: 'label', label: 'Label', type: 'text', required: true, placeholder: 'e.g. Static fires completed' },
      { key: 'value', label: 'Value', type: 'text', required: true, half: true, placeholder: 'e.g. 4, 8, Apr 2025' },
      { key: 'suffix', label: 'Unit / suffix', type: 'text', half: true, placeholder: 'e.g. kN, s (optional)' },
      { key: 'description', label: 'Note', type: 'text', placeholder: 'Line under the number, e.g. “Mk I & Mk II campaigns logged and published”' },
      { key: 'visible', label: 'On the website', type: 'select', required: true, half: true, initial: 'shown', options: [
        { value: 'shown', label: 'Shown', tone: 'good' },
        { value: 'hidden', label: 'Hidden', tone: 'neutral' },
      ] },
      { key: 'order', label: 'Position', type: 'number', half: true, help: 'Lower numbers show first.' },
    ],
  },
  {
    key: 'campaigns',
    type: 'campaign',
    label: 'Test campaigns',
    singular: 'Campaign',
    icon: 'list',
    group: 'site',
    hiddenInNav: true,
    blurb: 'Groups of static fires on the Tests page of beyondstagezero.com (e.g. C-02, Mk II).',
    title: (d) => [d.code, d.engine].filter(Boolean).join(' · ') || 'Untitled campaign',
    subtitle: (d) => String(d.dateLabel ?? ''),
    columns: ['code', 'engine', 'dateLabel', 'order'],
    searchText: (d) => String(d.objective ?? ''),
    fields: [
      { key: 'code', label: 'Code', type: 'text', required: true, half: true, placeholder: 'e.g. C-03' },
      { key: 'engine', label: 'Engine', type: 'text', half: true, placeholder: 'e.g. B1M' },
      { key: 'dateLabel', label: 'Date', type: 'text', half: true, placeholder: 'e.g. 26 Apr 2026',
        help: 'As it should appear on the website.' },
      { key: 'order', label: 'Position', type: 'number', half: true, help: 'Lower numbers show first. Newest campaign first is usual.' },
      { key: 'objective', label: 'Objective', type: 'textarea', rows: 3, placeholder: 'What this campaign is testing.' },
      { key: 'photos', label: 'Photos', type: 'textarea', rows: 3, placeholder: 'https://… | Setting up the range before sunrise',
        help: 'Optional. One per line: a photo address, then | and a caption. Copy an address from the Gallery page in Octopus (Open the full photo).' },
      { key: 'drive', label: 'Google Drive folder', type: 'url', placeholder: 'https://drive.google.com/drive/folders/…' },
    ],
  },
  {
    key: 'test-log',
    type: 'firing',
    label: 'Test log',
    singular: 'Test log entry',
    icon: 'list',
    group: 'site',
    hiddenInNav: true,
    blurb: 'Static fires on the Tests page of beyondstagezero.com, with results, data and what we learned.',
    title: (d) => String(d.code || 'Untitled test'),
    subtitle: (d) => [d.engine, d.result === 'success' ? 'Success' : d.result === 'partial' ? 'Partial' : d.result === 'failure' ? 'Failure' : '', d.status === 'draft' ? 'Draft' : ''].filter(Boolean).join(' · '),
    columns: ['date', 'campaign', 'result', 'status'],
    searchText: (d) => [d.observations, d.learned, d.notes].filter(Boolean).join(' '),
    fields: [
      { key: 'code', label: 'Test', type: 'text', required: true, half: true, placeholder: 'e.g. SF-05' },
      { key: 'campaign', label: 'Campaign', type: 'ref', ref: 'campaign', half: true },
      { key: 'date', label: 'Date', type: 'date', required: true, half: true, initial: today },
      { key: 'result', label: 'Result', type: 'select', required: true, half: true, initial: 'success', options: [
        { value: 'success', label: 'Success', tone: 'good' },
        { value: 'partial', label: 'Partial', tone: 'warn' },
        { value: 'failure', label: 'Failure', tone: 'bad' },
      ] },
      { key: 'test', label: 'Countdown / sensor data', type: 'ref', ref: 'countdown',
        refFilter: (d) => d.category === 'test' || d.category === 'launch',
        help: 'The test countdown this firing ran under. Its sensor data gives the burn time, thrust and impulse.' },
      { key: 'engine', label: 'Engine', type: 'text', half: true, placeholder: 'e.g. B1M — 550 mm × 80 mm' },
      { key: 'grade', label: 'Oxidiser grade', type: 'text', half: true, suggest: true, placeholder: 'e.g. Technical grade' },
      { key: 'propellant', label: 'Propellant', type: 'text', half: true, suggest: true, placeholder: 'e.g. KNO₃ / Sorbitol — 65:35' },
      { key: 'mass', label: 'Propellant mass', type: 'text', half: true, placeholder: 'e.g. 2.9 kg' },
      { key: 'burnTime', label: 'Burn time', type: 'text', half: true, placeholder: 'e.g. 3.1 s' },
      { key: 'peakThrust', label: 'Peak thrust', type: 'text', half: true, placeholder: 'e.g. 204 kgf' },
      { key: 'impulse', label: 'Total impulse', type: 'text', half: true, placeholder: 'e.g. 5,980 N·s (M)' },
      { key: 'peakPressure', label: 'Peak chamber pressure', type: 'text', half: true, placeholder: 'e.g. 1,050 psi' },
      { key: 'observations', label: 'Observations', type: 'textarea', rows: 5, placeholder: 'One per line.',
        help: 'One observation per line. Each becomes a bullet point.' },
      { key: 'learned', label: 'What we learned', type: 'textarea', rows: 4 },
      { key: 'photo', label: 'Photo', type: 'text', placeholder: 'https://… (optional)',
        help: 'A photo address, e.g. from the Gallery page in Octopus (Open the full photo).' },
      { key: 'photoCaption', label: 'Photo caption', type: 'text', half: true },
      { key: 'photoShape', label: 'Photo shape', type: 'select', half: true, initial: 'landscape', options: [
        { value: 'landscape', label: 'Landscape (full width)' },
        { value: 'portrait', label: 'Portrait (beside the details)' },
      ] },
      { key: 'video', label: 'YouTube video', type: 'url', placeholder: 'https://youtu.be/… (optional)' },
      { key: 'drive', label: 'Google Drive folder', type: 'url', placeholder: 'https://drive.google.com/drive/folders/…',
        help: 'Raw data, photos, videos and documents for this test. Team only.' },
      { key: 'status', label: 'On the website', type: 'select', required: true, half: true, initial: 'draft', options: [
        { value: 'published', label: 'Published', tone: 'good' },
        { value: 'draft', label: 'Draft — team only', tone: 'warn' },
      ] },
      { key: 'notes', label: 'Notes (team only)', type: 'textarea', rows: 3 },
    ],
  },
  {
    key: 'gallery',
    type: 'photo',
    label: 'Gallery',
    singular: 'Photo',
    icon: 'image',
    group: 'site',
    hiddenInNav: true,
    blurb: 'Photos on the Gallery page of beyondstagezero.com.',
    title: (d) => String(d.caption || 'Untitled photo'),
    subtitle: (d) => [d.kind === 'render' ? 'Render' : d.kind === 'team' ? 'Team' : 'Photo', d.visible === 'hidden' ? 'Hidden' : ''].filter(Boolean).join(' · '),
    columns: ['kind', 'visible'],
    fields: [
      { key: 'caption', label: 'Caption', type: 'text', placeholder: 'e.g. SF-04 burning, 26 April 2026.' },
      { key: 'kind', label: 'Type', type: 'select', required: true, half: true, initial: 'photo', options: [
        { value: 'photo', label: 'Photo', tone: 'neutral' },
        { value: 'render', label: 'Render', tone: 'info' },
        { value: 'team', label: 'Team', tone: 'accent' },
        { value: 'video', label: 'Video', tone: 'warn' },
      ] },
      { key: 'visible', label: 'On the website', type: 'select', required: true, half: true, initial: 'shown', options: [
        { value: 'shown', label: 'Shown', tone: 'good' },
        { value: 'hidden', label: 'Hidden', tone: 'neutral' },
      ] },
    ],
  },
  {
    key: 'upcoming-tests',
    type: 'upnext',
    label: 'Upcoming tests',
    singular: 'Upcoming test',
    icon: 'play',
    group: 'site',
    hiddenInNav: true,
    blurb: 'The “Next tests” cards on the Tests page of beyondstagezero.com.',
    title: (d) => String(d.title ?? 'Untitled test'),
    subtitle: (d) => [d.code, d.status, d.visible === 'hidden' ? 'Hidden' : ''].filter(Boolean).join(' · '),
    columns: ['code', 'status', 'visible', 'order'],
    searchText: (d) => [d.note, d.steps].filter(Boolean).join(' '),
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. B1M pressure test campaign' },
      { key: 'code', label: 'Card label', type: 'text', half: true, placeholder: 'e.g. Next, C-03',
        help: 'The small label at the top of the card.' },
      { key: 'status', label: 'Status', type: 'text', half: true, suggest: true, placeholder: 'e.g. In progress, Pending approval, Planned' },
      { key: 'engine', label: 'Engine / vehicle', type: 'text', placeholder: 'e.g. B1M — 550 mm × 80 mm' },
      { key: 'note', label: 'Description', type: 'textarea', rows: 6, placeholder: 'What the test is and why it matters, in a few plain sentences.' },
      { key: 'steps', label: 'Steps', type: 'textarea', rows: 6, placeholder: '50 psi | 2 Nov\n100 psi | NET 14 Nov\n500 psi',
        help: 'One step per line, in order. Add a date after a | (e.g. “150 psi | NET 21 Nov”), or leave it off. Leave the box empty for no steps.' },
      { key: 'linkText', label: 'Link text', type: 'text', half: true, placeholder: 'e.g. Engine development updates' },
      { key: 'link', label: 'Link', type: 'text', half: true, placeholder: '/b1m-engine or https://…',
        help: 'Optional. A page on the site (starting with /) or a full web address.' },
      { key: 'visible', label: 'On the website', type: 'select', required: true, half: true, initial: 'shown', options: [
        { value: 'shown', label: 'Shown', tone: 'good' },
        { value: 'hidden', label: 'Hidden', tone: 'neutral' },
      ] },
      { key: 'order', label: 'Position', type: 'number', half: true, help: 'Lower numbers show first.' },
    ],
  },
  {
    key: 'news',
    type: 'post',
    label: 'News posts',
    singular: 'News post',
    icon: 'file',
    group: 'site',
    hiddenInNav: true,
    blurb: 'Updates on the News page of beyondstagezero.com, newest first.',
    title: (d) => String(d.title ?? 'Untitled post'),
    subtitle: (d) => [d.tag, d.status === 'draft' ? 'Draft' : ''].filter(Boolean).join(' · '),
    columns: ['date', 'tag', 'status'],
    searchText: (d) => String(d.body ?? ''),
    fields: [
      { key: 'title', label: 'Headline', type: 'text', required: true, placeholder: 'e.g. 100 psi pressure test passed' },
      { key: 'body', label: 'Post', type: 'textarea', required: true, rows: 8, placeholder: 'What happened, in a few plain sentences.' },
      { key: 'tag', label: 'Tag', type: 'text', half: true, suggest: true, placeholder: 'Testing, Programme, Data link' },
      { key: 'date', label: 'Date', type: 'date', required: true, half: true, initial: today },
      { key: 'status', label: 'Status', type: 'select', required: true, half: true, initial: 'published', options: [
        { value: 'published', label: 'Published — on the website', tone: 'good' },
        { value: 'draft', label: 'Draft — not shown', tone: 'warn' },
      ] },
      { key: 'dateLabel', label: 'Show date as', type: 'text', half: true, placeholder: 'e.g. May 2026 (optional)',
        help: 'Leave blank to show the full date.' },
      { key: 'link', label: 'Read more link', type: 'url', placeholder: 'Optional — e.g. a page on the site or a video' },
    ],
  },
  {
    key: 'site-notice',
    type: 'notice',
    label: 'Site notice',
    singular: 'Site notice',
    icon: 'alert',
    group: 'site',
    hiddenInNav: true,
    blurb: 'The banner on the home, B1M and Tests pages — what’s happening right now.',
    title: (d) => String(d.title ?? 'Untitled notice'),
    subtitle: (d) => String(d.label ?? ''),
    columns: ['label', 'active'],
    fields: [
      { key: 'label', label: 'Small label', type: 'text', half: true, placeholder: 'e.g. Static fire', initial: 'Static fire' },
      { key: 'active', label: 'On the website', type: 'select', required: true, half: true, initial: 'on', options: [
        { value: 'on', label: 'Showing', tone: 'good' },
        { value: 'off', label: 'Hidden', tone: 'neutral' },
      ] },
      { key: 'title', label: 'Message', type: 'text', required: true, placeholder: 'e.g. Our first B1M static fire is pending regulatory approval.' },
      { key: 'link', label: 'Link', type: 'url', half: true, placeholder: 'Optional' },
      { key: 'linkText', label: 'Link text', type: 'text', half: true, placeholder: 'e.g. Watch live' },
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
