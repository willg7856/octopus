import {
  HARDWARE_KIND_LABELS,
  HARDWARE_STATUS_LABELS,
  PROCESS_STEP_STATUS_LABELS,
  STOCK_STATUS_LABELS,
  TEST_KIND_LABELS,
  TEST_RESULT_LABELS,
  isInventoryKind,
  stockStatusOf,
  unitOnOrderQty,
  unitPriceOf,
  unitQuantity,
} from './hardwareData'
import type {
  HardwareProgressNote,
  HardwareUnit,
  TestLogEntry,
  VehicleProcess,
} from './types'

type ExportInput = {
  units: HardwareUnit[]
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
  processes?: VehicleProcess[]
}

export function downloadHardwareLabExport(input: ExportInput) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const name = `octopus-hardware-lab-${stamp}.csv`
  const csv = buildCsv(input)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function buildCsv({ units, progress, tests, processes = [] }: ExportInput) {
  const unitName = (id: string) =>
    units.find((u) => u.id === id)?.name ?? id

  const lines: string[] = [
    '# Octopus hardware lab export',
    `# exported,${new Date().toISOString()}`,
    '',
    '## hardware_units',
    'id,name,kind,serial,part_number,qty_on_hand,qty_on_order,unit_price_aud,min_qty,hw_rev,fw_version,status,stock_status,order_url,ordered_at,expected_at,program,parent_unit_id,parent_unit_name,location,owner,notes,notes_important,updated_at',
    ...units.map((u) =>
      [
        u.id,
        csvEscape(u.name),
        HARDWARE_KIND_LABELS[u.kind],
        csvEscape(u.serial),
        csvEscape(u.partNumber ?? ''),
        String(unitQuantity(u)),
        String(unitOnOrderQty(u)),
        unitPriceOf(u) != null ? String(unitPriceOf(u)) : '',
        u.minQty != null ? String(u.minQty) : '',
        csvEscape(u.hwRev),
        csvEscape(u.fwVersion ?? ''),
        HARDWARE_STATUS_LABELS[u.status],
        isInventoryKind(u.kind) ? STOCK_STATUS_LABELS[stockStatusOf(u)] : '',
        csvEscape(u.orderUrl ?? ''),
        u.orderedAt ?? '',
        u.expectedAt ?? '',
        csvEscape(u.program ?? ''),
        u.parentVehicleId ?? '',
        csvEscape(u.parentVehicleId ? unitName(u.parentVehicleId) : ''),
        csvEscape(u.location ?? ''),
        csvEscape(u.owner ?? ''),
        csvEscape(u.notes ?? ''),
        u.notesImportant ? 'yes' : '',
        u.updatedAt,
      ].join(','),
    ),
    '',
    '## progress_notes',
    'id,unit_id,unit_name,date,status,note,author',
    ...progress.map((p) =>
      [
        p.id,
        p.unitId,
        csvEscape(unitName(p.unitId)),
        p.date,
        HARDWARE_STATUS_LABELS[p.status],
        csvEscape(p.note),
        csvEscape(p.author ?? ''),
      ].join(','),
    ),
    '',
    '## test_log',
    'id,date,title,kind,result,unit_ids,unit_names,site,operator,summary,metrics,data_ref,created_at',
    ...tests.map((t) => {
      const metrics = (t.metrics ?? [])
        .map((m) => `${m.key}=${m.value}${m.unit ? m.unit : ''}`)
        .join('; ')
      return [
        t.id,
        t.date,
        csvEscape(t.title),
        TEST_KIND_LABELS[t.kind],
        TEST_RESULT_LABELS[t.result],
        csvEscape(t.unitIds.join('|')),
        csvEscape(t.unitIds.map(unitName).join('|')),
        csvEscape(t.site ?? ''),
        csvEscape(t.operator ?? ''),
        csvEscape(t.summary),
        csvEscape(metrics),
        csvEscape(t.dataRef ?? ''),
        t.createdAt,
      ].join(',')
    }),
    '',
    '## vehicle_processes',
    'process_id,process_name,campaign,vehicle_unit_id,vehicle_name,step_order,step_title,step_status,step_owner,linked_units,blocked_reason,completed_at,completed_by',
    ...processes.flatMap((proc) =>
      [...proc.steps]
        .sort((a, b) => a.order - b.order)
        .map((step) =>
          [
            proc.id,
            csvEscape(proc.name),
            csvEscape(proc.campaign ?? ''),
            proc.vehicleUnitId,
            csvEscape(unitName(proc.vehicleUnitId)),
            String(step.order),
            csvEscape(step.title),
            PROCESS_STEP_STATUS_LABELS[step.status],
            csvEscape(step.owner ?? ''),
            csvEscape((step.linkedUnitIds ?? []).map(unitName).join('|')),
            csvEscape(step.blockedReason ?? ''),
            step.completedAt ?? '',
            csvEscape(step.completedBy ?? ''),
          ].join(','),
        ),
    ),
  ]

  return lines.join('\n')
}
