import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSettingsStore } from '../a11y/useSettingsStore'
import { VEHICLE } from '../config'
import { sim } from '../sim/simState'
import { COLOR } from './materials'

const CHEVRON_COUNT = 4

/** Flat chevron pointing toward +Z (behind the vehicle). */
function createChevron() {
  const s = new THREE.Shape()
  s.moveTo(-0.8, 0.3)
  s.lineTo(0, -0.4)
  s.lineTo(0.8, 0.3)
  s.lineTo(0.8, 0.62)
  s.lineTo(0, -0.08)
  s.lineTo(-0.8, 0.62)
  s.closePath()
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)
}

/** Wade limit exceeded: a pulsing barrier ahead and chevrons flowing rearward. */
export function ReverseArrows() {
  const palette = useSettingsStore((s) => s.palette)
  const group = useRef<THREE.Group>(null!)

  const res = useMemo(() => {
    void palette // colours are copied at creation: rebuild on palette change
    const glow = () =>
      new THREE.MeshBasicMaterial({
        color: COLOR.red.clone(),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    const rails: number[] = []
    for (const x of [-1.15, 1.15]) for (let z = VEHICLE.rearZ + 0.4; z < 8.5; z += 0.7) rails.push(x, 0, z, x, 0, z + 0.35)
    return {
      chevron: createChevron(),
      chevronMats: Array.from({ length: CHEVRON_COUNT }, glow),
      barrierMat: glow(),
      rails: new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(rails, 3)),
      railMat: new THREE.LineBasicMaterial({ color: COLOR.red.clone(), transparent: true, opacity: 0 }),
    }
  }, [palette])

  useEffect(
    () => () => {
      res.chevron.dispose()
      res.chevronMats.forEach((m) => m.dispose())
      res.barrierMat.dispose()
      res.rails.dispose()
      res.railMat.dispose()
    },
    [res],
  )

  useFrame((state) => {
    const cue = sim.reverseCue
    group.current.visible = cue > 0.01
    if (!group.current.visible) return
    const t = state.clock.elapsedTime
    group.current.position.y = sim.water + 0.04
    // Phase lag per chevron makes the pulse travel rearward. Reduced motion: steady, fully lit cues.
    const calm = sim.reducedMotion
    res.chevronMats.forEach((m, i) => {
      const wave = 0.5 + 0.5 * Math.sin(t * 4 - i * 1.1)
      m.opacity = cue * (calm ? 0.85 : 0.15 + 0.85 * wave * wave)
    })
    res.barrierMat.opacity = cue * (calm ? 0.9 : 0.55 + 0.45 * Math.sin(t * 6))
    res.railMat.opacity = cue * 0.6
  })

  return (
    <group ref={group} visible={false}>
      {res.chevronMats.map((m, i) => (
        <mesh key={i} geometry={res.chevron} material={m} position={[0, 0, VEHICLE.rearZ + 0.75 + i * 0.95]} scale={0.62} />
      ))}
      <mesh position={[0, 0.02, VEHICLE.frontZ - 1.1]} material={res.barrierMat}>
        <boxGeometry args={[2.8, 0.04, 0.1]} />
      </mesh>
      <lineSegments geometry={res.rails} material={res.railMat} />
    </group>
  )
}
