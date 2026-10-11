import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { create } from 'zustand'
import { Activity, Check, HeartPulse, OctagonAlert, TriangleAlert, Wrench } from 'lucide-react'
import { useReducedMotion } from '../../a11y/preferences'
import { useSettingsStore } from '../../a11y/useSettingsStore'
import {
  CORNER_STATUS_WORD,
  STATUS_WORD,
  type CornerHealth,
  type HealthSnapshot,
  type HealthStatus,
} from '../../sim/health'
import { sim } from '../../sim/simState'
import { useTelemetryStore } from '../../store/useTelemetryStore'
import { HudLabel, TONE_BORDER, TONE_TEXT, fadeSide, toneVar, type Tone } from '../primitives'

/**
 * Whether the corner cards have been given up on because they cannot be placed without covering something
 * (large text, a narrow window, the dev panel open). The summary card then carries the per-corner numbers itself.
 */
const useHealthLayout = create<{ compact: boolean; setCompact: (compact: boolean) => void }>()((set) => ({
  compact: false,
  setCompact: (compact) => set({ compact }),
}))

const TONE: Record<HealthStatus, Tone> = { GOOD: 'green', WATCH: 'amber', SERVICE: 'red' }
const ICON = { GOOD: Check, WATCH: TriangleAlert, SERVICE: OctagonAlert } as const

/* ───────────────────────── summary card (top right) ───────────────────────── */

