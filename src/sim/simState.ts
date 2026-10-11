import { RIDE_HEIGHT_MM, VEHICLE } from '../config'
import { THERMAL } from './health'

/**
 * Mutable per-frame simulation state shared by the R3F components.
 * Written once per frame by <SimulationDriver/>, read by everything else in the scene.
 * Lives outside React/zustand so 60 fps updates never trigger re-renders.
 */
export const sim = {
  time: 0,
  /** Metres driven along -Z; the terrain scrolls toward +Z by this amount. */
  travel: 0,
  /** m/s */
  speed: 0,
  /** Terrain relief multiplier. */
  amplitude: 0,
  /** 0 = off-road, 1 = marked highway (lane lines in the point cloud). */
  roadness: 0,
  /** Overall LiDAR point brightness. */
  intensity: 0.35,
  /** Strength of the forward LiDAR sweep pulse. */
  scan: 0,
  /** Chassis underbody height above nominal ground (m). */
  rideHeight: RIDE_HEIGHT_MM.ACCESS / 1000,
  rideVelocity: 0,
  /** Low-passed vertical offset of the chassis. It follows the mean wheel contact height, never individual bumps. */
  heave: 0,
  /** Water surface height (m). */
  water: 0,
  /** 0 nominal · 1 amber · 2 red, smoothed for colour blending. */
  alert: 0,
  /** 0..1 visibility of reverse guidance. */
  reverseCue: 0,
  /** 0..1 visibility of wade instrumentation. */
  floodCue: 0,
  /** Wheel-centre world heights (m): terrain contact + rolling radius. */
  wheelY: [VEHICLE.wheelRadius, VEHICLE.wheelRadius, VEHICLE.wheelRadius, VEHICLE.wheelRadius] as number[],
  /** Wheel travel relative to the chassis at the current ride height (m, + = bump). */
  wheelTravel: [0, 0, 0, 0] as number[],
  wheelSpin: 0,
  /** Damper temperatures (°C). They heat with stroke velocity and cool at rest, parked or not. */
  damperTemp: [THERMAL.AMBIENT_C + 2, THERMAL.AMBIENT_C + 2, THERMAL.AMBIENT_C + 2, THERMAL.AMBIENT_C + 2] as number[],
  /**
   * Screen position (CSS px inside the canvas) of a point above and below each wheel, written by <Vehicle/>
   * every frame so DOM callouts can attach leader lines to the hardware they describe.
   */
  anchors: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, visible: false })),
  anchorsBelow: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, visible: false })),
  canvas: { w: 1, h: 1 },
  hazard: { active: false, x: 0, z: 0, h: 0 },
  /** Body visibility (0..1). Dips so the suspension hardware stands out while parked or inspected. */
  xray: 1,
  /** Effective reduced-motion preference (user choice or OS), refreshed every frame. */
  reducedMotion: false,
}
