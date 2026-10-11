import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useHighContrast } from '../a11y/preferences'
import { TERRAIN, VEHICLE } from '../config'
import { sim } from '../sim/simState'
import { terrainBase } from '../sim/terrain'
import { COLOR } from './materials'

const COLS = 128
const ROWS = 240
const X_HALF = 7.5
const Z_FAR = -46
const Z_NEAR = 5.5
const ROW_GAP = (Z_NEAR - Z_FAR) / ROWS
const LANE_DASHED_X = 1.85 // own-lane edges
const LANE_SOLID_X = 5.55 // carriageway edges
const DASH_PERIOD_M = 12
const DASH_LENGTH_M = 3.2
/** Capacity of the raised-point layer (hazard points are a small fraction of the cloud). */
const HAZARD_MAX = 6144

const mod = (a: number, n: number) => ((a % n) + n) % n
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Height → linear RGB: dips blue, flat cyan, gentle relief green, then amber and alert red. */
function heightColor(h: number, out: number[]) {
  let a: THREE.Color
  let b: THREE.Color
  let t: number
  if (h <= 0) {
    a = COLOR.cyan
    b = COLOR.dip
    t = clamp01(-h / 0.12)
  } else if (h <= TERRAIN.SAFE_M) {
    a = COLOR.cyan
    b = COLOR.green
    t = h / TERRAIN.SAFE_M
  } else if (h <= TERRAIN.AMBER_M) {
    a = COLOR.green
    b = COLOR.amber
    t = (h - TERRAIN.SAFE_M) / (TERRAIN.AMBER_M - TERRAIN.SAFE_M)
  } else {
    a = COLOR.amber
    b = COLOR.red
    t = clamp01((h - TERRAIN.AMBER_M) / (TERRAIN.RED_M - TERRAIN.AMBER_M))
  }
  out[0] = a.r + (b.r - a.r) * t
  out[1] = a.g + (b.g - a.g) * t
  out[2] = a.b + (b.b - a.b) * t
}

/**
 * Ground-locked LiDAR point cloud. Rows slide toward +Z with the distance travelled and wrap
 * at the near edge, so points visibly stream past the vehicle. Because relief is linear in
 * amplitude, unscaled noise is cached per ground row in a ring buffer; only rows that scroll
 * in at the far edge are sampled each frame.
 *
 * Points above the caution height are also written into a second, larger-point layer, so a bump or
 * rock is distinguishable by size as well as by its amber/red colour.
 */
