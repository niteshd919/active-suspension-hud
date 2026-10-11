import * as THREE from 'three'
import { VEHICLE } from '../../config'

/**
 * Wheel in its own frame: axle along +X (outboard for a right-hand wheel; left wheels are mirrored
 * by the caller), up = +Y, rolling direction = -Z.
 */
export interface WheelGeometry {
  /** Solid tyre shell for the hologram shader. */
  tyre: THREE.BufferGeometry
  /** Tread, sidewall, rim, spokes and brake disc: spins with the wheel. */
  spinning: THREE.BufferGeometry
  /** Brake caliper: fixed to the hub carrier, does not spin. */
  fixed: THREE.BufferGeometry
}

const R = VEHICLE.wheelRadius
const HALF_WIDTH = 0.1275
const TREAD_HALF = 0.09
const RIM_R = 0.246
const SEGMENTS = 56

type V3 = [number, number, number]

function ring(x: number, r: number, n = SEGMENTS, phase = 0): V3[] {
  return Array.from({ length: n }, (_, k): V3 => {
    const a = (k / n) * Math.PI * 2 + phase
    return [x, r * Math.cos(a), r * Math.sin(a)]
  })
}

export function buildWheel(): WheelGeometry {
  const lines: number[] = []
  const seg = (a: V3, b: V3) => lines.push(...a, ...b)
  const poly = (pts: V3[], closed = true) => {
    for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1])
    if (closed) seg(pts[pts.length - 1], pts[0])
  }
  const polar = (x: number, r: number, a: number): V3 => [x, r * Math.cos(a), r * Math.sin(a)]

  /* tyre shell: revolved sidewall + tread profile (radius, axial) */
  const profile = [
    [RIM_R, -0.105], [0.3, -0.125], [0.36, -HALF_WIDTH - 0.003], [0.395, -0.118], [R, -TREAD_HALF],
    [R, TREAD_HALF], [0.395, 0.118], [0.36, HALF_WIDTH + 0.003], [0.3, 0.125], [RIM_R, 0.105],
  ].map(([r, a]) => new THREE.Vector2(r, a))
  const tyre = new THREE.LatheGeometry(profile, SEGMENTS).rotateZ(-Math.PI / 2)

  /* tread: three rings plus slanted blocks */
  for (const x of [-TREAD_HALF, 0, TREAD_HALF]) poly(ring(x, R))
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2
    seg(polar(-TREAD_HALF, R, a), polar(TREAD_HALF, R, a + 0.08))
  }
  /* sidewalls */
  for (const sgn of [-1, 1]) {
    poly(ring(sgn * HALF_WIDTH, 0.345))
    poly(ring(sgn * 0.105, RIM_R))
  }

  /* rim: barrel, five double-spokes, hub and lug nuts on the outboard face */
  for (const x of [-0.08, 0.08]) poly(ring(x, 0.232, 40))
  const faceX = 0.078
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2
    for (const d of [-1, 1]) seg(polar(faceX, 0.06, a + d * 0.1), polar(faceX, 0.228, a + d * 0.2))
    poly(ring(faceX, 0.011, 6, a).map(([x, y, z]): V3 => [x, y + 0.062 * Math.cos(a), z + 0.062 * Math.sin(a)]))
  }
  poly(ring(faceX, 0.228, 40))
  poly(ring(0.092, 0.05, 20))
  poly(ring(0.092, 0.08, 24))

  /* brake disc: outer rim, hat and radial vent slots */
  const discX = -0.035
  poly(ring(discX, 0.175, 48))
  poly(ring(discX, 0.105, 32))
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2
    seg(polar(discX, 0.118, a), polar(discX, 0.17, a))
  }
  const spinning = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))

  /* caliper, straddling the disc at the top rear */
  const cal: number[] = []
  const [x0, x1, y0, y1, z0, z1] = [-0.075, 0.005, 0.1, 0.195, 0.0, 0.16]
  const c = (x: number, y: number, z: number): V3 => [x, y, z]
  const corners: V3[][] = [
    [c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0)],
    [c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)],
  ]
  for (const face of corners) for (let i = 0; i < 4; i++) cal.push(...face[i], ...face[(i + 1) % 4])
  for (let i = 0; i < 4; i++) cal.push(...corners[0][i], ...corners[1][i])
  const fixed = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cal, 3))

  return { tyre, spinning, fixed }
}
