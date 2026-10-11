import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSettingsStore } from '../a11y/useSettingsStore'
import { VEHICLE, WADE } from '../config'
import { sim } from '../sim/simState'
import { COLOR, alertColor } from './materials'

const POLE_POSITION: [number, number, number] = [1.6, 0, -3.1]
/** Longer ticks for higher thresholds, so the pole reads without relying on colour. */
const POLE_TICKS = [
  { mm: WADE.AUTO_RAISE_MM, color: 'cyan', length: 0.2 },
  { mm: WADE.WARN_MM, color: 'amber', length: 0.3 },
  { mm: WADE.LIMIT_MM, color: 'red', length: 0.42 },
] as const

const tmpColor = new THREE.Color()

/** Wade-sensing visuals: rising water surface, waterline contour on the body, and a depth pole. */
export function WaterPlane() {
  const palette = useSettingsStore((s) => s.palette)
  const surface = useRef<THREE.Mesh>(null!)
  const contour = useRef<THREE.LineLoop>(null!)
  const pole = useRef<THREE.Group>(null!)
  const poleMarker = useRef<THREE.Mesh>(null!)

  // Materials copy their colours at creation, so rebuild them when the palette changes.
  const res = useMemo(() => {
    void palette
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTravel: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: COLOR.cyan.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vXZ;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vXZ = world.xz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uTravel;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vXZ;
        void main() {
          float r = length(vXZ * vec2(1.0, 0.6));
          float fade = 1.0 - smoothstep(3.0, 11.0, r);
          vec2 cell = abs(fract(vec2(vXZ.x, vXZ.y - uTravel) * 1.25) - 0.5);
          float grid = smoothstep(0.47, 0.5, max(cell.x, cell.y));
          float ripple = pow(0.5 + 0.5 * sin(r * 3.2 - uTime * 2.2), 10.0);
          float alpha = uOpacity * fade * (0.16 + 0.3 * grid + 0.2 * ripple);
          gl_FragColor = vec4(uColor * (0.45 + 0.35 * grid + 0.25 * ripple), alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const hw = VEHICLE.halfWidth + 0.08
    const [zf, zr] = [VEHICLE.frontZ - 0.06, VEHICLE.rearZ + 0.05]
    const contourGeometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-hw, 0, zf, hw, 0, zf, hw, 0, zr, -hw, 0, zr], 3),
    )
    return {
      waterMat,
      contourGeometry,
      contourMat: new THREE.LineBasicMaterial({ color: COLOR.cyan.clone(), transparent: true, opacity: 0 }),
      poleMat: new THREE.MeshBasicMaterial({ color: COLOR.cyan.clone(), transparent: true, opacity: 0 }),
      tickMats: POLE_TICKS.map((t) => new THREE.MeshBasicMaterial({ color: COLOR[t.color].clone(), transparent: true, opacity: 0 })),
    }
  }, [palette])

  useEffect(
    () => () => {
      res.waterMat.dispose()
      res.contourGeometry.dispose()
      res.contourMat.dispose()
      res.poleMat.dispose()
      res.tickMats.forEach((m) => m.dispose())
    },
    [res],
  )

  useFrame((state) => {
    const visible = sim.floodCue > 0.01 || sim.water > 0.005
    surface.current.visible = visible
    contour.current.visible = visible && sim.water > 0.02
    pole.current.visible = sim.floodCue > 0.01
    if (!visible) return

    alertColor(sim.alert, tmpColor)
    const u = res.waterMat.uniforms
    u.uTime.value = sim.reducedMotion ? 0 : state.clock.elapsedTime // freezes the ripples; the grid still scrolls with the vehicle
    u.uTravel.value = sim.travel
    u.uOpacity.value = Math.min(1, sim.floodCue * 1.2) * Math.min(1, sim.water * 8)
    u.uColor.value.lerpColors(COLOR.cyan, tmpColor, 0.2) // water stays cyan; the alert lives on the contour + body
    surface.current.position.y = sim.water

    contour.current.position.y = sim.water + 0.01
    res.contourMat.color.copy(tmpColor)
    res.contourMat.opacity = 0.9 * sim.floodCue

    res.poleMat.opacity = 0.55 * sim.floodCue
    res.tickMats.forEach((m) => (m.opacity = sim.floodCue))
    poleMarker.current.position.y = sim.water
  })

  return (
    <>
      <mesh ref={surface} rotation-x={-Math.PI / 2} material={res.waterMat} renderOrder={2}>
        <planeGeometry args={[40, 70]} />
      </mesh>
      <lineLoop ref={contour} geometry={res.contourGeometry} material={res.contourMat} />
      <group ref={pole} position={POLE_POSITION}>
        <mesh position-y={0.5} material={res.poleMat}>
          <boxGeometry args={[0.03, 1, 0.03]} />
        </mesh>
        {POLE_TICKS.map((t, i) => (
          <mesh key={t.mm} position-y={t.mm / 1000} material={res.tickMats[i]}>
            <boxGeometry args={[t.length, 0.03, 0.03]} />
          </mesh>
        ))}
        <mesh ref={poleMarker} rotation-x={-Math.PI / 2} material={res.contourMat}>
          <ringGeometry args={[0.07, 0.1, 24]} />
        </mesh>
      </group>
    </>
  )
}
