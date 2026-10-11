import * as THREE from 'three'
import { VEHICLE } from '../../config'

/**
 * Procedural Land Rover Defender 110 (L663) body, built from published dimensions:
 * 4 758 mm long (incl. rear spare), 1 996 mm wide, 1 967 mm tall, 3 022 mm wheelbase.
 *
 * Authoring is ground-referenced (heights in metres above the road at standard ride height, `s` is
 * the distance back from the front face). Output geometry is in the chassis frame: y = 0 is the
 * underbody at *current* ride height, the vehicle faces -Z.
 */

type V3 = [number, number, number]
type P2 = [number, number]
type Side = 1 | -1
const SIDES: Side[] = [1, -1]

const GC = VEHICLE.standardClearance
const Z0 = -2.308 // front body face
export const BODY_LENGTH = 4.5
export const S_FRONT_AXLE = 0.797
export const S_REAR_AXLE = 3.819

/** Roof-mounted predictive LiDAR (chassis frame). */
export const SENSOR = { x: 0, y: 1.93 - GC, z: Z0 + 2.04 }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const gy = (y: number) => y - GC

/* ───────────────────────── primitives ───────────────────────── */

class LineSet {
  private p: number[] = []
  seg(a: V3, b: V3) {
    this.p.push(...a, ...b)
  }
  poly(pts: V3[], closed = false) {
    for (let i = 0; i < pts.length - 1; i++) this.seg(pts[i], pts[i + 1])
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0])
  }
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
    const c = (x: number, y: number, z: number): V3 => [x, y, z]
    const [a, b, d, e] = [c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0)]
    const [f, g, h, i] = [c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)]
    this.poly([a, b, d, e], true)
    this.poly([f, g, h, i], true)
    ;[[a, f], [b, g], [d, h], [e, i]].forEach(([p, q]) => this.seg(p, q))
  }
  geometry() {
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
  }
}

class TriSet {
  private p: number[] = []
  tri(a: V3, b: V3, c: V3) {
    this.p.push(...a, ...b, ...c)
  }
  quad(a: V3, b: V3, c: V3, d: V3) {
    this.tri(a, b, c)
    this.tri(a, c, d)
  }
  fan(pts: V3[]) {
    for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1])
  }
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
    const c = (x: number, y: number, z: number): V3 => [x, y, z]
    this.quad(c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0))
    this.quad(c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1))
    this.quad(c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1), c(x0, y1, z0))
    this.quad(c(x1, y0, z0), c(x1, y0, z1), c(x1, y1, z1), c(x1, y1, z0))
    this.quad(c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1))
    this.quad(c(x0, y1, z0), c(x1, y1, z0), c(x1, y1, z1), c(x0, y1, z1))
  }
  geometry() {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
    g.computeVertexNormals() // non-indexed, so normals stay flat per face
    return g
  }
}

/* ───────────────────────── body loft ───────────────────────── */

/**
 * Cross-section stations, front to rear. Each is a 6-point ring:
 * bottom (yb, ±wb) · belt/shoulder (ym, ±wm) · top (yt, ±wt).
 */
interface Station {
  s: number
  yb: number
  ym: number
  yt: number
  wb: number
  wm: number
  wt: number
}

const STATIONS: Station[] = [
  { s: 0.0, yb: 0.52, ym: 0.96, yt: 1.02, wb: 0.93, wm: 0.99, wt: 0.96 }, // flat vertical front fascia
  { s: 0.3, yb: 0.4, ym: 1.0, yt: 1.05, wb: 0.95, wm: 0.998, wt: 0.96 },
  { s: 1.42, yb: 0.36, ym: 1.07, yt: 1.13, wb: 0.96, wm: 0.998, wt: 0.95 }, // cowl / windscreen base
  { s: 1.95, yb: 0.36, ym: 1.22, yt: 1.9, wb: 0.97, wm: 0.998, wt: 0.9 }, // roof leading edge
  { s: 4.4, yb: 0.38, ym: 1.22, yt: 1.9, wb: 0.97, wm: 0.998, wt: 0.9 }, // roof trailing edge
  { s: 4.5, yb: 0.6, ym: 1.22, yt: 1.84, wb: 0.95, wm: 0.99, wt: 0.88 }, // near-vertical tailgate
]
const COWL = STATIONS[2]
const ROOF_FRONT = STATIONS[3]

