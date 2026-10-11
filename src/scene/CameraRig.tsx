import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { selectWadeStatus, useTelemetryStore, type CameraView, type TelemetryState } from '../store/useTelemetryStore'
import { sim } from '../sim/simState'

interface Shot {
  pos: [number, number, number]
  look: [number, number, number]
}

/** Scenario shots: framed for a 4.76 m × 2.0 m × 2.0 m vehicle with the dev panel open. */
const SHOTS = {
  PRE_DRIVE: { pos: [6.4, 1.9, -7.4], look: [0, 0.85, -0.3] }, // front three-quarter "showroom"
  HIGHWAY: { pos: [0, 3.2, 10.5], look: [0, 1.0, -8] }, // chase cam, horizon ahead
  ROUGH: { pos: [3.2, 3.5, 8.6], look: [0, 0.5, -4.2] }, // high rear three-quarter: wheels + terrain
  FLOOD: { pos: [7.2, 1.9, 6.6], look: [0, 0.8, -0.4] }, // low side: waterline against the body
  FLOOD_ALERT: { pos: [3.6, 5.0, 13.5], look: [0, 0.3, 2.0] }, // pulled back to frame the reverse path
  POST_DRIVE: { pos: [-8.6, 3.0, 7.9], look: [0.4, 0.8, 0.3] }, // rear three-quarter for egress, pulled back to leave room for the health cards
} satisfies Record<string, Shot>

/** Dev inspection shots. */
const INSPECT: Record<Exclude<CameraView, 'auto'>, Shot> = {
  side: { pos: [9.2, 1.1, 0], look: [0, 0.95, 0] },
  front: { pos: [0, 1.2, -10], look: [0, 0.95, 0] },
  rear: { pos: [0, 1.4, 10], look: [0, 0.95, 0] },
  top: { pos: [0, 10.5, 1.3], look: [0, 0, 0] },
  suspension: { pos: [2.7, 0.62, -3.35], look: [0.72, 0.32, -1.5] },
}

function pickShot(s: TelemetryState): Shot {
  if (s.cameraView !== 'auto') return INSPECT[s.cameraView]
  if (s.phase !== 'ON_RIDE') return SHOTS[s.phase]
  if (s.rideMode === 'FLOOD') return selectWadeStatus(s) === 'EXCEEDED' ? SHOTS.FLOOD_ALERT : SHOTS.FLOOD
  return SHOTS[s.rideMode]
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * Eases the camera between shots by *orbiting* the vehicle (angle, radius and height are eased
 * separately), so a cut from the rear to the front sweeps around the car instead of flying through it.
 * A slow drift keeps the projection alive; reduced motion removes the drift and makes cuts near-instant.
 */
export function CameraRig() {
  const camera = useThree((st) => st.camera)
  const orbit = useRef({
    theta: Math.atan2(SHOTS.PRE_DRIVE.pos[0], SHOTS.PRE_DRIVE.pos[2]),
    radius: Math.hypot(SHOTS.PRE_DRIVE.pos[0], SHOTS.PRE_DRIVE.pos[2]),
    y: SHOTS.PRE_DRIVE.pos[1],
  })
  const look = useRef(new THREE.Vector3(...SHOTS.PRE_DRIVE.look))

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useTelemetryStore.getState()
    const shot = pickShot(s)
    const t = state.clock.elapsedTime
    const calm = sim.reducedMotion
    const drift = calm || s.cameraView !== 'auto' ? 0 : 1
    const lambda = calm ? 14 : 1.1
    const lambdaLook = calm ? 14 : 1.4

    const o = orbit.current
    const targetTheta = Math.atan2(shot.pos[0], shot.pos[2])
    const k = 1 - Math.exp(-lambda * dt)
    o.theta = wrapAngle(o.theta + wrapAngle(targetTheta - o.theta) * k)
    o.radius = THREE.MathUtils.damp(o.radius, Math.hypot(shot.pos[0], shot.pos[2]), lambda, dt)
    o.y = THREE.MathUtils.damp(o.y, shot.pos[1], lambda, dt)

    camera.position.set(
      Math.sin(o.theta) * o.radius + Math.sin(t * 0.21) * 0.25 * drift,
      o.y + Math.sin(t * 0.17) * 0.08 * drift,
      Math.cos(o.theta) * o.radius,
    )
    look.current.x = THREE.MathUtils.damp(look.current.x, shot.look[0], lambdaLook, dt)
    look.current.y = THREE.MathUtils.damp(look.current.y, shot.look[1], lambdaLook, dt)
    look.current.z = THREE.MathUtils.damp(look.current.z, shot.look[2], lambdaLook, dt)
    camera.lookAt(look.current)
  })

  return null
}
