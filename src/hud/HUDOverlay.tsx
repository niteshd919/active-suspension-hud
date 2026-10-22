import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotion } from '../a11y/preferences'
import { DEV_PANEL_WIDTH, PANEL_TRANSITION } from '../config'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { Zone } from './primitives'
import { HeightGauge, SpeedReadout, StatusPill } from './widgets/core'
import { AlertVignette, ArticulationPanel, DampingWave, HazardCallout, WadeAlert, WadePanel } from './widgets/onRide'
import { TripSummary } from './widgets/postDrive'
import { HealthCalloutsHost, HealthPanel } from './widgets/health'
import { BootSequence, TirePressure } from './widgets/preDrive'

/**
 * 2D HUD layer. Fixed zones keep every element in a predictable place for sub-2s glances:
 * top = status + alerts, middle edges = phase context, bottom = height · speed · mode instrument.
 * Every zone scales with the user's text-size setting.
 */
export function HUDOverlay() {
  const phase = useTelemetryStore((s) => s.phase)
  const mode = useTelemetryStore((s) => (s.phase === 'ON_RIDE' ? s.rideMode : null))
  const panelOpen = useTelemetryStore((s) => s.devPanelOpen)
  const reducedMotion = useReducedMotion()

  return (
    <div
      role="region"
      aria-label="In-vehicle infotainment instruments"
      className="hud-root pointer-events-none absolute inset-0 font-hud text-hud-cyan select-none"
    >
      {/* Black emits nothing on a combiner: these fades carve clear zones so the instruments never sit on bright content. */}
      <div className="absolute inset-x-0 bottom-0 h-[270px] bg-linear-to-t from-black via-black/80 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-[160px] bg-linear-to-b from-black/85 to-transparent" aria-hidden="true" />
      <AlertVignette />
      <AnimatePresence>{phase === 'POST_DRIVE' && <HealthCalloutsHost key="health-callouts" />}</AnimatePresence>
      <motion.div
        className="absolute inset-y-0 left-0 p-8"
        initial={false}
        animate={{ right: panelOpen ? DEV_PANEL_WIDTH + 24 : 0 }}
        transition={reducedMotion ? { duration: 0 } : PANEL_TRANSITION}
      >
        <div className="relative h-full w-full">
          <Zone className="absolute inset-x-0 top-0 flex flex-col items-center gap-4">
            <StatusPill />
            <AnimatePresence mode="wait">
              {mode === 'ROUGH' && <HazardCallout key="hazard" />}
              {mode === 'FLOOD' && <WadeAlert key="wade" />}
            </AnimatePresence>
          </Zone>

          <Zone className="absolute top-1/2 left-0 -translate-y-1/2">
            <AnimatePresence mode="wait">
              {phase === 'PRE_DRIVE' && <BootSequence key="boot" />}
              {phase === 'POST_DRIVE' && <TripSummary key="trip" />}
            </AnimatePresence>
          </Zone>
          <Zone className="absolute top-1/2 right-0 -translate-y-1/2">
            <AnimatePresence>{phase === 'PRE_DRIVE' && <TirePressure key="tyres" />}</AnimatePresence>
          </Zone>
          {/* Clear of the corner where the dev-panel tab sits when the panel is hidden. */}
          <Zone className="absolute top-[76px] right-0">
            <AnimatePresence>{phase === 'POST_DRIVE' && <HealthPanel key="health" />}</AnimatePresence>
          </Zone>

          <div className="absolute inset-x-0 bottom-0 grid grid-cols-[1fr_auto_1fr] items-end gap-6">
            <Zone className="justify-self-start">
              <HeightGauge />
            </Zone>
            <Zone>
              <SpeedReadout />
            </Zone>
            <Zone className="justify-self-end">
              <AnimatePresence mode="wait">
                {mode === 'HIGHWAY' && <DampingWave key="damping" />}
                {mode === 'ROUGH' && <ArticulationPanel key="articulation" />}
                {mode === 'FLOOD' && <WadePanel key="wade" />}
              </AnimatePresence>
            </Zone>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
