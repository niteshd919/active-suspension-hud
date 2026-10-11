import { RIDE_HEIGHT_MM, WADE } from '../config'
import type { Quad, SuspensionFault, TripStats } from './types'

/**
 * Simulated air-suspension health model. Every figure is derived either from long-term baselines
 * (the vehicle's history) or from what the simulation actually did this trip (stroke, heat, bump-stop
 * hits, wade exposure, compressor run time), so a hard drive visibly ages the hardware more.
 * These are plausible engineering estimates for a prototype, not manufacturer data.
 */

export type HealthStatus = 'GOOD' | 'WATCH' | 'SERVICE'

const RANK: Record<HealthStatus, number> = { GOOD: 0, WATCH: 1, SERVICE: 2 }
export const worst = (...list: HealthStatus[]): HealthStatus =>
  list.reduce<HealthStatus>((a, b) => (RANK[b] > RANK[a] ? b : a), 'GOOD')

export const CORNERS = [
  { id: 'FL', name: 'Front left', short: 'FL' },
  { id: 'FR', name: 'Front right', short: 'FR' },
  { id: 'RL', name: 'Rear left', short: 'RL' },
  { id: 'RR', name: 'Rear right', short: 'RR' },
] as const

/* ───────────────────────── thermal model ───────────────────────── */

export const THERMAL = {
  AMBIENT_C: 22,
  /** Heating (K/s) per (m/s)² of damper velocity: viscous damping turns stroke into heat. */
  HEAT_K: 6.5,
  /** Cooling time constant (s). Shortened from reality so the cool-down is visible in a demo. */
  COOL_TAU_S: 45,
  /** Residual micro-damping activity at motorway speed, as velocity variance at 30 m/s. */
  MICRO_VAR: 0.027,
} as const

/** Advance one damper's temperature by `dt` seconds. `v` is the damper velocity (m/s). */
export function stepDamperTemp(tempC: number, v: number, speedMs: number, dt: number): number {
  const activity = v * v + THERMAL.MICRO_VAR * Math.min(1, speedMs / 30)
  return tempC + (THERMAL.HEAT_K * activity - (tempC - THERMAL.AMBIENT_C) / THERMAL.COOL_TAU_S) * dt
}

/* ───────────────────────── pressure ───────────────────────── */

/** Static air-spring pressure at access and at wade height. The front axle carries more of the weight. */
const P_ACCESS: Quad = [5.9, 5.9, 5.3, 5.3]
const P_WADE: Quad = [8.2, 8.2, 7.4, 7.4]

export function airSpringPressureBar(corner: number, rideHeightMm: number): number {
  const span = RIDE_HEIGHT_MM.WADE - RIDE_HEIGHT_MM.ACCESS
  const t = Math.min(1.1, Math.max(0, (rideHeightMm - RIDE_HEIGHT_MM.ACCESS) / span))
  return P_ACCESS[corner] + (P_WADE[corner] - P_ACCESS[corner]) * t
}

/* ───────────────────────── life ───────────────────────── */

/** Remaining life (%) before this trip: the vehicle's history. Front axle works harder. */
const BASE_DAMPER_LIFE: Quad = [91.4, 90.2, 94.1, 93.3]
const BASE_SPRING_LIFE: Quad = [95.2, 94.6, 96.3, 96.0]
const RATED_KM = { damper: 160_000, spring: 150_000 } as const

const FAULT = { WORN_DAMPER_LIFE: 34, LEAK_BAR: 1.3, LEAK_RATE: 0.34, NORMAL_LEAK_RATE: 0.02 } as const

/* ───────────────────────── snapshot ───────────────────────── */

export interface CornerHealth {
  index: number
  id: string
  name: string
  short: string
  pressureBar: number
  pressureTargetBar: number
  springLifePct: number
  damperLifePct: number
  /** Life consumed this trip (percentage points). */
  springWearPct: number
  damperWearPct: number
  damperTempC: number
  peakTempC: number
  peakStrokeMm: number
  bumpStops: number
  /** The shorter-lived of spring and damper, as a percentage and as estimated distance. */
  lifePct: number
  remainingKm: number
  score: number
  status: HealthStatus
  issues: string[]
}

export interface SystemCheck {
  label: string
  status: HealthStatus
  detail: string
}

export interface HealthSnapshot {
  corners: CornerHealth[]
  overall: number
  status: HealthStatus
  system: SystemCheck[]
  advisories: string[]
}

