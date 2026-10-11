import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CircleDot, Cpu, LoaderCircle, MoveVertical, Radar, TriangleAlert, Wind } from 'lucide-react'
import { announce } from '../../a11y/announcer'
import { TYRE_OK_BAR, useTelemetryStore } from '../../store/useTelemetryStore'
import { HudLabel, TONE_TEXT, fadeSide, fadeUp, toneVar } from '../primitives'

const CHECKS = [
  { icon: Cpu, label: 'ECU' },
  { icon: Wind, label: 'COMPRESSOR' },
  { icon: MoveVertical, label: 'HEIGHT SENSORS' },
  { icon: Radar, label: 'LIDAR' },
  { icon: CircleDot, label: 'TYRES' },
]

/** Staggered self-test, replayed every time the vehicle enters PRE-DRIVE. */
export function BootSequence() {
  const [done, setDone] = useState(0)
  useEffect(() => {
    const timers = CHECKS.map((_, i) => setTimeout(() => setDone(i + 1), 700 + i * 520))
    return () => timers.forEach(clearTimeout)
  }, [])
  const ready = done >= CHECKS.length

  useEffect(() => {
    if (ready) announce('System check complete. Suspension ready.')
  }, [ready])

  return (
    <motion.section {...fadeSide(-1)} aria-label="System check" className="flex w-[270px] flex-col gap-3.5">
      <HudLabel>System check</HudLabel>
      <ol className="flex flex-col gap-3.5">
        {CHECKS.map(({ icon: Icon, label }, i) => {
          const state = i < done ? 'done' : i === done ? 'active' : 'pending'
          return (
            <li
              key={label}
              className={`flex items-center gap-3 transition-opacity duration-300 ${state === 'pending' ? 'opacity-60' : ''}`}
            >
              <Icon size={20} strokeWidth={2} />
              <span className="flex-1 text-[15px] font-bold tracking-[0.1em]">{label}</span>
              {state === 'done' ? (
                <Check size={20} strokeWidth={2.6} className="text-hud-green" />
              ) : state === 'active' ? (
                <LoaderCircle size={20} className="animate-spin" />
              ) : (
                <span className="mx-1.5 h-2 w-2 rounded-full bg-current" />
              )}
              <span className="sr-only">{state === 'done' ? 'complete' : state === 'active' ? 'checking' : 'waiting'}</span>
            </li>
          )
        })}
      </ol>
      <div className="h-12">
        <AnimatePresence>
          {ready && (
            <motion.div
              {...fadeUp}
              className="glow mt-1 flex w-fit items-center gap-2 rounded border-2 border-hud-green/70 bg-black/40 px-3 py-2 text-hud-green"
            >
              <Check size={20} strokeWidth={2.6} />
              <span className="text-[15px] font-bold tracking-[0.12em] whitespace-nowrap">SUSPENSION READY</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

const CORNER_NAMES = ['front left', 'front right', 'rear left', 'rear right']
const TYRE_RECTS = [
  { x: 2, y: 18 },
  { x: 55, y: 18 },
  { x: 2, y: 82 },
  { x: 55, y: 82 },
]
const outOfRange = (bar: number) => bar < TYRE_OK_BAR[0] || bar > TYRE_OK_BAR[1]

function TyreValue({ bar }: { bar: number }) {
  const bad = outOfRange(bar)
  return (
    <span className={`flex items-center justify-center gap-1 ${bad ? 'text-hud-amber' : 'text-hud-green'}`}>
      {/* The warning triangle makes "out of range" readable without colour. */}
      {bad && <TriangleAlert size={20} strokeWidth={2.6} />}
      <span className="glow hud-num text-3xl">{bar.toFixed(1)}</span>
    </span>
  )
}

/** Top-down vehicle with per-corner pressures; out-of-range corners get an icon, a heavier outline and a summary line. */
export function TirePressure() {
  const pressures = useTelemetryStore((s) => s.tirePressureBar)
  const bad = pressures.map(outOfRange)
  const anyBad = bad.some(Boolean)
  const spoken = pressures
    .map((bar, i) => `${CORNER_NAMES[i]} ${bar.toFixed(1)} bar${bad[i] ? ', out of range' : ''}`)
    .join('; ')

  return (
    <motion.section {...fadeSide(1)} role="group" aria-label={`Tyre pressures: ${spoken}`} className="flex flex-col items-center gap-3">
      <HudLabel>Tyres · bar</HudLabel>
      <div className="grid grid-cols-[auto_auto_auto] items-center gap-x-4" aria-hidden="true">
        <TyreValue bar={pressures[0]} />
        <svg viewBox="0 0 64 120" className="row-span-2 h-[130px] w-[70px] text-hud-cyan">
          <rect x="10" y="4" width="44" height="112" rx="12" className="fill-none stroke-current" strokeWidth="1.5" strokeOpacity="0.8" />
          <path d="M16 38 Q32 30 48 38" className="fill-none stroke-current" strokeOpacity="0.7" />
          <path d="M17 88 Q32 94 47 88" className="fill-none stroke-current" strokeOpacity="0.5" />
          {TYRE_RECTS.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width="7"
              height="20"
              rx="2"
              style={{ fill: toneVar(bad[i] ? 'amber' : 'green'), stroke: bad[i] ? '#fff' : 'none' }}
              strokeWidth="1.5"
            />
          ))}
        </svg>
        <TyreValue bar={pressures[1]} />
        <TyreValue bar={pressures[2]} />
        <TyreValue bar={pressures[3]} />
      </div>
      <div
        role="status"
        className={`flex items-center gap-1.5 text-sm font-bold tracking-[0.14em] ${TONE_TEXT[anyBad ? 'amber' : 'green']}`}
      >
        {anyBad ? <TriangleAlert size={18} /> : <Check size={18} />}
        {anyBad ? 'CHECK TYRES' : 'TYRES OK'}
      </div>
    </motion.section>
  )
}
