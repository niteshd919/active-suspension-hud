/** Per-corner values in the order front-left, front-right, rear-left, rear-right. */
export type Quad = [number, number, number, number]

/** Dev/demo: force a suspension fault so the health warning states can be seen. */
export type SuspensionFault = 'NONE' | 'LEAK_RR' | 'WORN_FL'

export interface TripStats {
  durationS: number
  distanceM: number
  maxWaterMm: number
  maxWheelTravelMm: number
  predictiveAdjustments: number
  /** Cumulative wheel travel per corner (m): the main driver of damper and spring wear. */
  strokeM: Quad
  peakStrokeMm: Quad
  /** Times each corner reached its bump or droop stop. */
  bumpStops: Quad
  peakTempC: Quad
  /** Seconds with the water at or above the auto-raise depth. */
  wadeSeconds: number
  /** Seconds the air compressor ran (it runs whenever the body is being raised). */
  compressorS: number
}

export const emptyTrip = (): TripStats => ({
  durationS: 0,
  distanceM: 0,
  maxWaterMm: 0,
  maxWheelTravelMm: 0,
  predictiveAdjustments: 0,
  strokeM: [0, 0, 0, 0],
  peakStrokeMm: [0, 0, 0, 0],
  bumpStops: [0, 0, 0, 0],
  peakTempC: [0, 0, 0, 0],
  wadeSeconds: 0,
  compressorS: 0,
})

/** Copy with fresh arrays, so a published snapshot can never be mutated by the accumulator. */
export const cloneTrip = (t: TripStats): TripStats => ({
  ...t,
  strokeM: [...t.strokeM],
  peakStrokeMm: [...t.peakStrokeMm],
  bumpStops: [...t.bumpStops],
  peakTempC: [...t.peakTempC],
})