export function LidarTerrain() {
  const highContrast = useHighContrast()
  const cloud = useMemo(() => {
    const xs = new Float32Array(COLS)
    const edgeFade = new Float32Array(COLS)
    const lane = new Uint8Array(COLS) // 0 none · 1 dashed · 2 solid
    const colGap = (2 * X_HALF) / (COLS - 1)
    for (let c = 0; c < COLS; c++) {
      const x = -X_HALF + c * colGap
      xs[c] = x
      edgeFade[c] = clamp01((X_HALF - Math.abs(x)) / 1.8)
      if (Math.abs(Math.abs(x) - LANE_DASHED_X) < colGap / 2) lane[c] = 1
      else if (Math.abs(Math.abs(x) - LANE_SOLID_X) < colGap / 2) lane[c] = 2
    }

    const positions = new Float32Array(COLS * ROWS * 3)
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) positions[(r * COLS + c) * 3] = xs[c]

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(COLS * ROWS * 3), 3).setUsage(THREE.DynamicDrawUsage),
    )
    const raised = new THREE.BufferGeometry()
    raised.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HAZARD_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage))
    raised.setAttribute('color', new THREE.BufferAttribute(new Float32Array(HAZARD_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage))
    raised.setDrawRange(0, 0)
    return { geometry, raised, xs, edgeFade, lane, relief: new Float32Array(COLS * ROWS), lowestRow: { g: Infinity } }
  }, [])

  useEffect(
    () => () => {
      cloud.geometry.dispose()
      cloud.raised.dispose()
    },
    [cloud],
  )

  useFrame(() => {
    const { geometry, raised, xs, edgeFade, lane, relief, lowestRow } = cloud
    const rPos = raised.attributes.position.array as Float32Array
    const rCol = raised.attributes.color.array as Float32Array
    let nRaised = 0
    const pos = geometry.attributes.position.array as Float32Array
    const col = geometry.attributes.color.array as Float32Array

    // Row r shows ground row g = r - shift, at ground coordinate s = Z_FAR + g * ROW_GAP.
    const shift = Math.floor(sim.travel / ROW_GAP)
    const offset = sim.travel - shift * ROW_GAP
    const newest = -shift
    const fillFrom = lowestRow.g - newest > ROWS ? ROWS - 1 - shift : lowestRow.g - 1
    for (let g = Math.min(fillFrom, ROWS - 1 - shift); g >= newest; g--) {
      const slot = mod(g, ROWS) * COLS
      const s = Z_FAR + g * ROW_GAP
      for (let c = 0; c < COLS; c++) relief[slot + c] = terrainBase(xs[c], s)
    }
    lowestRow.g = newest

    const { amplitude, roadness, intensity, scan } = sim
    const scanZ = VEHICLE.frontZ - mod(sim.time * 20, 50)
    const pulseGain = sim.reducedMotion ? 0 : scan
    const rgb = [0, 0, 0]

    for (let r = 0; r < ROWS; r++) {
      const g = r - shift
      const slot = mod(g, ROWS) * COLS
      const z = Z_FAR + r * ROW_GAP + offset
      const s = Z_FAR + g * ROW_GAP
      const rowFade = clamp01((Z_NEAR - z) / 3)
      const dashOn = mod(s, DASH_PERIOD_M) < DASH_LENGTH_M
      const dz = z - scanZ
      const pulse = pulseGain * Math.exp(-dz * dz * 1.5)

      for (let c = 0; c < COLS; c++) {
        const i = (r * COLS + c) * 3
        const h = amplitude * relief[slot + c]
        pos[i + 1] = h
        pos[i + 2] = z

        heightColor(h, rgb)
        const fade = rowFade * edgeFade[c]
        let k = intensity * fade * (h > TERRAIN.AMBER_M ? 1.6 : 1)
        const l = lane[c]
        if (l !== 0 && roadness > 0.01 && (l === 2 || dashOn)) {
          rgb[0] += (COLOR.marking.r - rgb[0]) * roadness
          rgb[1] += (COLOR.marking.g - rgb[1]) * roadness
          rgb[2] += (COLOR.marking.b - rgb[2]) * roadness
          k *= 1 + roadness
        }
        const p = pulse * fade
        col[i] = rgb[0] * k + p * 0.2
        col[i + 1] = rgb[1] * k + p * 0.75
        col[i + 2] = rgb[2] * k + p * 0.85

        if (h > TERRAIN.AMBER_M && fade > 0.2 && nRaised < HAZARD_MAX) {
          const j = nRaised * 3
          rPos[j] = xs[c]
          rPos[j + 1] = h
          rPos[j + 2] = z
          rCol[j] = rgb[0] * k
          rCol[j + 1] = rgb[1] * k
          rCol[j + 2] = rgb[2] * k
          nRaised++
        }
      }
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
    raised.setDrawRange(0, nRaised)
    raised.attributes.position.needsUpdate = true
    raised.attributes.color.needsUpdate = true
  })

  return (
    <>
      <points geometry={cloud.geometry} frustumCulled={false}>
        <pointsMaterial
          size={highContrast ? 0.075 : 0.055}
          sizeAttenuation
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points geometry={cloud.raised} frustumCulled={false}>
        <pointsMaterial
          size={highContrast ? 0.17 : 0.125}
          sizeAttenuation
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  )
}
