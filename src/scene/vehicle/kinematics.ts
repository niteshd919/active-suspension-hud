/**
 * Double-wishbone kinematics in the plane perpendicular to the vehicle's long axis.
 * Coordinates are "outboard-positive": x is measured outward from the centreline, y is up from the
 * chassis underbody. Mirror by the corner's side when mapping to the world.
 *
 * Both wishbones and the knuckle are rigid, constant-length links, so camber change, track change and
 * arm swing all emerge from the geometry instead of being animated by hand.
 */

export type P2 = readonly [number, number]

export interface Hardpoints {
  lowerPivot: P2
  lowerLen: number
  upperPivot: P2
  upperLen: number
  /** Lower → upper ball joint at the design position. */
  knuckle: P2
  /** Lower ball joint → wheel centre at the design position (in the knuckle frame). */
  hub: P2
}

/** Both arms are horizontal, and camber is exactly zero, at standard ride height (wheel centre 0.189 m above the underbody). */
export const HARDPOINTS: Hardpoints = {
  lowerPivot: [0.24, 0.029],
  lowerLen: 0.43,
  upperPivot: [0.3, 0.369],
  upperLen: 0.32,
  knuckle: [-0.05, 0.34],
  hub: [0.18, 0.16],
}

export interface Solution {
  lbj: [number, number]
  ubj: [number, number]
  hub: [number, number]
  /** Knuckle rotation from design (rad, counter-clockwise in outboard-positive coordinates; + = top tucks in). */
  camber: number
  lowerAngle: number
}

export function createSolution(): Solution {
  return { lbj: [0, 0], ubj: [0, 0], hub: [0, 0], camber: 0, lowerAngle: 0 }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Pose of the linkage for a given lower-arm angle. */
function evaluate(h: Hardpoints, alpha: number, out: Solution) {
  const lx = h.lowerPivot[0] + h.lowerLen * Math.cos(alpha)
  const ly = h.lowerPivot[1] + h.lowerLen * Math.sin(alpha)
  const kLen = Math.hypot(h.knuckle[0], h.knuckle[1])
  const kAngle = Math.atan2(h.knuckle[1], h.knuckle[0])

  // Upper ball joint: intersection of circle(upperPivot, upperLen) and circle(LBJ, knuckle length).
  const dx = lx - h.upperPivot[0]
  const dy = ly - h.upperPivot[1]
  const d = clamp(Math.hypot(dx, dy), Math.abs(h.upperLen - kLen) + 1e-6, h.upperLen + kLen - 1e-6)
  const ux = dx / (Math.hypot(dx, dy) || 1)
  const uy = dy / (Math.hypot(dx, dy) || 1)
  const along = (h.upperLen * h.upperLen - kLen * kLen + d * d) / (2 * d)
  const height = Math.sqrt(Math.max(h.upperLen * h.upperLen - along * along, 0))
  const mx = h.upperPivot[0] + ux * along
  const my = h.upperPivot[1] + uy * along

  // Two solutions; keep the one whose knuckle points closest to its design direction.
  let best = 0
  let bestErr = Infinity
  let bx = 0
  let by = 0
  for (const sign of [1, -1]) {
    const px = mx - sign * uy * height
    const py = my + sign * ux * height
    let err = Math.atan2(py - ly, px - lx) - kAngle
    err = Math.abs(Math.atan2(Math.sin(err), Math.cos(err)))
    if (err < bestErr) {
      bestErr = err
      best = Math.atan2(py - ly, px - lx) - kAngle
      bx = px
      by = py
    }
  }
  const camber = Math.atan2(Math.sin(best), Math.cos(best))
  const c = Math.cos(camber)
  const s = Math.sin(camber)

  out.lbj[0] = lx
  out.lbj[1] = ly
  out.ubj[0] = bx
  out.ubj[1] = by
  out.camber = camber
  out.lowerAngle = alpha
  out.hub[0] = lx + h.hub[0] * c - h.hub[1] * s
  out.hub[1] = ly + h.hub[0] * s + h.hub[1] * c
}

/** Solve the linkage so the wheel centre sits at `hubY` (above the underbody). */
export function solveCorner(h: Hardpoints, hubY: number, out: Solution = createSolution()): Solution {
  let alpha = Math.asin(clamp((hubY - h.hub[1] - h.lowerPivot[1]) / h.lowerLen, -0.95, 0.95))
  const eps = 1e-4
  const probe = createSolution()
  for (let i = 0; i < 5; i++) {
    evaluate(h, alpha, out)
    const err = out.hub[1] - hubY
    if (Math.abs(err) < 1e-5) break
    evaluate(h, alpha + eps, probe)
    const slope = (probe.hub[1] - out.hub[1]) / eps
    if (Math.abs(slope) < 1e-3) break
    alpha -= err / slope
  }
  evaluate(h, alpha, out)
  return out
}
