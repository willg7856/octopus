import {
  HARDWARE_KIND_LABELS,
  HARDWARE_STATUS_LABELS,
  TEST_KIND_LABELS,
  TEST_RESULT_LABELS,
} from './hardwareData'
import type {
  HardwareProgressNote,
  HardwareUnit,
  TestLogEntry,
} from './types'

type ExportInput = {
  units: HardwareUnit[]
  progress: HardwareProgressNote[]
  tests: TestLogEntry[]
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

function buildCsv({ units, progress, tests }: ExportInput) {
  const unitName = (id: string) =>
    units.find((u) => u.id === id)?.name ?? id

  const lines: string[] = [
    '# Octopus hardware lab export',
    `# exported,${new Date().toISOString()}`,
    '',
    '## hardware_units',
    'id,name,kind,serial,hw_rev,fw_version,status,location,owner,notes,updated_at',
    ...units.map((u) =>
      [
        u.id,
        csvEscape(u.name),
        HARDWARE_KIND_LABELS[u.kind],
        csvEscape(u.serial),
        csvEscape(u.hwRev),
        csvEscape(u.fwVersion ?? ''),
        HARDWARE_STATUS_LABELS[u.status],
        csvEscape(u.location ?? ''),
        csvEscape(u.owner ?? ''),
        csvEscape(u.notes ?? ''),
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
  ]

  return lines.join('\n')
}
