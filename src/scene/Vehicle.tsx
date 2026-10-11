import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useHighContrast } from '../a11y/preferences'
import { useSettingsStore } from '../a11y/useSettingsStore'
import { VEHICLE, WHEELS } from '../config'
import { sim } from '../sim/simState'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { COLOR, alertColor, createHologramMaterial } from './materials'
import { SENSOR, buildDefenderBody } from './vehicle/defenderBody'
import { SuspensionRig, type RigHighlight } from './vehicle/SuspensionRig'
import { buildWheel } from './vehicle/wheelGeometry'

/** LiDAR fan: apex at the roof sensor, base on the ground ahead. Scaled per frame. */
function createScanFan() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1, -1, -1, 1, -1, -1], 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute([0.4, 1, 1, 0, 0.05, 0.08, 0, 0.05, 0.08], 3))
  return g
}

/** Reference line along the right sill, so wheel articulation reads against a level datum. */
function createDatum() {
  const x = 1.1
  const [z0, z1] = [VEHICLE.frontZ, VEHICLE.rearZ]
  const pts = [x, 0, z0, x, 0, z1, x - 0.08, 0, z0, x + 0.08, 0, z0, x - 0.08, 0, z1, x + 0.08, 0, z1]
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
}

const tint = new THREE.Color()
const projected = new THREE.Vector3()

/** Resting opacities. The x-ray factor scales the body down so the hardware underneath stands out. */
const BASE = {
  holo: { normal: 0.26, contrast: 0.18 },
  glass: { normal: 0.06, contrast: 0.03 },
  detail: { normal: 0.6, contrast: 1 },
  wheelLines: { normal: 0.7, contrast: 1 },
  tyre: 0.4,
}

