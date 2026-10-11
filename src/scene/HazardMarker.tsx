import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TERRAIN } from '../config'
import { sim } from '../sim/simState'
import { COLOR } from './materials'

/**
 * Reticle locked onto the next obstacle the predictive scan has found in either wheel track.
 * Severity is carried by shape as well as colour: caution is a single ring and diamond, a hazard is
 * a larger double ring with a taller stem and a double-height diamond.
 */
export function HazardMarker() {
  const group = useRef<THREE.Group>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const outer = useRef<THREE.Mesh>(null!)
  const stem = useRef<THREE.Mesh>(null!)
  const gem = useRef<THREE.Mesh>(null!)
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: COLOR.amber.clone(), transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const hz = sim.hazard
    group.current.visible = hz.active
    if (!hz.active) return
    const severe = hz.h > TERRAIN.RED_M
    group.current.position.set(hz.x, hz.h + 0.03, hz.z)
    material.color.copy(severe ? COLOR.red : COLOR.amber)
    outer.current.visible = severe
    ring.current.scale.setScalar(severe ? 1.25 : 1)
    stem.current.scale.y = severe ? 1.5 : 1
    stem.current.position.y = severe ? 0.48 : 0.32
    gem.current.position.y = severe ? 1.0 : 0.68
    gem.current.scale.setScalar(severe ? 1.7 : 1)
    const pulse = sim.reducedMotion ? 1 : 1 + 0.15 * Math.sin(state.clock.elapsedTime * 8)
    group.current.scale.setScalar(pulse)
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} material={material}>
        <ringGeometry args={[0.3, 0.36, 40]} />
      </mesh>
      <mesh ref={outer} rotation-x={-Math.PI / 2} material={material} visible={false}>
        <ringGeometry args={[0.52, 0.57, 40]} />
      </mesh>
      <mesh ref={stem} position-y={0.32} material={material}>
        <boxGeometry args={[0.014, 0.6, 0.014]} />
      </mesh>
      <mesh ref={gem} position-y={0.68} material={material}>
        <octahedronGeometry args={[0.08]} />
      </mesh>
    </group>
  )
}
