import * as THREE from 'three'
import { SUSPENSION, WHEELS } from '../../config'
import { COLOR, strainColor } from '../materials'
import { HARDPOINTS as HP, createSolution, solveCorner } from './kinematics'

/**
 * Draws the Defender's air suspension as engineering-style hardware: double wishbones, knuckle, tie rod,
 * half-shaft with CV joint, a ribbed air spring beside a telescopic damper, an anti-roll bar with drop
 * links, subframes and differentials. Everything is instanced (three draw calls) and positioned each
 * frame from the solved linkage, so the geometry genuinely moves like a suspension.
 */

/** Fore/aft offsets of the wishbone legs and ball joints from the axle line (m, + = rearward). */
const LEG = { lowerF: -0.21, lowerR: 0.19, lbj: 0.01, upperF: -0.13, upperR: 0.12, ubj: 0 }

const DAMPER_BODY = 0.27
const SPRING_PISTON = 0.1
const SPRING_CAP = 0.05
const RING_FRACTIONS = [0.17, 0.5, 0.83]
const RING_RADIUS = [0.07, 0.082, 0.07]

export interface CornerPose {
  hub: THREE.Vector3
  /** Wheel camber about the longitudinal axis, signed for the world frame. */
  camber: number
}

/** Post-drive health highlight: each wheel gets a halo in its health colour. */
export interface RigHighlight {
  /** Per-corner colour (palette green / amber / red for good / watch / service). */
  colors: THREE.Color[]
  /** 0..1, drives a slow pulse on the halos; keep at 0 for reduced motion. */
  pulse: number
}

const UP = new THREE.Vector3(0, 1, 0)
const AXIS_X = new THREE.Vector3(1, 0, 0)
const AXIS_Z = new THREE.Vector3(0, 0, 1)
const WHITE = new THREE.Color(1, 1, 1)

class Pool {
  readonly mesh: THREE.InstancedMesh
  private n = 0
  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private readonly max: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.setColorAt(0, WHITE) // allocate the colour attribute up front so the shader never recompiles
  }
  begin() {
    this.n = 0
  }
  add(matrix: THREE.Matrix4, color: THREE.Color) {
    if (this.n >= this.max) return
    this.mesh.setMatrixAt(this.n, matrix)
    this.mesh.setColorAt(this.n, color)
    this.n++
  }
  end() {
    this.mesh.count = this.n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}

const glow = (opacity: number) =>
  new THREE.MeshBasicMaterial({
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })

export class SuspensionRig {
  readonly object = new THREE.Group()
  readonly poses: CornerPose[] = WHEELS.map(() => ({ hub: new THREE.Vector3(), camber: 0 }))
  /** World points just above and just below each tyre; the HUD projects these to attach its callout leader lines. */
  readonly anchors: THREE.Vector3[] = WHEELS.map(() => new THREE.Vector3())
  readonly anchorsBelow: THREE.Vector3[] = WHEELS.map(() => new THREE.Vector3())

  private readonly bars: Pool
  private readonly rings: Pool
  private readonly joints: Pool
  private readonly halos: Pool
  private highlight: RigHighlight | null = null
  private readonly geometries: THREE.BufferGeometry[]
  private readonly materials: THREE.Material[]

  private readonly sol = createSolution()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly pos = new THREE.Vector3()
  private readonly scl = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly damperDir = new THREE.Vector3()
  private readonly springDir = new THREE.Vector3()
  private readonly cArm = new THREE.Color()
  private readonly cLink = new THREE.Color()
  private readonly cJoint = new THREE.Color()
  private readonly cStrain = new THREE.Color()

  /** Scratch points, reused every frame. */
  private readonly p = Object.fromEntries(
    [
      'plf', 'plr', 'puf', 'pur', 'lbj', 'ubj', 'hub', 'hubIn', 'diff', 'cv', 'lowerMid', 'armPt', 'bd', 'td', 'ba', 'ta',
      'sTop', 'cap', 'rodTop', 'bodyTop', 'ap', 'linkTop', 'bend', 'tip', 're', 'sa', 'fm', 'he', 'a', 'b',
    ].map((k) => [k, new THREE.Vector3()]),
  ) as Record<string, THREE.Vector3>