/** Land Rover Defender 110 hologram: lofted body, wheels on a solved double-wishbone air suspension. */
export function Vehicle() {
  const palette = useSettingsStore((s) => s.palette)
  const highContrast = useHighContrast()

  const chassis = useRef<THREE.Group>(null!)
  const wheelRoots = useRef<(THREE.Group | null)[]>([])
  const spins = useRef<(THREE.Group | null)[]>([])
  const fan = useRef<THREE.Mesh>(null!)
  const clearance = useRef<THREE.Group>(null!)
  const clearanceBar = useRef<THREE.Mesh>(null!)
  const clearanceTop = useRef<THREE.Mesh>(null!)

  const geo = useMemo(
    () => ({ body: buildDefenderBody(), wheel: buildWheel(), fan: createScanFan(), datum: createDatum() }),
    [],
  )
  const rig = useMemo(() => new SuspensionRig(), [])
  const healthColors = useMemo(() => [0, 1, 2, 3].map(() => new THREE.Color()), [])

  // Materials read the live palette at creation, so rebuild them when the palette changes.
  const mat = useMemo(() => {
    void palette
    const line = (color: THREE.Color, opacity: number) =>
      new THREE.LineBasicMaterial({ color: color.clone(), transparent: true, opacity })
    return {
      holo: createHologramMaterial(highContrast ? BASE.holo.contrast : BASE.holo.normal),
      tyre: createHologramMaterial(BASE.tyre),
      structure: line(COLOR.cyan, 1),
      detail: line(COLOR.cyan, highContrast ? BASE.detail.contrast : BASE.detail.normal),
      lamps: line(COLOR.marking, 1),
      wheelLines: line(COLOR.cyan, highContrast ? BASE.wheelLines.contrast : BASE.wheelLines.normal),
      caliper: line(COLOR.marking, 0.85),
      datum: line(COLOR.green, 0),
      glass: new THREE.MeshBasicMaterial({
        color: COLOR.cyan.clone(),
        transparent: true,
        opacity: highContrast ? BASE.glass.contrast : BASE.glass.normal,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      fan: new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      sensor: new THREE.MeshBasicMaterial({ color: COLOR.cyan.clone() }),
      clearance: new THREE.MeshBasicMaterial({ color: COLOR.green.clone(), transparent: true, opacity: 0 }),
    }
  }, [palette, highContrast])

  useEffect(
    () => () => {
      Object.values(mat).forEach((m) => m.dispose())
    },
    [mat],
  )
  useEffect(
    () => () => {
      Object.values(geo.body).forEach((g) => g.dispose())
      Object.values(geo.wheel).forEach((g) => g.dispose())
      geo.fan.dispose()
      geo.datum.dispose()
      rig.dispose()
    },
    [geo, rig],
  )

  useFrame((state, dt) => {
    const s = useTelemetryStore.getState()
    const chassisY = sim.rideHeight + sim.heave

    alertColor(sim.alert, tint)
    mat.structure.color.copy(tint)
    mat.holo.uniforms.uColor.value.copy(tint)
    mat.holo.uniforms.uTime.value = state.clock.elapsedTime
    mat.holo.uniforms.uMotion.value = sim.reducedMotion ? 0 : 1
    mat.tyre.uniforms.uTime.value = state.clock.elapsedTime
    mat.tyre.uniforms.uMotion.value = sim.reducedMotion ? 0 : 1
    chassis.current.position.y = chassisY

    // X-ray: fade the body (and a little of the tyres) so the suspension hardware reads clearly.
    const hc = highContrast
    const x = sim.xray
    const wheelFade = 0.4 + 0.6 * x
    mat.holo.uniforms.uOpacity.value = (hc ? BASE.holo.contrast : BASE.holo.normal) * x
    mat.tyre.uniforms.uOpacity.value = BASE.tyre * wheelFade
    mat.structure.opacity = x
    mat.detail.opacity = (hc ? BASE.detail.contrast : BASE.detail.normal) * x
    mat.lamps.opacity = x
    mat.glass.opacity = (hc ? BASE.glass.contrast : BASE.glass.normal) * x
    mat.wheelLines.opacity = (hc ? BASE.wheelLines.contrast : BASE.wheelLines.normal) * wheelFade

    // One solve per frame drives both the drawn hardware and the wheel placement, so they never disagree.
    // After a drive the hardware shows its health: palette green / amber / red per corner, with a halo.
    let highlight: RigHighlight | null = null
    const health = s.phase === 'POST_DRIVE' ? s.live.health : null
    if (health) {
      health.corners.forEach((c, i) =>
        healthColors[i].copy(c.status === 'GOOD' ? COLOR.green : c.status === 'WATCH' ? COLOR.amber : COLOR.red),
      )
      highlight = { colors: healthColors, pulse: sim.reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3) }
    }
    rig.update(chassisY, sim.wheelY, sim.wheelTravel, highlight)

    // Publish where each wheel's callout anchor lands on screen, for the DOM callouts and their leader lines.
    state.camera.updateMatrixWorld()
    sim.canvas.w = state.size.width
    sim.canvas.h = state.size.height
    const project = (world: THREE.Vector3, out: { x: number; y: number; visible: boolean }) => {
      projected.copy(world).project(state.camera)
      out.x = (projected.x * 0.5 + 0.5) * state.size.width
      out.y = (-projected.y * 0.5 + 0.5) * state.size.height
      out.visible = projected.z > -1 && projected.z < 1
    }
    for (let i = 0; i < WHEELS.length; i++) {
      project(rig.anchors[i], sim.anchors[i])
      project(rig.anchorsBelow[i], sim.anchorsBelow[i])
    }
    for (let i = 0; i < WHEELS.length; i++) {
      const root = wheelRoots.current[i]
      if (!root) continue
      root.position.copy(rig.poses[i].hub)
      root.rotation.z = rig.poses[i].camber
      if (spins.current[i]) spins.current[i]!.rotation.x = sim.wheelSpin
    }

    // Level datum: only meaningful while the wheels are articulating.
    mat.datum.opacity = THREE.MathUtils.clamp(sim.amplitude - 0.1, 0, 0.9)

    // LiDAR fan from the roof sensor down to the road ahead; strongest in predictive (rough-terrain) mode.
    const apexY = chassisY + SENSOR.y + 0.05
    fan.current.position.set(SENSOR.x, apexY, SENSOR.z)
    fan.current.scale.set(7, apexY, 22)
    mat.fan.opacity = s.phase === 'ON_RIDE' ? (Math.max(0, sim.scan - 0.35) / 0.65) * 0.05 : 0

    // Ground-clearance bracket: shown whenever ride height is the story (parked, wading).
    const showClearance = s.phase !== 'ON_RIDE' || s.rideMode === 'FLOOD' ? 0.9 : 0
    mat.clearance.opacity = THREE.MathUtils.damp(mat.clearance.opacity, showClearance, 4, dt)
    clearance.current.position.y = sim.heave
    clearanceBar.current.scale.y = sim.rideHeight
    clearanceBar.current.position.y = sim.rideHeight / 2
    clearanceTop.current.position.y = sim.rideHeight
  })

  return (
    <group>
      <group ref={chassis}>
        <mesh geometry={geo.body.faces} material={mat.holo} />
        <mesh geometry={geo.body.glass} material={mat.glass} />
        <lineSegments geometry={geo.body.structure} material={mat.structure} />
        <lineSegments geometry={geo.body.detail} material={mat.detail} />
        <lineSegments geometry={geo.body.lamps} material={mat.lamps} />
        <lineSegments geometry={geo.datum} material={mat.datum} />
        <mesh position={[SENSOR.x, SENSOR.y, SENSOR.z]} material={mat.sensor}>
          <boxGeometry args={[0.22, 0.05, 0.12]} />
        </mesh>
      </group>

      {WHEELS.map((w, i) => (
        <group key={w.id} ref={(el) => void (wheelRoots.current[i] = el)} scale-x={w.x < 0 ? -1 : 1}>
          <group ref={(el) => void (spins.current[i] = el)}>
            <mesh geometry={geo.wheel.tyre} material={mat.tyre} />
            <lineSegments geometry={geo.wheel.spinning} material={mat.wheelLines} />
          </group>
          <lineSegments geometry={geo.wheel.fixed} material={mat.caliper} />
        </group>
      ))}

      <primitive object={rig.object} />
      <mesh ref={fan} geometry={geo.fan} material={mat.fan} frustumCulled={false} />

      <group ref={clearance} position={[1.3, 0, 0]}>
        <mesh ref={clearanceBar} material={mat.clearance}>
          <boxGeometry args={[0.014, 1, 0.014]} />
        </mesh>
        <mesh material={mat.clearance}>
          <boxGeometry args={[0.16, 0.012, 0.012]} />
        </mesh>
        <mesh ref={clearanceTop} material={mat.clearance}>
          <boxGeometry args={[0.16, 0.012, 0.012]} />
        </mesh>
      </group>
    </group>
  )
}
