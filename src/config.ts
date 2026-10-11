/**
 * Ground clearance per air-suspension height mode (mm), matching the Land Rover Defender 110:
 * access = 40 mm below standard, off-road/wade = 73 mm above.
 */
export const RIDE_HEIGHT_MM = {
  ACCESS: 178,
  STANDARD: 218,
  WADE: 291,
} as const
export type HeightMode = keyof typeof RIDE_HEIGHT_MM

export const HEIGHT_LABEL: Record<HeightMode, string> = {
  ACCESS: 'ACCESS',
  STANDARD: 'DRIVE',
  WADE: 'WADE',
}

/** Spoken/screen-reader names for the height modes. */
export const HEIGHT_NAME: Record<HeightMode, string> = {
  ACCESS: 'access height',
  STANDARD: 'standard drive height',
  WADE: 'off-road wade height',
}

export const WADE = {
  AUTO_RAISE_MM: 500,
  /** Hysteresis: once raised, stay raised until the water drops below this. */
  AUTO_LOWER_MM: 450,
  WARN_MM: 800,
  LIMIT_MM: 900,
  SENSOR_MAX_MM: 1000,
  /** Water this deep is first reported on the HUD, ahead of the auto-raise. */
  NOTICE_MM: 150,
} as const

/** Terrain relief thresholds (m) for LiDAR colour mapping and hazard detection. */
export const TERRAIN = {
  SAFE_M: 0.05,
  AMBER_M: 0.09,
  RED_M: 0.16,
} as const

/** Land Rover Defender 110 (L663), metres. The vehicle faces -Z. */
export const VEHICLE = {
  /** 255/65 R19 rolling radius. */
  wheelRadius: 0.407,
  /** Underbody clearance at standard height; the body model is authored relative to this. */
  standardClearance: 0.218,
  halfWidth: 0.998,
  /** Front bumper face / spare-wheel rear face. */
  frontZ: -2.36,
  rearZ: 2.45,
} as const

/** Wheel centres (m): 3 022 mm wheelbase, 1 700 mm track. */
export const WHEELS = [
  { id: 'FL', x: -0.85, z: -1.511 },
  { id: 'FR', x: 0.85, z: -1.511 },
  { id: 'RL', x: -0.85, z: 1.511 },
  { id: 'RR', x: 0.85, z: 1.511 },
] as const

/** Suspension stroke from the design position (m). Beyond this the chassis is pushed up/down by the bump stops. */
export const SUSPENSION = {
  BUMP_M: 0.14,
  DROOP_M: 0.12,
} as const

/** Width (px) of the floating dev panel; the HUD layout shifts left to stay clear of it. */
export const DEV_PANEL_WIDTH = 320

/** Shared spring for everything that makes room for the dev panel. */
export const PANEL_TRANSITION = { type: 'spring', stiffness: 220, damping: 30 } as const

/** Smallest viewport (CSS px) the HUD is designed for. Below this only the "use a bigger screen" message is shown. */
export const MIN_VIEWPORT = { width: 1366, height: 768 } as const
