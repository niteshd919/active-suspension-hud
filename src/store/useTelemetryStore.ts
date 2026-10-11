import { create } from 'zustand'
import { WADE, RIDE_HEIGHT_MM, type HeightMode } from '../config'
import type { HealthSnapshot } from '../sim/health'
import { THERMAL } from '../sim/health'
import { emptyTrip, type Quad, type SuspensionFault, type TripStats } from '../sim/types'

export type { Quad, SuspensionFault, TripStats }
export { emptyTrip }

export type Phase = 'PRE_DRIVE' | 'ON_RIDE' | 'POST_DRIVE'
export type RideMode = 'HIGHWAY' | 'ROUGH' | 'FLOOD'
export type WadeStatus = 'INACTIVE' | 'NOMINAL' | 'RAISED' | 'WARNING' | 'EXCEEDED'
export type CameraView = 'auto' | 'side' | 'front' | 'rear' | 'top' | 'suspension'

export const TYRE_NOMINAL_BAR: Quad = [2.4, 2.4, 2.5, 2.5]
export const TYRE_OK_BAR: readonly [number, number] = [2.2, 2.7]

export interface Hazard {
  distanceM: number
  heightMm: number
}

/** Values derived by the 3D simulation, published at ~12 Hz for the 2D overlay. */
export interface LiveTelemetry {
  rideHeightMm: number
  speedKmh: number
  wheelTravelMm: Quad
  hazard: Hazard | null
  damperTempC: Quad
  /** Suspension health, computed only while parked after a drive. */
  health: HealthSnapshot | null
}

export interface TelemetryState {
  phase: Phase
  rideMode: RideMode
  /** 0..1 terrain severity (dev control). */
  roughness: number
  /** Wade sensor reading (mm). */
  waterDepthMm: number
  /** Latched wade auto-raise request, with hysteresis. */
  wadeRaised: boolean
  /** Dev: sweep the water depth from 0 to the sensor max. */
  autoWade: boolean
  devPanelOpen: boolean
  /** Inspection camera (dev). 'auto' follows the scenario. */
  cameraView: CameraView
  tirePressureBar: Quad
  /** Dev: force a suspension fault to see the health warning states. */
  suspensionFault: SuspensionFault
  /** Bumped whenever a new trip starts so the simulation resets its accumulators. */
  tripId: number
  live: LiveTelemetry
  trip: TripStats

  setPhase: (phase: Phase) => void
  setRideMode: (mode: RideMode) => void
  setRoughness: (value: number) => void
  setWaterDepth: (mm: number) => void
  setAutoWade: (on: boolean) => void
  toggleDevPanel: () => void
  setCameraView: (view: CameraView) => void
  /** Demo: drop the front-left tyre below its safe range to exercise the warning cues. */
  setLowTyre: (low: boolean) => void
  setSuspensionFault: (fault: SuspensionFault) => void
  publish: (live: LiveTelemetry, trip?: TripStats) => void
}

const DRY = { waterDepthMm: 0, wadeRaised: false, autoWade: false }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const useTelemetryStore = create<TelemetryState>()((set, get) => ({
  phase: 'PRE_DRIVE',
  rideMode: 'HIGHWAY',
  roughness: 0.6,
  ...DRY,
  devPanelOpen: true,
  cameraView: 'auto',
  tirePressureBar: TYRE_NOMINAL_BAR,
  suspensionFault: 'NONE',
  tripId: 0,
  live: {
    rideHeightMm: RIDE_HEIGHT_MM.ACCESS,
    speedKmh: 0,
    wheelTravelMm: [0, 0, 0, 0],
    hazard: null,
    damperTempC: [THERMAL.AMBIENT_C, THERMAL.AMBIENT_C, THERMAL.AMBIENT_C, THERMAL.AMBIENT_C],
    health: null,
  },
  trip: emptyTrip(),

  setPhase: (phase) => {
    if (phase === get().phase) return
    if (phase === 'ON_RIDE') {
      set((s) => ({ phase, tripId: s.tripId + 1, trip: emptyTrip() }))
    } else {
      // Leaving the drive always drains the ford and cancels any dev sweep.
      set({ phase, ...DRY })
    }
  },

  setRideMode: (rideMode) => {
    if (get().phase !== 'ON_RIDE') get().setPhase('ON_RIDE')
    set(rideMode === 'FLOOD' ? { rideMode } : { rideMode, ...DRY })
  },

  setRoughness: (value) => set({ roughness: clamp(value, 0, 1) }),

  setWaterDepth: (mm) =>
    set((s) => {
      const depth = clamp(mm, 0, WADE.SENSOR_MAX_MM)
      const wadeRaised =
        depth >= WADE.AUTO_RAISE_MM ? true : depth < WADE.AUTO_LOWER_MM ? false : s.wadeRaised
      return { waterDepthMm: depth, wadeRaised }
    }),

  setAutoWade: (on) => {
    const s = get()
    if (on && (s.phase !== 'ON_RIDE' || s.rideMode !== 'FLOOD')) s.setRideMode('FLOOD')
    if (on && get().waterDepthMm >= WADE.SENSOR_MAX_MM - 5) get().setWaterDepth(0)
    set({ autoWade: on })
  },

  toggleDevPanel: () => set((s) => ({ devPanelOpen: !s.devPanelOpen })),

  setCameraView: (cameraView) => set({ cameraView }),

  setLowTyre: (low) => set({ tirePressureBar: low ? [1.7, 2.4, 2.5, 2.5] : TYRE_NOMINAL_BAR }),

  setSuspensionFault: (suspensionFault) => set({ suspensionFault }),

  publish: (live, trip) => set(trip ? { live, trip } : { live }),
}))

export function selectTargetHeight(s: TelemetryState): HeightMode {
  if (s.phase !== 'ON_RIDE') return 'ACCESS'
  return s.rideMode === 'FLOOD' && s.wadeRaised ? 'WADE' : 'STANDARD'
}

export function selectWadeStatus(s: TelemetryState): WadeStatus {
  if (s.phase !== 'ON_RIDE' || s.rideMode !== 'FLOOD') return 'INACTIVE'
  if (s.waterDepthMm > WADE.LIMIT_MM) return 'EXCEEDED'
  if (s.waterDepthMm >= WADE.WARN_MM) return 'WARNING'
  return s.wadeRaised ? 'RAISED' : 'NOMINAL'
}
