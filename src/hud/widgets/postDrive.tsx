import { AnimatePresence, motion } from 'framer-motion'
import { ChevronsDown, DoorOpen, Droplets, Milestone, Radar, Timer } from 'lucide-react'
import { RIDE_HEIGHT_MM } from '../../config'
import { useTelemetryStore } from '../../store/useTelemetryStore'
import { HudLabel, fadeSide, fadeUp } from '../primitives'

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** Brief end-of-trip telemetry plus egress status while the chassis lowers to access height. */
export function TripSummary() {
  const trip = useTelemetryStore((s) => s.trip)
  const height = useTelemetryStore((s) => s.live.rideHeightMm)
  const egressReady = Math.abs(height - RIDE_HEIGHT_MM.ACCESS) <= 3

  const tiles = [
    { icon: Timer, value: formatDuration(trip.durationS), unit: '', label: 'Time' },
    { icon: Milestone, value: (trip.distanceM / 1000).toFixed(2), unit: 'km', label: 'Distance' },
    { icon: Droplets, value: String(Math.round(trip.maxWaterMm)), unit: 'mm', label: 'Max wade' },
    { icon: Radar, value: String(trip.predictiveAdjustments), unit: '', label: 'Pre-sets' },
  ]

  return (
    <motion.section {...fadeSide(-1)} aria-label="Trip summary" className="w-[330px]">
      <HudLabel>Trip summary</HudLabel>
      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5">
        {tiles.map(({ icon: Icon, value, unit, label }) => (
          <div key={label} className="flex flex-col-reverse">
            <dt>
              <HudLabel>{label}</HudLabel>
            </dt>
            <dd className="flex items-baseline gap-2">
              <Icon size={18} className="translate-y-0.5" aria-hidden="true" />
              <span className="glow hud-num text-3xl">{value}</span>
              {unit && <span className="text-sm font-bold opacity-85">{unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 h-11" role="status">
        <AnimatePresence mode="wait">
          {egressReady ? (
            <motion.div
              key="ready"
              {...fadeUp}
              className="glow flex w-fit items-center gap-2 rounded border-2 border-hud-green/70 bg-black/40 px-3 py-2 text-hud-green"
            >
              <DoorOpen size={20} />
              <span className="text-[15px] font-bold tracking-[0.12em]">EXIT READY</span>
            </motion.div>
          ) : (
            <motion.div key="lowering" {...fadeUp} className="flex items-center gap-2 px-3 py-2">
              <ChevronsDown size={20} className="animate-bounce" />
              <span className="text-[15px] font-bold tracking-[0.12em]">LOWERING</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
