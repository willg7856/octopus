import type { EventItem, OpMode, TelemetryPoint, VehicleSample } from './types'
import { KGF_TO_N } from './motorStats'

type ExportInput = {
  operationId: string
  mode: OpMode
  events: EventItem[]
  thrustCurve: TelemetryPoint[]
  vehicleCurve: VehicleSample[]
}

export function downloadSessionExport(input: ExportInput) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const name = `octopus-${input.operationId}-${stamp}.csv`
  const csv = buildCsv(input)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function buildCsv({
  operationId,
  mode,
  events,
  thrustCurve,
  vehicleCurve,
}: ExportInput) {
  const lines: string[] = [
    `# Octopus session export`,
    `# operation,${operationId}`,
    `# mode,${mode}`,
    `# exported,${new Date().toISOString()}`,
    '',
    '## events',
    'time,level,source,message',
    ...events.map(
      (e) =>
        `${e.time},${e.level},${e.source},"${e.message.replace(/"/g, '""')}"`,
    ),
    '',
  ]

  if (mode === 'launch') {
    lines.push('## vehicle')
    lines.push('t_s,altitude_m,velocity_m_s,accel_g,battery_v,gps_sats')
    for (const p of vehicleCurve) {
      lines.push(
        [
          p.t.toFixed(2),
          p.altitude.toFixed(1),
          p.velocity.toFixed(1),
          p.accel.toFixed(2),
          p.batteryV.toFixed(2),
          String(p.gpsSats),
        ].join(','),
      )
    }
  } else {
    lines.push('## pad_burn')
    lines.push('t_s,thrust_n,thrust_kgf,pressure_psi,temp_c')
    for (const p of thrustCurve) {
      lines.push(
        [
          p.t.toFixed(3),
          (p.thrust * KGF_TO_N).toFixed(1),
          p.thrust.toFixed(2),
          p.pressure.toFixed(1),
          p.temp.toFixed(1),
        ].join(','),
      )
    }
  }

  return lines.join('\n')
}
