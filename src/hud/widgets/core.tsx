import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronsDown, ChevronsUp, CircleParking, Droplets, Mountain, Power, Route, Waves } from 'lucide-react'
import { HEIGHT_LABEL, HEIGHT_NAME, RIDE_HEIGHT_MM, type HeightMode } from '../../config'
import { selectTargetHeight, useTelemetryStore } from '../../store/useTelemetryStore'
import { HudLabel, TONE_TEXT, fadeUp, type Tone } from '../primitives'
import { useWadeStory } from '../useWadeStory'

const STATUS_META = {
  PRE_DRIVE: { icon: Power, label: 'SYSTEM CHECK' },
  HIGHWAY: { icon: Route, label: 'HIGHWAY' },
  ROUGH: { icon: Mountain, label: 'TERRAIN PREDICT' },
  FLOOD: { icon: Waves, label: 'WADE SENSE' },
  POST_DRIVE: { icon: CircleParking, label: 'PARKED' },
} as const

/** Current mode: always an icon *and* a word. Screen readers get the same information from the live region. */
export function StatusPill() {
  const key = useTelemetryStore((s) => (s.phase === 'ON_RIDE' ? s.rideMode : s.phase))
  const { icon: Icon, label } = STATUS_META[key]
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        {...fadeUp}
        className="glow flex items-center gap-3 rounded-full border-2 border-hud-cyan/60 bg-black/50 px-5 py-2"
      >
        <Icon size={20} strokeWidth={2.4} />
        <span className="text-base font-bold tracking-[0.16em]">{label}</span>
      </motion.div>
    </AnimatePresence>
  )
}

const SCALE_MIN_MM = 130
const SCALE_MAX_MM = 310
const toPct = (mm: number) => ((mm - SCALE_MIN_MM) / (SCALE_MAX_MM - SCALE_MIN_MM)) * 100
const HEIGHT_MODES = Object.keys(RIDE_HEIGHT_MM) as HeightMode[]

/** Vertical ride-height scale with the three air-suspension presets and a live pointer. */
export function HeightGauge() {
  const height = useTelemetryStore((s) => s.live.rideHeightMm)
  const mode = useTelemetryStore(selectTargetHeight)
  const delta = RIDE_HEIGHT_MM[mode] - height
  const moving = Math.abs(delta) > 6 // the air spring settles asymptotically; the last few mm are not "movement"
  const story = useWadeStory()
  const chipTone: Tone = story?.stage === 'LIMIT' ? 'red' : story?.stage === 'MAX' ? 'amber' : 'cyan'
  const explained = story ? ` ${story.reason}` : ''

  return (
    <div className="flex items-end gap-5">
      <div
        role="meter"
        aria-label="Ride height"
        aria-valuemin={SCALE_MIN_MM}
        aria-valuemax={SCALE_MAX_MM}
        aria-valuenow={height}
        aria-valuetext={`${height} millimetres, ${HEIGHT_NAME[mode]}${moving ? (delta > 0 ? ', raising' : ', lowering') : ''}.${explained}`}
        className="relative h-[150px] w-[92px]"
      >
        <div className="absolute inset-y-0 left-[7px] w-0.5 bg-hud-cyan/50" />
        {HEIGHT_MODES.map((m) => (
          <div
            key={m}
            className={`absolute left-0 flex translate-y-1/2 items-center gap-1.5 transition-colors duration-500 ${
              m === mode ? 'font-bold text-hud-cyan' : 'text-hud-cyan/70'
            }`}
            style={{ bottom: `${toPct(RIDE_HEIGHT_MM[m])}%` }}
          >
            <div className="h-0.5 w-[15px] bg-current" />
            <span className="text-[13px] font-bold tracking-[0.12em]">{HEIGHT_LABEL[m]}</span>
          </div>
        ))}
        <div
          className="absolute left-[-3px] h-[6px] w-[21px] translate-y-1/2 rounded-full bg-hud-green shadow-[0_0_12px_var(--color-hud-green)] transition-[bottom] duration-100 ease-linear"
          style={{ bottom: `${toPct(height)}%` }}
        />
      </div>
      <div className="pb-1" aria-hidden="true">
        <HudLabel>Ride height</HudLabel>
        <div className="flex items-baseline gap-1.5">
          <span className="glow hud-num text-5xl">{height}</span>
          <span className="text-base font-bold opacity-85">mm</span>
        </div>
        <div className="mt-1 h-6">
          <AnimatePresence mode="wait" initial={false}>
            {moving ? (
              <motion.div key="moving" {...fadeUp} className="flex items-center gap-1.5 text-hud-cyan">
                {delta > 0 ? <ChevronsUp size={18} className="animate-bounce" /> : <ChevronsDown size={18} className="animate-bounce" />}
                <span className="text-sm font-bold tracking-[0.18em]">{delta > 0 ? 'RAISING' : 'LOWERING'}</span>
              </motion.div>
            ) : (
              <motion.div key="set" {...fadeUp} className="flex items-center gap-1.5 text-hud-green">
                <Check size={18} />
                <span className="text-sm font-bold tracking-[0.18em]">{HEIGHT_LABEL[mode]}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence initial={false}>
          {story && (
            <motion.div
              key="why"
              {...fadeUp}
              className={`mt-1.5 flex w-fit items-center gap-1.5 rounded border-2 border-current/60 bg-black/40 px-2 py-0.5 ${TONE_TEXT[chipTone]}`}
            >
              <Droplets size={15} strokeWidth={2.4} />
              <span className="text-[13px] font-bold tracking-[0.1em]">{story.chip}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function SpeedReadout() {
  const speed = useTelemetryStore((s) => s.live.speedKmh)
  const parked = useTelemetryStore((s) => s.phase !== 'ON_RIDE') && speed < 1
  return (
    <div className="flex flex-col items-center" role="group" aria-label={parked ? 'Parked' : `Speed ${speed} kilometres per hour`}>
      <span className="glow hud-num text-7xl leading-none" aria-hidden="true">
        {parked ? 'P' : speed}
      </span>
      <HudLabel className="mt-1">{parked ? 'Park' : 'km/h'}</HudLabel>
    </div>
  )
}