export interface HealthInput {
  trip: TripStats
  tempsC: ArrayLike<number>
  rideHeightMm: number
  fault: SuspensionFault
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round1 = (v: number) => Math.round(v * 10) / 10

export function computeHealth({ trip, tempsC, rideHeightMm, fault }: HealthInput): HealthSnapshot {
  const km = trip.distanceM / 1000
  const waterBeyondLimit = trip.maxWaterMm > WADE.LIMIT_MM

  const corners = CORNERS.map((info, i): CornerHealth => {
    const target = airSpringPressureBar(i, rideHeightMm)
    const pressure = fault === 'LEAK_RR' && i === 3 ? target - FAULT.LEAK_BAR : target

    // Rough terrain, hard stops and heat age a damper; stroke, wading and silt age a bellows.
    const damperWear =
      ((km + trip.strokeM[i] * 2.5 + trip.bumpStops[i] * 4 + Math.max(0, trip.peakTempC[i] - 70) * 1.5) / RATED_KM.damper) * 100
    const springWear =
      ((km + trip.strokeM[i] + trip.wadeSeconds * 3 + (waterBeyondLimit ? 25 : 0)) / RATED_KM.spring) * 100
    const damperLife = clamp((fault === 'WORN_FL' && i === 0 ? FAULT.WORN_DAMPER_LIFE : BASE_DAMPER_LIFE[i]) - damperWear, 0, 100)
    const springLife = clamp(BASE_SPRING_LIFE[i] - springWear, 0, 100)

    const peak = Math.max(trip.peakTempC[i], tempsC[i])
    const stops = trip.bumpStops[i]
    const dev = pressure - target

    const issues: string[] = []
    let status: HealthStatus = 'GOOD'
    const flag = (level: HealthStatus, message: string) => {
      issues.push(message)
      status = worst(status, level)
    }
    if (Math.abs(dev) > 0.8) flag('SERVICE', `Air pressure ${Math.abs(dev).toFixed(1)} bar ${dev < 0 ? 'below' : 'above'} target. Check for a leak.`)
    else if (Math.abs(dev) > 0.4) flag('WATCH', `Air pressure ${Math.abs(dev).toFixed(1)} bar ${dev < 0 ? 'below' : 'above'} target.`)
    if (damperLife < 40) flag('SERVICE', `Damper life ${Math.round(damperLife)} %. Service soon.`)
    else if (damperLife < 70) flag('WATCH', `Damper life ${Math.round(damperLife)} %.`)
    if (springLife < 40) flag('SERVICE', `Air spring life ${Math.round(springLife)} %. Service soon.`)
    else if (springLife < 70) flag('WATCH', `Air spring life ${Math.round(springLife)} %.`)
    if (peak > 115) flag('SERVICE', `Damper reached ${Math.round(peak)} °C.`)
    else if (peak > 95) flag('WATCH', `Damper reached ${Math.round(peak)} °C. Let it cool.`)
    if (stops >= 12) flag('SERVICE', `Hit the bump stops ${stops} times.`)
    else if (stops >= 5) flag('WATCH', `Hit the bump stops ${stops} times.`)

    const pressureScore = 100 - clamp(Math.abs(dev) / 0.8, 0, 1) * 100
    const thermalScore = peak <= 85 ? 100 : clamp(100 - ((peak - 85) / 45) * 100, 0, 100)
    const impactScore = clamp(100 - stops * 5, 40, 100)
    const score = Math.round(damperLife * 0.3 + springLife * 0.25 + pressureScore * 0.25 + thermalScore * 0.1 + impactScore * 0.1)

    const limitingKm = Math.min((damperLife / 100) * RATED_KM.damper, (springLife / 100) * RATED_KM.spring)
    return {
      index: i,
      id: info.id,
      name: info.name,
      short: info.short,
      pressureBar: pressure,
      pressureTargetBar: target,
      springLifePct: round1(springLife),
      damperLifePct: round1(damperLife),
      springWearPct: Math.round(springWear * 100) / 100,
      damperWearPct: Math.round(damperWear * 100) / 100,
      damperTempC: tempsC[i],
      peakTempC: peak,
      peakStrokeMm: trip.peakStrokeMm[i],
      bumpStops: stops,
      lifePct: round1(Math.min(damperLife, springLife)),
      remainingKm: Math.round(limitingKm / 100) * 100,
      score,
      status,
      issues,
    }
  })

  const compressorDuty = trip.durationS > 0 ? (trip.compressorS / trip.durationS) * 100 : 0
  const leakRate = fault === 'LEAK_RR' ? FAULT.LEAK_RATE : FAULT.NORMAL_LEAK_RATE
  const system: SystemCheck[] = [
    {
      label: 'Compressor',
      status: compressorDuty > 35 ? 'WATCH' : 'GOOD',
      detail: trip.compressorS > 0 ? `${Math.round(compressorDuty)} % duty · ${Math.round(trip.compressorS)} s` : 'Idle this trip',
    },
    { label: 'Height sensors', status: 'GOOD', detail: '4 of 4 OK' },
    {
      label: 'Leak-down test',
      status: leakRate > 0.1 ? 'WATCH' : 'GOOD',
      detail: `−${leakRate.toFixed(2)} bar / 10 min`,
    },
  ]

  const advisories = corners
    .filter((c) => c.issues.length > 0)
    .sort((a, b) => (a.status === b.status ? a.index - b.index : a.status === 'SERVICE' ? -1 : 1))
    .map((c) => `${c.name}: ${c.issues[0]}`)
  if (fault === 'LEAK_RR') advisories.push('Leak-down test failed on the rear right air spring.')
  if (waterBeyondLimit) advisories.push(`Water reached ${Math.round(trip.maxWaterMm)} mm, past the ${WADE.LIMIT_MM} mm limit. Inspect air-spring bellows and compressor intake.`)
  if (advisories.length === 0) advisories.push('All four corners are within limits.')

  return {
    corners,
    overall: Math.round(corners.reduce((sum, c) => sum + c.score, 0) / corners.length),
    status: worst(...corners.map((c) => c.status), ...system.map((s) => s.status), waterBeyondLimit ? 'WATCH' : 'GOOD'),
    system,
    advisories: advisories.slice(0, 3),
  }
}

export const STATUS_WORD: Record<HealthStatus, string> = { GOOD: 'HEALTHY', WATCH: 'WATCH', SERVICE: 'SERVICE' }
export const CORNER_STATUS_WORD: Record<HealthStatus, string> = { GOOD: 'OK', WATCH: 'WATCH', SERVICE: 'SERVICE' }

/** One sentence for screen readers and speech. */
export function describeHealth(h: HealthSnapshot): string {
  const words = h.status === 'GOOD' ? 'healthy' : h.status === 'WATCH' ? 'needs attention' : 'service required'
  return `Suspension health ${h.overall} percent, ${words}. ${h.advisories[0]}`
}