/** A-pillar line: the windscreen edge, as side-panel s at height y, and its inverse. */
const pillarSlope = (ROOF_FRONT.s - COWL.s) / (ROOF_FRONT.yt - COWL.yt)
const aPillarS = (y: number) => COWL.s + (y - COWL.yt) * pillarSlope
const aPillarY = (s: number) => COWL.yt + (s - COWL.s) / pillarSlope

function at(s: number): Omit<Station, 's'> {
  const cs = Math.min(BODY_LENGTH, Math.max(0, s))
  let i = 0
  while (i < STATIONS.length - 2 && cs > STATIONS[i + 1].s) i++
  const a = STATIONS[i]
  const b = STATIONS[i + 1]
  const t = (cs - a.s) / (b.s - a.s)
  return {
    yb: lerp(a.yb, b.yb, t),
    ym: lerp(a.ym, b.ym, t),
    yt: lerp(a.yt, b.yt, t),
    wb: lerp(a.wb, b.wb, t),
    wm: lerp(a.wm, b.wm, t),
    wt: lerp(a.wt, b.wt, t),
  }
}

/** Half-width of the body side surface at (s, y). */
function sideX(s: number, y: number): number {
  const p = at(s)
  return y <= p.ym
    ? lerp(p.wb, p.wm, clamp01((y - p.yb) / (p.ym - p.yb)))
    : lerp(p.wm, p.wt, clamp01((y - p.ym) / (p.yt - p.ym)))
}

/** A point on the body side surface, pushed out by `out` metres. */
const sidePoint = (side: Side, s: number, y: number, out = 0.004): V3 => [side * (sideX(s, y) + out), gy(y), Z0 + s]

/** Polyline in (s, y) side-panel space, subdivided so it hugs the curved surface. */
function sideLine(side: Side, pts: P2[], out = 0.004): V3[] {
  const res: V3[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [s0, y0] = pts[i]
    const [s1, y1] = pts[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(s1 - s0, y1 - y0) / 0.2))
    for (let k = 0; k < n; k++) res.push(sidePoint(side, lerp(s0, s1, k / n), lerp(y0, y1, k / n), out))
  }
  const [sl, yl] = pts[pts.length - 1]
  res.push(sidePoint(side, sl, yl, out))
  return res
}

const ring = (st: Station): V3[] => {
  const z = Z0 + st.s
  return [
    [-st.wb, gy(st.yb), z],
    [st.wb, gy(st.yb), z],
    [st.wm, gy(st.ym), z],
    [st.wt, gy(st.yt), z],
    [-st.wt, gy(st.yt), z],
    [-st.wm, gy(st.ym), z],
  ]
}

/** Point on a vertical face of constant `s` (front/rear), x lateral, y ground-referenced. */
const facePoint = (x: number, y: number, s: number, out = 0.003): V3 => [x, gy(y), Z0 + s + out]

function circle(cx: number, cy: number, r: number, s: number, out: number, n = 28): V3[] {
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2
    return facePoint(cx + r * Math.cos(a), cy + r * Math.sin(a), s, out)
  })
}

