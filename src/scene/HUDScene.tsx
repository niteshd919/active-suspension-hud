import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { motion } from 'framer-motion'
import { useSceneDescription } from '../a11y/LiveRegion'
import { useReducedMotion } from '../a11y/preferences'
import { DEV_PANEL_WIDTH, PANEL_TRANSITION } from '../config'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { CameraRig } from './CameraRig'
import { HazardMarker } from './HazardMarker'
import { LidarTerrain } from './LidarTerrain'
import { ReverseArrows } from './ReverseArrows'
import { SimulationDriver } from './SimulationDriver'
import { Vehicle } from './Vehicle'
import { WaterPlane } from './WaterPlane'

/**
 * Real-time 3D projection layer. Pure black background (= transparent on a HUD combiner);
 * every visible element is emissive linework, points or additive glow. Bloom is thresholded
 * high enough that it only haloes bright strokes and never lifts the black floor.
 */
export function HUDScene() {
  const panelOpen = useTelemetryStore((s) => s.devPanelOpen)
  const description = useSceneDescription()
  const reducedMotion = useReducedMotion()
  return (
    <motion.div
      className="absolute inset-y-0 left-0"
      initial={false}
      animate={{ right: panelOpen ? DEV_PANEL_WIDTH + 24 : 0 }}
      transition={reducedMotion ? { duration: 0 } : PANEL_TRANSITION}
    >
      <Canvas
        role="img"
        aria-label={description}
        flat
        dpr={[1, 1.5]}
        camera={{ fov: 40, near: 0.1, far: 120, position: [6.4, 1.9, -7.4] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 16, 44]} />

        <SimulationDriver />
        <CameraRig />

        <LidarTerrain />
        <Vehicle />
        <HazardMarker />
        <WaterPlane />
        <ReverseArrows />

        <EffectComposer>
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.35} luminanceSmoothing={0.15} radius={0.55} />
        </EffectComposer>
      </Canvas>
    </motion.div>
  )
}