/** Quick comparison of remaining life; hidden from assistive tech because the corner cards give the detail. */
function LifeBars({ corners }: { corners: CornerHealth[] }) {
  return (
    <div aria-hidden="true">
      <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5">
        {corners.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <span className="w-7 text-sm font-bold">{c.short}</span>
            <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${c.lifePct}%`, background: toneVar(TONE[c.status]) }} />
            </span>
            <span className="hud-num w-[2.6rem] text-right text-sm">{Math.round(c.lifePct)}%</span>
            {/* The icon marks a corner needing attention, so the bar colour is never the only cue. */}
            <span className={`w-4 ${TONE_TEXT[TONE[c.status]]}`}>
              {c.status !== 'GOOD' && (c.status === 'WATCH' ? <TriangleAlert size={16} strokeWidth={2.6} /> : <OctagonAlert size={16} strokeWidth={2.6} />)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[13px] opacity-90">Bars: life left (weakest part).</p>
    </div>
  )
}

/** The same per-corner numbers as the cards, as a real table: used when there is no room for the cards. */
function CornerTable({ corners }: { corners: CornerHealth[] }) {
  const rows = [
    { label: 'Pressure bar', value: (c: CornerHealth) => c.pressureBar.toFixed(1), flag: (c: CornerHealth) => Math.abs(c.pressureBar - c.pressureTargetBar) > 0.4 },
    { label: 'Spring life %', value: (c: CornerHealth) => c.springLifePct.toFixed(0), flag: (c: CornerHealth) => c.springLifePct < 70 },
    { label: 'Damper life %', value: (c: CornerHealth) => c.damperLifePct.toFixed(0), flag: (c: CornerHealth) => c.damperLifePct < 70 },
    { label: 'Damper temp °C', value: (c: CornerHealth) => c.damperTempC.toFixed(0), flag: (c: CornerHealth) => c.peakTempC > 95 },
  ]
  return (
    <table className="mt-4 w-full border-collapse text-sm">
      <caption className="sr-only">Suspension details by corner</caption>
      <thead>
        <tr>
          <td />
          {corners.map((c) => {
            const Icon = ICON[c.status]
            return (
              <th key={c.id} scope="col" className={`pb-1.5 text-center font-bold ${TONE_TEXT[TONE[c.status]]}`}>
                <span className="flex items-center justify-center gap-1">
                  <Icon size={14} strokeWidth={2.6} aria-hidden="true" />
                  {c.short}
                </span>
                <span className="sr-only"> {CORNER_STATUS_WORD[c.status].toLowerCase()}</span>
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-white/15">
            <th scope="row" className="py-1 pr-2 text-left text-[13px] font-normal">
              {r.label}
            </th>
            {corners.map((c) => (
              <td key={c.id} className={`hud-num py-1 text-center ${r.flag(c) ? 'text-hud-amber' : ''}`}>
                {r.flag(c) && <TriangleAlert size={12} strokeWidth={2.6} className="mr-0.5 inline" aria-label="out of range" />}
                {r.value(c)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ScoreRing({ value, tone }: { value: number; tone: Tone }) {
  const r = 32
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 80 80" className="size-[84px] shrink-0" aria-hidden="true">
      <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-white/20" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        transform="rotate(-90 40 40)"
        style={{ stroke: toneVar(tone) }}
      />
      <text x="40" y="48" textAnchor="middle" className="hud-num text-[26px]" style={{ fill: toneVar(tone) }}>
        {value}
      </text>
    </svg>
  )
}

function StatusLine({ status, children }: { status: HealthStatus; children: string }) {
  const Icon = ICON[status]
  return (
    <span className={`flex items-center gap-1.5 ${TONE_TEXT[TONE[status]]}`}>
      <Icon size={18} strokeWidth={2.6} aria-hidden="true" />
      {children}
    </span>
  )
}

/**
 * Overall verdict for the whole system after a drive. The per-corner detail lives in the callouts next to
 * the hardware; the bars here are a quick comparison and are hidden from assistive tech to avoid repeating them.
 */
export function HealthPanel() {
  const health = useTelemetryStore((s) => s.live.health)
  const trip = useTelemetryStore((s) => s.trip)
  const compact = useHealthLayout((s) => s.compact)
  if (!health) return null

  const tone = TONE[health.status]
  const okCorners = health.corners.filter((c) => c.status === 'GOOD').length
  const stops = trip.bumpStops.reduce((a, b) => a + b, 0)
  const peakStroke = Math.max(...trip.peakStrokeMm)

  return (
    <motion.section
      {...fadeSide(1)}
      aria-label="Suspension health summary"
      className={`w-[340px] rounded-lg border-2 bg-black/60 p-4 ${TONE_BORDER[tone]}`}
    >
      <header className="flex items-center gap-2">
        <HeartPulse size={18} aria-hidden="true" />
        <HudLabel>Suspension health</HudLabel>
      </header>

      <div className="mt-3 flex items-center gap-4">
        <ScoreRing value={health.overall} tone={tone} />
        <div className="flex flex-col gap-1">
          <div className="glow text-xl font-bold tracking-[0.1em]">
            <StatusLine status={health.status}>{STATUS_WORD[health.status]}</StatusLine>
          </div>
          <span className="text-sm">
            {okCorners} of 4 corners within limits
          </span>
          <span className="sr-only">Overall score {health.overall} out of 100.</span>
        </div>
      </div>

      {compact ? <CornerTable corners={health.corners} /> : <LifeBars corners={health.corners} />}

      <ul className="mt-4 flex flex-col gap-1.5 border-t border-white/20 pt-3">
        {health.system.map((c) => {
          const Icon = ICON[c.status]
          return (
            <li key={c.label} className="flex items-center gap-2 text-sm">
              <Icon size={16} strokeWidth={2.6} className={TONE_TEXT[TONE[c.status]]} aria-hidden="true" />
              <span className="font-bold">{c.label}</span>
              <span className="ml-auto text-right opacity-95">{c.detail}</span>
            </li>
          )
        })}
        <li className="flex items-center gap-2 text-sm">
          <Activity size={16} strokeWidth={2.6} aria-hidden="true" />
          <span className="font-bold">Trip load</span>
          <span className="ml-auto text-right opacity-95">
            {stops} stop {stops === 1 ? 'hit' : 'hits'} · {Math.round(peakStroke)} mm peak
          </span>
        </li>
      </ul>

      <div className={`mt-3 flex gap-2 rounded-md border-2 bg-black/50 p-2.5 ${TONE_BORDER[tone]}`}>
        <Wrench size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <span className="hud-label">Advisory</span>
          {health.advisories.map((a) => (
            <p key={a} className="text-sm leading-snug">
              {a}
            </p>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

/* ───────────────────────── corner callouts (attached to the wheels) ───────────────────────── */

function CornerCard({ c }: { c: CornerHealth }) {
  const tone = TONE[c.status]
  const Icon = ICON[c.status]
  const rows = [
    { label: 'Air pressure', value: c.pressureBar.toFixed(1), unit: 'bar', flag: Math.abs(c.pressureBar - c.pressureTargetBar) > 0.4 },
    { label: 'Spring life', value: c.springLifePct.toFixed(0), unit: '%', flag: c.springLifePct < 70 },
    { label: 'Damper life', value: c.damperLifePct.toFixed(0), unit: '%', flag: c.damperLifePct < 70 },
    { label: 'Damper temp', value: c.damperTempC.toFixed(0), unit: '°C', flag: c.peakTempC > 95 },
  ]
  return (
    <section
      aria-label={`${c.name} suspension, ${CORNER_STATUS_WORD[c.status].toLowerCase()}`}
      className={`hud-callout w-[222px] rounded-lg border-2 bg-black/80 px-3 py-2 ${TONE_BORDER[tone]}`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold tracking-[0.1em] uppercase">{c.name}</h3>
        <span className={`flex items-center gap-1 text-sm font-bold ${TONE_TEXT[tone]}`}>
          <Icon size={16} strokeWidth={2.6} aria-hidden="true" />
          {CORNER_STATUS_WORD[c.status]}
        </span>
      </header>
      <dl className="mt-1.5 flex flex-col gap-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2 text-[13px]">
            <dt className="opacity-95">{r.label}</dt>
            <dd className={`hud-num flex items-center gap-1 text-base ${r.flag ? 'text-hud-amber' : ''}`}>
              {r.flag && <TriangleAlert size={14} strokeWidth={2.6} aria-label="out of range" />}
              {r.value}
              <span className="text-[12px] font-bold opacity-90">{r.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 border-t border-white/20 pt-1 text-[13px]">
        ≈ <span className="hud-num">{c.remainingKm.toLocaleString('en-GB')}</span> km of life left
      </p>
    </section>
  )
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const MARGIN = 16
const GAP = 14
const LEADER = { above: 72, below: 56 }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const overlaps = (a: Box, b: Box, pad: number) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y

/**
 * Choose a spot for each of the four cards. Slots are top-left, top-right, bottom-left, bottom-right and
 * `points` holds each slot's anchor. Every card tries positions around the place directly above (or below)
 * its anchor and takes the cheapest: distance from that ideal, plus a heavy penalty for overlapping any
 * other HUD instrument, a wheel, or a card already placed. A search (rather than nudging) can't paint itself
 * into a corner, and it always keeps a card on its own side of the anchor so the leader line stays simple.
 */
function placeCards(
  points: { x: number; y: number }[],
  sizes: { w: number; h: number }[],
  blocked: Box[],
  W: number,
  H: number,
): { boxes: Box[]; feasible: boolean } {
  const placed: Box[] = []
  let feasible = true
  points.forEach((p, slot) => {
    const { w, h } = sizes[slot]
    const above = slot < 2
    const ideal = { x: p.x - w / 2, y: above ? p.y - LEADER.above - h : p.y + LEADER.below }
    let best: Box = { x: clamp(ideal.x, MARGIN, Math.max(MARGIN, W - MARGIN - w)), y: clamp(ideal.y, MARGIN, Math.max(MARGIN, H - MARGIN - h)), w, h }
    let bestCost = Infinity
    for (let dy = -260; dy <= 260; dy += 20) {
      for (let dx = -380; dx <= 380; dx += 20) {
        const b: Box = { x: ideal.x + dx, y: ideal.y + dy, w, h }
        if (b.x < MARGIN || b.x + w > W - MARGIN || b.y < MARGIN || b.y + h > H - MARGIN) continue
        if (above ? b.y + h > p.y - 24 : b.y < p.y + 24) continue
        let cost = Math.hypot(dx, dy * 1.4)
        for (const o of blocked) if (overlaps(b, o, GAP)) cost += 5000
        for (const o of placed) if (overlaps(b, o, GAP)) cost += 5000
        if (cost < bestCost) {
          bestCost = cost
          best = b
        }
      }
    }
    if (bestCost >= 5000) feasible = false
    placed.push(best)
  })
  return { boxes: placed, feasible }
}

/**
 * Detail cards floating beside the four suspension corners after a drive. Each is joined to its wheel by a
 * leader line whose end follows the projected 3D anchor, so the numbers stay attached to the hardware they
 * describe. Choreography: the camera swings to its post-drive shot first; once it has come to rest and a
 * collision-free layout exists, the cards fade in. If there is still no room after the camera has settled
 * (large text, a narrow window), the cards give way to the table in the summary card.
 */
const SETTLED_PX_PER_S = 120 // total wheel-anchor speed on screen below which the camera counts as at rest
const SETTLE_WINDOW_MS = 120
const PATIENCE_MS = 5000 // show the cards anyway if the camera somehow never comes to rest

export function HealthCallouts({ health }: { health: HealthSnapshot }) {
  const cameraView = useTelemetryStore((s) => s.cameraView)
  const scale = useSettingsStore((s) => s.textScale)
  const reducedMotion = useReducedMotion()
  const [ready, setReady] = useState(false)
  const [shown, setShown] = useState(false)
  const cards = useRef<(HTMLDivElement | null)[]>([null, null, null, null])
  const leaders = useRef<(SVGGElement | null)[]>([null, null, null, null])

  // A new camera view restarts the whole placement process.
  useEffect(() => {
    setReady(false)
    setShown(false)
    const timer = window.setTimeout(() => setReady(true), reducedMotion ? 150 : 400)
    return () => window.clearTimeout(timer)
  }, [cameraView, reducedMotion])

  useEffect(() => {
    if (!ready) return
    let raf = 0
    const startedAt = performance.now()

    // Camera motion, measured over short windows: a duplicated or skipped frame must not look like a standstill.
    let windowStart = startedAt
    const reference = new Float32Array(8)
    let settled = false

    // Which corner goes in which slot (top-left, top-right, bottom-left, bottom-right). Re-derived continuously,
    // but a change is only committed once it has been stable for a few frames, so it cannot flicker mid-swing.
    let order: number[] | null = null
    let candidate = ''
    let candidateFrames = 0

    let glide: { x: number; y: number }[] | null = null
    let good = 0
    let bad = 0
    let revealed = false

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const els = cards.current
      if (els.some((el) => !el)) return
      const { w: W, h: H } = sim.canvas
      const anchors = sim.anchors
      const now = performance.now()

      if (now - windowStart >= SETTLE_WINDOW_MS) {
        let moved = 0
        for (let i = 0; i < 4; i++) {
          moved += Math.abs(anchors[i].x - reference[2 * i]) + Math.abs(anchors[i].y - reference[2 * i + 1])
          reference[2 * i] = anchors[i].x
          reference[2 * i + 1] = anchors[i].y
        }
        settled = moved / ((now - windowStart) / 1000) < SETTLED_PX_PER_S // the first window compares against zeros, so it reads as moving
        windowStart = now
      }

      // Two cards hang above the car, two below: whichever wheels sit highest on screen go above.
      const byY = [0, 1, 2, 3].sort((a, b) => anchors[a].y - anchors[b].y)
      const byX = (a: number, b: number) => anchors[a].x - anchors[b].x
      const wanted = [...byY.slice(0, 2).sort(byX), ...byY.slice(2).sort(byX)]
      const wantedKey = wanted.join()
      if (!order) {
        order = wanted
      } else if (wantedKey !== order.join()) {
        candidateFrames = wantedKey === candidate ? candidateFrames + 1 : 1
        candidate = wantedKey
        if (candidateFrames >= 12) {
          order = wanted
          candidateFrames = 0
        }
      } else {
        candidateFrames = 0
      }

      // Cards above the car hang from a point over the tyre, cards below it from a point under the tyre.
      const points = order.map((corner, slot) => (slot < 2 ? anchors[corner] : sim.anchorsBelow[corner]))
      const sizes = order.map((corner) => {
        const r = els[corner]!.getBoundingClientRect()
        return { w: r.width, h: r.height }
      })
      const blocked: Box[] = []
      document.querySelectorAll('[data-avoid-callouts]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) blocked.push({ x: r.left, y: r.top, w: r.width, h: r.height })
      })

      // The wheels themselves are off limits too: a card must never cover the hardware it describes.
      for (let i = 0; i < 4; i++) {
        const above = anchors[i]
        const below = sim.anchorsBelow[i]
        const d = Math.abs(below.y - above.y)
        blocked.push({ x: (above.x + below.x) / 2 - d / 2, y: Math.min(above.y, below.y), w: d, h: d })
      }

      const { boxes: targets, feasible } = placeCards(points, sizes, blocked, W, H)

      if (feasible) {
        bad = 0
        if (!revealed && (settled || now - startedAt > PATIENCE_MS)) {
          if (++good === 5) {
            revealed = true
            setShown(true)
          }
        } else {
          good = 0
        }
      } else {
        good = 0
        // Only a layout that stays impossible once the camera is at rest counts as "no room".
        bad = settled ? bad + 1 : 0
        if (bad === 30) useHealthLayout.getState().setCompact(true)
      }

      // Ease toward the target so a change of best spot reads as a glide, not a jump (instant under reduced motion).
      const ease = sim.reducedMotion ? 1 : 0.2
      const current = glide ?? targets.map((t) => ({ x: t.x, y: t.y }))
      glide = current
      const boxes = targets.map((t, slot) => {
        const c = current[slot]
        c.x += (t.x - c.x) * ease
        c.y += (t.y - c.y) * ease
        return { x: c.x, y: c.y, w: t.w, h: t.h }
      })
      order.forEach((corner, slot) => {
        const b = boxes[slot]
        const a = points[slot]
        els[corner]!.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px)`
        const g = leaders.current[corner]
        if (!g) return
        const fromBottom = a.y > b.y + b.h / 2
        const ax = clamp(a.x, b.x + 18, b.x + b.w - 18)
        const ay = fromBottom ? b.y + b.h : b.y
        const d = `M${ax.toFixed(1)},${ay.toFixed(1)} L${a.x.toFixed(1)},${a.y.toFixed(1)}`
        g.querySelectorAll('path').forEach((p) => p.setAttribute('d', d))
        const dot = g.querySelector('circle')
        dot?.setAttribute('cx', a.x.toFixed(1))
        dot?.setAttribute('cy', a.y.toFixed(1))
        g.style.display = (slot < 2 ? anchors[corner] : sim.anchorsBelow[corner]).visible ? '' : 'none'
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [ready])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: shown ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      role="group"
      aria-label="Suspension details by corner"
      className="pointer-events-none absolute inset-0"
      style={{ visibility: ready && shown ? 'visible' : 'hidden' }}
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {health.corners.map((c, i) => {
          const color = toneVar(TONE[c.status])
          return (
            <g key={c.id} ref={(el) => void (leaders.current[i] = el)}>
              <path stroke="#000" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.7" />
              <path stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle r="6" fill={color} stroke="#000" strokeWidth="2" />
            </g>
          )
        })}
      </svg>
      {health.corners.map((c, i) => (
        <div key={c.id} ref={(el) => void (cards.current[i] = el)} className="absolute top-0 left-0 will-change-transform">
          <div style={scale === 1 ? undefined : { zoom: scale }}>
            <CornerCard c={c} />
          </div>
        </div>
      ))}
    </motion.div>
  )
}

/** Mounts the callouts only once a health snapshot exists (it is published a moment after the drive ends). */
export function HealthCalloutsHost() {
  const health = useTelemetryStore((s) => s.live.health)
  const compact = useHealthLayout((s) => s.compact)
  const textScale = useSettingsStore((s) => s.textScale)
  const panelOpen = useTelemetryStore((s) => s.devPanelOpen)

  // Whenever the room changes (text size, dev panel), try the cards again; they step aside if they still do not fit.
  useEffect(() => {
    useHealthLayout.getState().setCompact(false)
  }, [textScale, panelOpen])
  useEffect(() => () => useHealthLayout.getState().setCompact(false), [])
  // A resized window may have made room again.
  useEffect(() => {
    const retry = () => useHealthLayout.getState().setCompact(false)
    window.addEventListener('resize', retry)
    return () => window.removeEventListener('resize', retry)
  }, [])

  return health && !compact ? <HealthCallouts health={health} /> : null
}
