import type { TelemetryPoint } from './types'

const KGF_TO_N = 9.80665

export type BurnStats = {
  burnTime: number
  totalImpulseNs: number
  maxThrustN: number
  maxThrustKgf: number
  avgThrustN: number
  maxPressurePsi: number
  maxTempC: number
  maxThrustIndex: number
  burnoutIndex: number
}

/** Trapezoidal impulse from kgf samples → N·s */
export function computeBurnStats(curve: TelemetryPoint[]): BurnStats {
  if (curve.length < 2) {
    return {
      burnTime: 0,
      totalImpulseNs: 0,
      maxThrustN: 0,
      maxThrustKgf: 0,
      avgThrustN: 0,
      maxPressurePsi: 0,
      maxTempC: 0,
      maxThrustIndex: 0,
      burnoutIndex: 0,
    }
  }

  let impulseNs = 0
  let maxThrustKgf = 0
  let maxThrustIndex = 0
  let maxPressurePsi = 0
  let maxTempC = 0

  for (let i = 0; i < curve.length; i++) {
    const p = curve[i]
    if (p.thrust > maxThrustKgf) {
      maxThrustKgf = p.thrust
      maxThrustIndex = i
    }
    if (p.pressure > maxPressurePsi) maxPressurePsi = p.pressure
    if (p.temp > maxTempC) maxTempC = p.temp
    if (i > 0) {
      const dt = curve[i].t - curve[i - 1].t
      const avgKgf = (curve[i].thrust + curve[i - 1].thrust) / 2
      impulseNs += avgKgf * KGF_TO_N * dt
    }
  }

  // Burnout ≈ last sample where thrust stays above 5% of peak
  const threshold = maxThrustKgf * 0.05
  let burnoutIndex = curve.length - 1
  for (let i = curve.length - 1; i >= 0; i--) {
    if (curve[i].thrust >= threshold) {
      burnoutIndex = i
      break
    }
  }

  const burnTime = curve[burnoutIndex]?.t ?? curve[curve.length - 1].t
  const avgThrustN = burnTime > 0 ? impulseNs / burnTime : 0

  return {
    burnTime,
    totalImpulseNs: impulseNs,
    maxThrustN: maxThrustKgf * KGF_TO_N,
    maxThrustKgf,
    avgThrustN,
    maxPressurePsi,
    maxTempC,
    maxThrustIndex,
    burnoutIndex,
  }
}

export function impulseToIndex(curve: TelemetryPoint[], upTo: number) {
  let impulseNs = 0
  const end = Math.min(upTo, curve.length - 1)
  for (let i = 1; i <= end; i++) {
    const dt = curve[i].t - curve[i - 1].t
    const avgKgf = (curve[i].thrust + curve[i - 1].thrust) / 2
    impulseNs += avgKgf * KGF_TO_N * dt
  }
  return impulseNs
}

export { KGF_TO_N }