/** Squared-off Defender wheel arch in side-panel space, from sill to sill over the top. */
function archOutline(sw: number): P2[] {
  const half = 0.505
  const top = 0.95
  const r = 0.17
  const pts: P2[] = [[sw - half, at(sw - half).yb], [sw - half, top - r]]
  const arc = (cx: number, cy: number, from: number, to: number) => {
    for (let k = 0; k <= 6; k++) {
      const a = lerp(from, to, k / 6)
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  arc(sw - half + r, top - r, Math.PI, Math.PI / 2)
  arc(sw + half - r, top - r, Math.PI / 2, 0)
  pts.push([sw + half, at(sw + half).yb])
  return pts
}

/* ───────────────────────── assembly ───────────────────────── */

export interface DefenderBodyGeometry {
  /** Hologram shell. */
  faces: THREE.BufferGeometry
  /** Translucent glazing. */
  glass: THREE.BufferGeometry
  /** Silhouette and panel edges. */
  structure: THREE.BufferGeometry
  /** Door shuts, arches, roof rack, mirrors, spare wheel. */
  detail: THREE.BufferGeometry
  /** Headlamps and tail lamps (drawn brighter). */
  lamps: THREE.BufferGeometry
}

export function buildDefenderBody(): DefenderBodyGeometry {
  const faces = new TriSet()
  const glass = new TriSet()
  const structure = new LineSet()
  const detail = new LineSet()
  const lamps = new LineSet()

  /* shell: loft between stations */
  const rings = STATIONS.map(ring)
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < 6; j++) {
      const k = (j + 1) % 6
      faces.quad(rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j])
    }
  }
  faces.fan(rings[0])
  faces.fan(rings[rings.length - 1])

  for (let j = 0; j < 6; j++) structure.poly(rings.map((r) => r[j]))
  for (const idx of [0, 2, 3, 4, 5]) structure.poly(rings[idx], true)

  /* bumpers */
  const bumpers: [number, number, number, number, number, number][] = [
    [-0.97, 0.97, gy(0.44), gy(0.72), Z0 - 0.05, Z0 + 0.2],
    [-0.97, 0.97, gy(0.44), gy(0.68), Z0 + 4.32, Z0 + 4.58],
  ]
  for (const b of bumpers) {
    faces.box(...b)
    structure.box(...b)
  }

  /* glazing: windscreen */
  const ws = (u: number, v: number): V3 => {
    const w = lerp(COWL.wt, ROOF_FRONT.wt, v)
    return [u * w, gy(lerp(COWL.yt, ROOF_FRONT.yt, v)), Z0 + lerp(COWL.s, ROOF_FRONT.s, v)]
  }
  const wsGlass = [ws(-0.94, 0.08), ws(0.94, 0.08), ws(0.94, 0.94), ws(-0.94, 0.94)]
  glass.fan(wsGlass)
  detail.poly(wsGlass, true)

  /* side glazing, door shuts, arches, vents */
  const windows: P2[][] = [
    [[aPillarS(1.27) + 0.035, 1.27], [1.955, 1.86], [2.98, 1.86], [2.98, 1.27]],
    [[3.05, 1.27], [3.05, 1.86], [4.0, 1.86], [4.0, 1.27]],
    [[4.07, 1.27], [4.07, 1.86], [4.38, 1.86], [4.38, 1.4]],
  ]
  const shuts: P2[][] = [
    [[1.62, 0.44], [1.62, aPillarY(1.62)]], // front door leading edge, up to where it meets the A-pillar
    [[1.62, 0.44], [3.015, 0.44]], // front door sill line
    [[3.015, 0.44], [3.015, 1.88]], // B-pillar
    [[3.015, 0.44], [S_REAR_AXLE - 0.505, 0.44]], // rear door sill line, up to the arch
    [[4.03, 0.95], [4.03, 1.88]], // rear door trailing edge
    [[2.8, 1.12], [2.94, 1.12]], // handles
    [[3.8, 1.12], [3.94, 1.12]],
    [[1.38, 0.93], [1.56, 0.93]], // fender vent
    [[1.38, 0.96], [1.56, 0.96]],
    [[1.38, 0.99], [1.56, 0.99]],
  ]
  for (const side of SIDES) {
    for (const w of windows) {
      const pts = w.map(([s, y]) => sidePoint(side, s, y, 0.003))
      glass.fan(pts)
      detail.poly(sideLine(side, [...w, w[0]], 0.003))
    }
    for (const line of shuts) detail.poly(sideLine(side, line))
    for (const sw of [S_FRONT_AXLE, S_REAR_AXLE]) detail.poly(sideLine(side, archOutline(sw), 0.014))

    /* alpine lights: glazed strip along the rear roof shoulders */
    const alpine: V3[] = [
      [side * 0.89, gy(1.902), Z0 + 3.3],
      [side * 0.89, gy(1.902), Z0 + 4.36],
      [side * 0.62, gy(1.902), Z0 + 4.36],
      [side * 0.62, gy(1.902), Z0 + 3.62],
    ]
    glass.fan(alpine)
    detail.poly(alpine, true)

    /* door mirrors */
    const mx = side * 1.04
    detail.seg(sidePoint(side, 1.72, 1.3, 0), [mx, gy(1.3), Z0 + 1.72])
    detail.box(Math.min(mx, side * 1.13), Math.max(mx, side * 1.13), gy(1.23), gy(1.42), Z0 + 1.62, Z0 + 1.8)
  }

  /* roof rack: two rails, four cross bars, feet */
  const rackY = gy(1.965)
  const rackS = [2.3, 3.0, 3.7, 4.3]
  for (const side of SIDES) {
    detail.seg([side * 0.78, rackY, Z0 + rackS[0]], [side * 0.78, rackY, Z0 + rackS[3]])
    for (const s of rackS) detail.seg([side * 0.78, rackY, Z0 + s], [side * 0.78, gy(1.9), Z0 + s])
  }
  for (const s of rackS) detail.seg([-0.78, rackY, Z0 + s], [0.78, rackY, Z0 + s])

  /* front fascia: round headlamps, grille, bumper intake, fog lamps */
  for (const side of SIDES) {
    lamps.poly(circle(side * 0.66, 0.885, 0.1, 0, -0.003), true)
    lamps.poly(circle(side * 0.66, 0.885, 0.068, 0, -0.003, 24), true)
    lamps.poly(circle(side * 0.66, 0.885, 0.028, 0, -0.003, 12), true)
    detail.poly(circle(side * 0.8, 0.585, 0.04, -0.05, -0.003, 16), true)
  }
  const grille = [facePoint(-0.4, 0.8, 0, -0.003), facePoint(0.4, 0.8, 0, -0.003), facePoint(0.4, 0.905, 0, -0.003), facePoint(-0.4, 0.905, 0, -0.003)]
  detail.poly(grille, true)
  for (const y of [0.835, 0.87]) detail.seg(facePoint(-0.4, y, 0, -0.003), facePoint(0.4, y, 0, -0.003))
  const intake = [facePoint(-0.55, 0.56, -0.05, -0.003), facePoint(0.55, 0.56, -0.05, -0.003), facePoint(0.55, 0.67, -0.05, -0.003), facePoint(-0.55, 0.67, -0.05, -0.003)]
  detail.poly(intake, true)
  for (const x of [-0.33, -0.11, 0.11, 0.33]) detail.seg(facePoint(x, 0.56, -0.05, -0.003), facePoint(x, 0.67, -0.05, -0.003))

  /* rear: vertical tail lamps, letterbox window, rear-mounted spare wheel */
  for (const side of SIDES) {
    const lamp = [facePoint(side * 0.8, 0.98, BODY_LENGTH), facePoint(side * 0.94, 0.98, BODY_LENGTH), facePoint(side * 0.94, 1.62, BODY_LENGTH), facePoint(side * 0.8, 1.62, BODY_LENGTH)]
    lamps.poly(lamp, true)
    lamps.seg(facePoint(side * 0.87, 0.98, BODY_LENGTH), facePoint(side * 0.87, 1.62, BODY_LENGTH))
  }
  const rearGlass = [facePoint(-0.58, 1.52, BODY_LENGTH), facePoint(0.58, 1.52, BODY_LENGTH), facePoint(0.58, 1.8, BODY_LENGTH), facePoint(-0.58, 1.8, BODY_LENGTH)]
  glass.fan(rearGlass)
  detail.poly(rearGlass, true)

  const spareY = 1.12
  const spareR = 0.41
  const zFront = Z0 + BODY_LENGTH
  const zRear = zFront + 0.258
  const spareRing = (r: number, z: number, n = 32) =>
    Array.from({ length: n }, (_, k): V3 => {
      const a = (k / n) * Math.PI * 2
      return [r * Math.cos(a), gy(spareY) + r * Math.sin(a), z]
    })
  for (const [r, z] of [[spareR, zFront], [spareR, zRear], [0.36, zRear + 0.003], [0.2, zRear + 0.003], [0.08, zRear + 0.003]] as const) {
    detail.poly(spareRing(r, z), true)
  }
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2
    const p = (z: number): V3 => [spareR * Math.cos(a), gy(spareY) + spareR * Math.sin(a), z]
    detail.seg(p(zFront), p(zRear))
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2
    detail.seg([0.08 * Math.cos(a), gy(spareY) + 0.08 * Math.sin(a), zRear + 0.003], [0.36 * Math.cos(a), gy(spareY) + 0.36 * Math.sin(a), zRear + 0.003])
  }

  /* roof LiDAR housing */
  detail.box(SENSOR.x - 0.14, SENSOR.x + 0.14, gy(1.9), gy(1.965), Z0 + 1.96, Z0 + 2.12)

  return {
    faces: faces.geometry(),
    glass: glass.geometry(),
    structure: structure.geometry(),
    detail: detail.geometry(),
    lamps: lamps.geometry(),
  }
}