  constructor() {
    const tube = new THREE.CylinderGeometry(1, 1, 1, 6, 1)
    const torus = new THREE.TorusGeometry(1, 0.13, 5, 24)
    const ball = new THREE.SphereGeometry(1, 8, 6)
    const halo = new THREE.TorusGeometry(1, 0.03, 6, 56)
    const barMat = glow(0.9)
    const ringMat = glow(0.8)
    const jointMat = glow(1)
    const haloMat = glow(0.95)
    this.geometries = [tube, torus, ball, halo]
    this.materials = [barMat, ringMat, jointMat, haloMat]
    this.bars = new Pool(tube, barMat, 160)
    this.rings = new Pool(torus, ringMat, 48)
    this.joints = new Pool(ball, jointMat, 160)
    this.halos = new Pool(halo, haloMat, 8)
    this.object.add(this.bars.mesh, this.rings.mesh, this.joints.mesh, this.halos.mesh)
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose())
    this.materials.forEach((m) => m.dispose())
    this.bars.mesh.dispose()
    this.rings.mesh.dispose()
    this.joints.mesh.dispose()
    this.halos.mesh.dispose()
  }

  /** Cylinder between two points. */
  private bar(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: THREE.Color) {
    this.dir.subVectors(b, a)
    const length = this.dir.length()
    if (length < 1e-5) return
    this.q.setFromUnitVectors(UP, this.dir.divideScalar(length))
    this.pos.addVectors(a, b).multiplyScalar(0.5)
    this.bars.add(this.m.compose(this.pos, this.q, this.scl.set(radius, length, radius)), color)
  }

  /** Ring around `axis` (unit vector) centred on `at`. */
  private ring(at: THREE.Vector3, axis: THREE.Vector3, radius: number, color: THREE.Color) {
    this.q.setFromUnitVectors(AXIS_Z, axis)
    this.rings.add(this.m.compose(at, this.q, this.scl.setScalar(radius)), color)
  }

  private joint(at: THREE.Vector3, radius: number) {
    this.joints.add(this.m.compose(at, this.q.identity(), this.scl.setScalar(radius)), this.cJoint)
  }

  update(chassisY: number, wheelY: ArrayLike<number>, wheelTravel: ArrayLike<number>, highlight: RigHighlight | null = null) {
    this.highlight = highlight
    this.cArm.copy(COLOR.cyan).multiplyScalar(0.95)
    this.cLink.copy(COLOR.cyan).multiplyScalar(0.5)
    this.cJoint.copy(COLOR.marking).multiplyScalar(0.6)

    this.bars.begin()
    this.rings.begin()
    this.joints.begin()
    this.halos.begin()
    for (let i = 0; i < WHEELS.length; i++) this.corner(i, chassisY, wheelY[i], wheelTravel[i])
    this.axles(chassisY)
    this.bars.end()
    this.rings.end()
    this.joints.end()
    this.halos.end()
  }

  private corner(i: number, chassisY: number, hubWorldY: number, travel: number) {
    const w = WHEELS[i]
    const side = w.x < 0 ? -1 : 1
    const zA = w.z
    const front = zA < 0
    const { p, cArm, cLink, cStrain } = this
    const X = (x: number) => side * x

    const sol = solveCorner(HP, hubWorldY - chassisY, this.sol)
    p.plf.set(X(HP.lowerPivot[0]), chassisY + HP.lowerPivot[1], zA + LEG.lowerF)
    p.plr.set(X(HP.lowerPivot[0]), chassisY + HP.lowerPivot[1], zA + LEG.lowerR)
    p.puf.set(X(HP.upperPivot[0]), chassisY + HP.upperPivot[1], zA + LEG.upperF)
    p.pur.set(X(HP.upperPivot[0]), chassisY + HP.upperPivot[1], zA + LEG.upperR)
    p.lbj.set(X(sol.lbj[0]), chassisY + sol.lbj[1], zA + LEG.lbj)
    p.ubj.set(X(sol.ubj[0]), chassisY + sol.ubj[1], zA + LEG.ubj)
    p.hub.set(X(sol.hub[0]), chassisY + sol.hub[1], zA)

    const pose = this.poses[i]
    pose.hub.copy(p.hub)
    pose.camber = side * sol.camber

    // Spring and damper show how hard they are working; after a drive they show how healthy they are.
    if (this.highlight) cStrain.copy(this.highlight.colors[i])
    else strainColor(Math.abs(travel) / SUSPENSION.BUMP_M, cStrain)

    /* wishbones, knuckle and hub */
    this.bar(p.plf, p.lbj, 0.017, cArm)
    this.bar(p.plr, p.lbj, 0.017, cArm)
    this.bar(p.puf, p.ubj, 0.013, cArm)
    this.bar(p.pur, p.ubj, 0.013, cArm)
    this.bar(p.lbj, p.ubj, 0.022, cArm)
    p.a.addVectors(p.lbj, p.ubj).multiplyScalar(0.5)
    this.bar(p.a, p.hub, 0.02, cArm)

    /* steering tie-rod (toe link on the rear axle) */
    p.re.set(X(0.2), chassisY + 0.17, zA + 0.15)
    p.sa.set(p.lbj.x, p.lbj.y + 0.09, zA + 0.14)
    this.bar(p.re, p.sa, 0.011, cArm)

    /* half-shaft: inner CV boot, then the shaft out to the hub */
    p.diff.set(X(0.18), chassisY + 0.189, zA)
    p.hubIn.set(p.hub.x - side * 0.085, p.hub.y, zA)
    p.cv.lerpVectors(p.diff, p.hubIn, 0.36)
    this.bar(p.diff, p.cv, 0.028, cLink)
    this.bar(p.cv, p.hubIn, 0.012, cLink)

    /* damper: telescopic body + rod + top boot, on the outboard end of the lower arm */
    p.lowerMid.addVectors(p.plf, p.plr).multiplyScalar(0.5)
    p.bd.lerpVectors(p.lowerMid, p.lbj, 0.8)
    p.bd.y += 0.04
    p.td.set(X(0.57), chassisY + 0.6, zA)
    const damperDir = this.damperDir.subVectors(p.td, p.bd).normalize()
    p.bodyTop.copy(p.bd).addScaledVector(damperDir, DAMPER_BODY)
    p.rodTop.copy(p.td).addScaledVector(damperDir, -0.05)
    this.bar(p.bd, p.bodyTop, 0.034, cStrain)
    this.bar(p.bodyTop, p.rodTop, 0.012, cArm)
    this.bar(p.rodTop, p.td, 0.026, cStrain)

    /* air spring: pedestal, piston, ribbed bellows, top cap */
    p.armPt.lerpVectors(p.lowerMid, p.lbj, 0.5)
    p.ba.copy(p.armPt)
    p.ba.y += 0.17
    p.ta.set(X(0.4), chassisY + 0.585, zA)
    const springDir = this.springDir.subVectors(p.ta, p.ba).normalize()
    p.sTop.copy(p.ba).addScaledVector(springDir, SPRING_PISTON)
    p.cap.copy(p.ta).addScaledVector(springDir, -SPRING_CAP)
    this.bar(p.armPt, p.ba, 0.02, cLink)
    this.bar(p.ba, p.sTop, 0.05, cStrain)
    this.bar(p.cap, p.ta, 0.058, cStrain)
    for (let r = 0; r < RING_FRACTIONS.length; r++) {
      p.a.lerpVectors(p.sTop, p.cap, RING_FRACTIONS[r])
      this.ring(p.a, springDir, RING_RADIUS[r], cStrain)
    }

    /* anti-roll bar arm and drop link, from the lower arm on the near-axle side */
    const armDir = front ? -1 : 1
    const barZ = zA - armDir * 0.28
    const barY = chassisY + 0.1
    p.ap.lerpVectors(front ? p.plr : p.plf, p.lbj, 0.65)
    p.linkTop.copy(p.ap)
    p.linkTop.y += 0.1
    const sinT = Math.max(-0.9, Math.min(0.9, (p.linkTop.y - barY) / 0.23))
    p.bend.set(X(0.5), barY, barZ)
    p.tip.set(X(0.52), barY + 0.23 * sinT, barZ + armDir * 0.23 * Math.sqrt(1 - sinT * sinT))
    this.bar(p.bend, p.tip, 0.012, cArm)
    this.bar(p.tip, p.ap, 0.009, cArm)

    /* rear: trailing link to a body mount ahead of the axle */
    if (!front) {
      p.fm.set(X(0.62), chassisY + 0.17, zA - 0.8)
      p.he.set(p.hub.x - side * 0.14, p.hub.y - 0.03, zA - 0.04)
      this.bar(p.fm, p.he, 0.016, cArm)
      this.joint(p.fm, 0.013)
      this.joint(p.he, 0.013)
    }

    for (const pt of [p.plf, p.plr, p.puf, p.pur, p.re, p.sa]) this.joint(pt, 0.012)
    for (const pt of [p.lbj, p.ubj]) this.joint(pt, 0.022)
    for (const pt of [p.bd, p.td, p.ba, p.ta, p.cv]) this.joint(pt, 0.013)

    /* callout anchor above the tyre, and (after a drive) a halo ringing the whole wheel and its hardware */
    this.anchors[i].set(p.hub.x + side * 0.12, p.hub.y + 0.58, p.hub.z)
    this.anchorsBelow[i].set(p.hub.x + side * 0.12, p.hub.y - 0.56, p.hub.z)
    if (this.highlight) {
      const scale = 1 + 0.05 * this.highlight.pulse
      this.q.setFromUnitVectors(AXIS_Z, AXIS_X)
      this.halos.add(this.m.compose(p.hub, this.q, this.scl.setScalar(0.54 * scale)), cStrain)
    }
  }

  /** Subframes, anti-roll bar torsion bars, differentials and the propshaft. */
  private axles(chassisY: number) {
    const { p, cLink, cArm } = this
    const diffY = chassisY + 0.189
    const frameY = chassisY + HP.lowerPivot[1] + 0.005

    for (const w of [WHEELS[0], WHEELS[2]]) {
      const zA = w.z
      const front = zA < 0
      const zf = zA + LEG.lowerF
      const zr = zA + LEG.lowerR

      /* subframe */
      for (const z of [zf, zr]) {
        p.a.set(-0.4, frameY, z)
        p.b.set(0.4, frameY, z)
        this.bar(p.a, p.b, 0.018, cLink)
      }
      for (const x of [-0.4, 0.4]) {
        p.a.set(x, frameY, zf)
        p.b.set(x, frameY, zr)
        this.bar(p.a, p.b, 0.018, cLink)
      }

      /* anti-roll bar torsion section */
      const barZ = zA - (front ? -1 : 1) * 0.28
      p.a.set(-0.5, chassisY + 0.1, barZ)
      p.b.set(0.5, chassisY + 0.1, barZ)
      this.bar(p.a, p.b, 0.016, cArm)

      /* differential housing */
      p.a.set(0, diffY, zA)
      for (let k = 0; k < 3; k++) {
        p.b.set(0, diffY, zA + (k - 1) * 0.06)
        this.ring(p.b, AXIS_Z, k === 1 ? 0.135 : 0.1, cLink)
      }
      this.joint(p.a, 0.035)
    }

    /* propshaft with centre joint, and the side sills joining the subframes */
    const front = WHEELS[0].z
    const rear = WHEELS[2].z
    p.a.set(0, diffY, front + 0.16)
    p.b.set(0, diffY, 0)
    this.bar(p.a, p.b, 0.028, cLink)
    this.joint(p.b, 0.03)
    p.a.set(0, diffY, rear - 0.16)
    this.bar(p.b, p.a, 0.028, cLink)
    for (const x of [-0.4, 0.4]) {
      p.a.set(x, frameY, front + LEG.lowerR)
      p.b.set(x, frameY, rear + LEG.lowerF)
      this.bar(p.a, p.b, 0.02, cLink)
    }
  }
}
