import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Check, ChevronsDown, ChevronsUp, OctagonAlert, ScanLine, TriangleAlert, Undo2, Waves } from 'lucide-react'
import { useReducedMotion } from '../../a11y/preferences'
import { SUSPENSION, TERRAIN, WADE } from '../../config'
import { selectWadeStatus, useTelemetryStore, type Hazard } from '../../store/useTelemetryStore'
import { HudLabel, TONE_BORDER, TONE_TEXT, fadeUp, toneVar, wadeTone, type Tone } from '../primitives'
import { useWadeStory } from '../useWadeStory'
import type { WadeStage } from '../../sim/wade'

/* ───────────────────────── Highway ───────────────────────── */

const WAVE_W = 220
const WAVE_H = 44

function wavePath(t: number) {
  let d = ''
  for (let i = 0; i <= 64; i++) {
    const x = (i / 64) * WAVE_W
    const y = Math.sin(i * 0.42 + t * 5.5) * 0.5 + Math.sin(i * 0.17 - t * 2.9) * 0.35 + Math.sin(i * 1.3 + t * 11) * 0.12
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${(WAVE_H / 2 + y * WAVE_H * 0.3).toFixed(1)}`
  }
  return d
}

/** Faint trace of continuous micro-damping adjustments. Drawn outside React; a still trace under reduced motion. */
export function DampingWave() {
  const path = useRef<SVGPathElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced) {
      path.current?.setAttribute('d', wavePath(1.3))
      return
    }
    let raf = 0
    const draw = (ms: number) => {
      path.current?.setAttribute('d', wavePath(ms / 1000))
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  return (
    <motion.div {...fadeUp} className="flex flex-col items-end gap-1.5">
      <svg width={WAVE_W} height={WAVE_H} className="overflow-visible" aria-hidden="true">
        <line x1="0" x2={WAVE_W} y1={WAVE_H / 2} y2={WAVE_H / 2} stroke="currentColor" strokeOpacity="0.3" />
        <path ref={path} fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.9" />
      </svg>
      <div className="flex items-center gap-1.5">
        <Activity size={16} aria-hidden="true" />
        <HudLabel>Adaptive damping</HudLabel>
      </div>
    </motion.div>
  )
}

/* ───────────────────────── Rough terrain ───────────────────────── */

const BAR_H = 54
const MAX_TRAVEL_MM = SUSPENSION.BUMP_M * 1000
const CORNERS = [
  { x: 22, y: 43, name: 'front left' },
  { x: 190, y: 43, name: 'front right' },
  { x: 22, y: 127, name: 'rear left' },
  { x: 190, y: 127, name: 'rear right' },
]

function strainTone(mm: number): Tone {
  const strain = Math.abs(mm) / MAX_TRAVEL_MM
  return strain < 0.45 ? 'green' : strain < 0.75 ? 'amber' : 'red'
}

/** Top-down view: each wheel articulates independently while the chassis level reads 0.0°. Values are always printed. */
export function ArticulationPanel() {
  const travel = useTelemetryStore((s) => s.live.wheelTravelMm)
  const spoken = CORNERS.map((c, i) => `${c.name} ${travel[i]} millimetres`).join(', ')
  return (
    <motion.div {...fadeUp} className="flex flex-col items-center gap-1.5">
      <svg
        viewBox="0 0 220 180"
        className="h-[180px] w-[220px] text-hud-cyan"
        role="img"
        aria-label={`Wheel travel: ${spoken}. Chassis level.`}
      >
        <rect x="68" y="12" width="84" height="148" rx="18" className="fill-none stroke-current" strokeWidth="1.5" strokeOpacity="0.7" />
        {CORNERS.map((c, i) => {
          const v = Math.max(-1, Math.min(1, travel[i] / MAX_TRAVEL_MM))
          const half = BAR_H / 2
          const color = toneVar(strainTone(travel[i]))
          const wheelX = i % 2 === 0 ? 58 : 152
          return (
            <g key={c.name}>
              <rect x={wheelX} y={c.y - 14} width="10" height="28" rx="2" className="fill-current" fillOpacity="0.5" />
              <rect x={c.x - 5} y={c.y - half} width="10" height={BAR_H} className="fill-none stroke-current" strokeOpacity="0.5" />
              <line x1={c.x - 8} x2={c.x + 8} y1={c.y} y2={c.y} className="stroke-current" strokeWidth="1.5" strokeOpacity="0.8" />
              <motion.rect
                x={c.x - 5}
                width="10"
                style={{ fill: color }}
                animate={{ y: v > 0 ? c.y - v * half : c.y, height: Math.abs(v) * half }}
                transition={{ duration: 0.08, ease: 'linear' }}
              />
              <text x={c.x} y={c.y + half + 15} textAnchor="middle" style={{ fill: color }} className="hud-num text-[13px]">
                {travel[i] > 0 ? '+' : ''}
                {travel[i]}
              </text>
            </g>
          )
        })}
        {/* chassis spirit level: always centred */}
        <line x1="84" x2="136" y1="86" y2="86" style={{ stroke: toneVar('green') }} strokeWidth="2.5" />
        <circle cx="110" cy="86" r="5" style={{ fill: toneVar('green') }} />
        <text x="110" y="108" textAnchor="middle" style={{ fill: toneVar('green') }} className="hud-num text-[14px]">
          0.0°
        </text>
      </svg>
      <div className="flex items-center gap-1.5 text-hud-green" aria-hidden="true">
        <Check size={16} strokeWidth={2.6} />
        <HudLabel className="opacity-100!">Chassis level</HudLabel>
      </div>
    </motion.div>
  )
}

/** Hold the last hazard briefly so the callout doesn't flicker between closely spaced obstacles. */
function useStickyHazard(hold = 700): Hazard | null {
  const hazard = useTelemetryStore((s) => s.live.hazard)
  const [sticky, setSticky] = useState<Hazard | null>(hazard)
  useEffect(() => {
    if (hazard) {
      setSticky(hazard)
      return
    }
    const t = setTimeout(() => setSticky(null), hold)
    return () => clearTimeout(t)
  }, [hazard, hold])
  return hazard ?? sticky
}

/** Next obstacle: shape (triangle vs octagon), word and numbers all carry the severity, not just the colour. */
export function HazardCallout() {
  const hazard = useStickyHazard()
  const tone: Tone = hazard && hazard.heightMm > TERRAIN.RED_M * 1000 ? 'red' : 'amber'
  const Icon = tone === 'red' ? OctagonAlert : TriangleAlert
  return (
    <AnimatePresence mode="wait" initial={false}>
      {hazard ? (
        <motion.div
          key="hazard"
          {...fadeUp}
          aria-hidden="true"
          className={`flex items-center gap-3 rounded-md border-2 bg-black/55 px-4 py-2 transition-colors ${TONE_BORDER[tone]} ${TONE_TEXT[tone]}`}
        >
          <Icon size={30} strokeWidth={2.4} />
          <span className="flex flex-col leading-tight">
            <span className="text-[13px] font-bold tracking-[0.16em]">{tone === 'red' ? 'HAZARD' : 'CAUTION'}</span>
            <span className="glow hud-num text-3xl">
              {Math.round(hazard.distanceM)}
              <span className="ml-1 text-base">m</span>
            </span>
          </span>
          <span className="h-11 w-0.5 bg-current opacity-50" />
          <span className="flex flex-col leading-tight">
            <span className="hud-num text-xl">+{hazard.heightMm}</span>
            <span className="text-[13px] font-bold tracking-[0.1em]">MM · PRE-SET</span>
          </span>
        </motion.div>
      ) : (
        <motion.div key="clear" {...fadeUp} aria-hidden="true" className="flex items-center gap-2 py-2 text-hud-green">
          <ScanLine size={18} />
          <span className="text-sm font-bold tracking-[0.16em]">PATH CLEAR</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────────────────── Flooded zone ───────────────────────── */

const GAUGE_H = 190
const GAUGE_MARKS = [
  { mm: WADE.AUTO_RAISE_MM, label: 'RAISE', className: 'text-hud-cyan' },
  { mm: WADE.WARN_MM, label: '800', className: 'text-hud-amber' },
  { mm: WADE.LIMIT_MM, label: 'LIMIT', className: 'text-hud-red' },
]
const FILL_BG = { cyan: 'bg-hud-cyan/40', amber: 'bg-hud-amber/50', red: 'bg-hud-red/60' } as const

/** Diagonal hatching for caution, dense cross-hatching for exceeded: the zone is legible without colour. */
const HATCH = {
  WARNING: 'repeating-linear-gradient(45deg, transparent 0 5px, rgb(255 255 255 / 0.55) 5px 7px)',
  EXCEEDED:
    'repeating-linear-gradient(45deg, transparent 0 3px, rgb(255 255 255 / 0.7) 3px 5px), repeating-linear-gradient(-45deg, transparent 0 3px, rgb(255 255 255 / 0.7) 3px 5px)',
} as const

export function WadePanel() {
  const depth = useTelemetryStore((s) => s.waterDepthMm)
  const status = useTelemetryStore(selectWadeStatus)
  const raised = useTelemetryStore((s) => s.wadeRaised)
  const tone = wadeTone(status)
  const hatch = status === 'WARNING' || status === 'EXCEEDED' ? HATCH[status] : undefined

  return (
    <motion.div {...fadeUp} className="flex items-end gap-3">
      <div className={`flex flex-col items-end transition-colors ${TONE_TEXT[tone]}`} aria-hidden="true">
        <div className="mb-2 h-7">
          <AnimatePresence>
            {raised && (
              <motion.div {...fadeUp} className="flex items-center gap-1.5 text-hud-green">
                <ChevronsUp size={18} strokeWidth={2.6} />
                <span className="text-sm font-bold tracking-[0.14em]">WADE HEIGHT</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <HudLabel>Water depth</HudLabel>
        <span className="glow hud-num text-5xl leading-none">{Math.round(depth)}</span>
        <span className="mt-1 text-base font-bold opacity-90">/ {WADE.LIMIT_MM} mm</span>
      </div>
      <div
        role="meter"
        aria-label="Water depth"
        aria-valuemin={0}
        aria-valuemax={WADE.SENSOR_MAX_MM}
        aria-valuenow={Math.round(depth)}
        aria-valuetext={`${Math.round(depth)} millimetres. Wading limit ${WADE.LIMIT_MM} millimetres.`}
        className="relative w-[92px]"
        style={{ height: GAUGE_H }}
      >
        <div className={`relative h-full w-[28px] overflow-hidden rounded-sm border-2 border-hud-cyan/60 ${TONE_TEXT[tone]}`}>
          <div
            className={`absolute inset-x-0 bottom-0 border-t-[3px] border-current transition-[height] duration-150 ease-linear ${FILL_BG[tone]}`}
            style={{ height: `${(depth / WADE.SENSOR_MAX_MM) * 100}%` }}
          >
            {hatch && <div className="absolute inset-0" style={{ backgroundImage: hatch }} />}
          </div>
        </div>
        {GAUGE_MARKS.map((m) => (
          <div
            key={m.mm}
            className={`absolute left-[32px] flex translate-y-1/2 items-center gap-1 ${m.className}`}
            style={{ bottom: `${(m.mm / WADE.SENSOR_MAX_MM) * 100}%` }}
          >
            <div className="h-0.5 w-3 bg-current" />
            <span className="text-[13px] font-bold tracking-[0.08em]">{m.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

const NOTICE_ICON = { APPROACH: Waves, RAISING: ChevronsUp, RAISED: ChevronsUp, LOWERING: ChevronsDown } as const
const NOTICE_TONE: Record<keyof typeof NOTICE_ICON, Tone> = { APPROACH: 'cyan', RAISING: 'cyan', RAISED: 'green', LOWERING: 'cyan' }
const isNoticeStage = (stage: WadeStage): stage is keyof typeof NOTICE_ICON => stage in NOTICE_ICON

/**
 * Wade banners. Caution and limit-exceeded take over the slot when they apply; before that, an information
 * banner explains in plain words why the ride height is about to change, is changing, or has changed, with
 * the live depth in the sentence. Announced by the live region (see a11y/announcer), not by these elements.
 */
export function WadeAlert() {
  const status = useTelemetryStore(selectWadeStatus)
  const story = useWadeStory()
  const notice = story && isNoticeStage(story.stage) && status !== 'WARNING' && status !== 'EXCEEDED' ? story : null
  const NoticeIcon = notice && isNoticeStage(notice.stage) ? NOTICE_ICON[notice.stage] : Waves
  const noticeTone: Tone = notice && isNoticeStage(notice.stage) ? NOTICE_TONE[notice.stage] : 'cyan'
  return (
    <AnimatePresence mode="wait">
      {notice && (
        <motion.div
          key={`notice-${notice.stage}`}
          {...fadeUp}
          className={`flex max-w-[600px] items-start gap-3 rounded-md border-2 bg-black/70 px-4 py-2.5 ${TONE_BORDER[noticeTone]} ${TONE_TEXT[noticeTone]}`}
        >
          <NoticeIcon size={28} strokeWidth={2.4} className="mt-0.5 shrink-0" />
          <div>
            <div className="glow text-lg font-bold tracking-[0.1em]">{notice.title}</div>
            <p className="text-[15px] leading-snug">{notice.reason}</p>
          </div>
        </motion.div>
      )}
      {status === 'WARNING' && (
        <motion.div
          key="warn"
          {...fadeUp}
          className="glow flex items-center gap-3 rounded-md border-[3px] border-hud-amber bg-black/70 px-5 py-2.5 text-hud-amber"
        >
          <TriangleAlert size={30} strokeWidth={2.4} />
          <span className="text-2xl font-bold tracking-[0.12em]">WADE LIMIT NEAR</span>
        </motion.div>
      )}
      {status === 'EXCEEDED' && (
        <motion.div
          key="exceeded"
          {...fadeUp}
          className="glow flex items-center gap-4 rounded-md border-[3px] border-hud-red bg-black/75 px-6 py-3 text-hud-red"
        >
          <OctagonAlert size={42} strokeWidth={2.4} className="animate-hud-blink" />
          <div>
            <div className="text-3xl leading-tight font-bold tracking-[0.1em]">LIMIT EXCEEDED</div>
            <div className="flex items-center gap-2 text-lg font-bold tracking-[0.12em]">
              <Undo2 size={20} strokeWidth={2.6} />
              REVERSING ADVISED
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Peripheral edge glow: amber for caution, blinking red for limit exceeded (steady under reduced motion). */
export function AlertVignette() {
  const status = useTelemetryStore(selectWadeStatus)
  const tone: Tone | null = status === 'EXCEEDED' ? 'red' : status === 'WARNING' ? 'amber' : null
  return (
    <AnimatePresence>
      {tone && (
        <motion.div
          key={status}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0"
        >
          <div
            className={`absolute inset-0 ${status === 'EXCEEDED' ? 'animate-hud-blink' : ''}`}
            style={{ boxShadow: `inset 0 0 70px 0 color-mix(in srgb, ${toneVar(tone)} 35%, transparent)` }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
