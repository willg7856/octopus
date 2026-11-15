export type Data = Record<string, unknown>

/** A saved record as the server returns it. */
export interface Rec<D = Data> {
  id: string
  type: string
  data: D
  version: number
  rev: number
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
  /** Client-only: true while a save for this record is in flight. */
  pending?: boolean
}

export interface User {
  email: string
  name: string
  role: 'admin' | 'member'
}

export interface TeamMember extends User {
  hasPassword: boolean
  disabled: boolean
  locked: boolean
  createdAt: string | null
  lastLoginAt: string | null
}

export interface HistoryEntry {
  seq: string | null
  recordId: string
  type: string
  action: 'create' | 'update' | 'delete' | 'restore'
  data: Data
  version: number
  at: string
  by: string | null
}

export type Op =
  | { op: 'create'; id: string; type: string; data: Data }
  | { op: 'update'; id: string; version: number; data: Data }
  | { op: 'delete'; id: string; version: number }
  | { op: 'restore'; id: string }

/* ---------- Domain shapes (all fields optional on the wire; forms enforce required) ---------- */

export type Item = {
  name: string
  partNumber?: string
  kind?: 'made' | 'bought' | 'consumable' | 'raw' | 'tool'
  unit?: string
  location?: string
  minQty?: number
  unitCost?: number
  supplier?: string
  supplierPartNo?: string
  orderUrl?: string
  process?: string
  revision?: string
  tags?: string[]
  notes?: string
}

export type MovementKind = 'made' | 'received' | 'used' | 'adjusted' | 'scrapped'

export type Movement = {
  item: string
  kind: MovementKind
  qty: number
  date?: string
  process?: string
  order?: string
  serials?: string
  lot?: string
  by?: string
  notes?: string
}

export type OrderLine = {
  item?: string
  description?: string
  qty?: number
  unitPrice?: number
}

export type OrderStatus = 'requested' | 'approved' | 'ordered' | 'shipped' | 'received' | 'cancelled'

export type Order = {
  title: string
  supplier?: string
  status: OrderStatus
  orderNumber?: string
  lines?: OrderLine[]
  shipping?: number
  budget?: string
  requestedBy?: string
  orderedAt?: string
  expectedAt?: string
  receivedAt?: string
  url?: string
  tracking?: string
  invoiceUrl?: string
  notes?: string
}

export type Budget = {
  name: string
  category?: string
  period?: string
  amount?: number
  owner?: string
  notes?: string
}

export type Desktop = {
  name: string
  protocol: 'rdp' | 'vnc' | 'ssh' | 'anydesk' | 'teamviewer' | 'parsec' | 'chrome' | 'web'
  host?: string
  port?: number
  username?: string
  url?: string
  machineId?: string
  location?: string
  purpose?: string
  inUseBy?: string
  inUseSince?: string
  notes?: string
}

export type Template = {
  name: string
  category?: string
  url?: string
  body?: string
  notes?: string
}
