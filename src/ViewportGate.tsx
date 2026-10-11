import { useSyncExternalStore, type ReactNode } from 'react'
import { ArrowRight, Check, Maximize, Monitor, MoveHorizontal, MoveVertical, Smartphone, TriangleAlert } from 'lucide-react'
import { useReducedMotion } from './a11y/preferences'
import { MIN_VIEWPORT } from './config'

/** Viewport and screen sizes as one string, so useSyncExternalStore sees a stable, comparable snapshot. */
const read = () => `${window.innerWidth}x${window.innerHeight}x${window.screen.width}x${window.screen.height}`
const subscribe = (onChange: () => void) => {
  window.addEventListener('resize', onChange)
  document.addEventListener('fullscreenchange', onChange)
  return () => {
    window.removeEventListener('resize', onChange)
    document.removeEventListener('fullscreenchange', onChange)
  }
}

function useViewport() {
  const [w, h, sw, sh] = useSyncExternalStore(subscribe, read, () => '9999x9999x9999x9999').split('x').map(Number)
  return { w, h, screenW: sw, screenH: sh }
}

/**
 * Renders the app only when the viewport is at least MIN_VIEWPORT. Otherwise it renders nothing but the
 * message, so no 3D scene, timers or keyboard shortcuts run behind it. Resizing across the limit swaps live.
 */
export function ViewportGate({ children }: { children: ReactNode }) {
  const { w, h, screenW, screenH } = useViewport()
  if (w >= MIN_VIEWPORT.width && h >= MIN_VIEWPORT.height) return <>{children}</>
  return <TooSmall w={w} h={h} screenW={screenW} screenH={screenH} />
}

function Requirement({ icon: Icon, label, have, need }: { icon: typeof MoveHorizontal; label: string; have: number; need: number }) {
  const met = have >= need
  const pct = Math.min(100, Math.round((have / need) * 100))
  return (
    <li className="flex items-start gap-4">
      <Icon size={22} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-4 text-sm font-bold">
          <span className="tracking-[0.12em] uppercase">{label}</span>
          <span className="hud-num text-base whitespace-nowrap">
            {have} <span className="opacity-80">/ {need} px</span>
          </span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
          <div className={`h-full rounded-full ${met ? 'bg-hud-green' : 'bg-hud-amber'}`} style={{ width: `${pct}%` }} />
        </div>
        {/* Icon + words, not just colour, say whether the requirement is met. */}
        <p className={`mt-1.5 flex items-center gap-1.5 text-sm font-bold ${met ? 'text-hud-green' : 'text-hud-amber'}`}>
          {met ? <Check size={18} strokeWidth={2.6} aria-hidden="true" /> : <TriangleAlert size={18} strokeWidth={2.6} aria-hidden="true" />}
          {met ? 'Big enough' : `${need - have} px short`}
        </p>
      </div>
    </li>
  )
}

function TooSmall({ w, h, screenW, screenH }: { w: number; h: number; screenW: number; screenH: number }) {
  const reduced = useReducedMotion()
  // The screen itself may be big enough while the window (or browser zoom) is what is small.
  const screenOk = screenW >= MIN_VIEWPORT.width && screenH >= MIN_VIEWPORT.height
  const canFullscreen = screenOk && document.fullscreenEnabled && !document.fullscreenElement

  return (
    <main
      aria-labelledby="gate-title"
      className="hud-root font-hud flex min-h-screen w-screen items-center justify-center overflow-y-auto bg-black p-6 text-hud-cyan"
    >
      <div className="flex w-full max-w-[560px] flex-col items-center gap-8 text-center">
        {/* small device → arrow → big display */}
        <div className="flex items-end gap-5 text-hud-amber" aria-hidden="true">
          <Smartphone size={44} strokeWidth={1.8} />
          <ArrowRight size={34} strokeWidth={2.4} className={`mb-2 text-hud-cyan ${reduced ? '' : 'animate-gate-nudge'}`} />
          <Monitor size={92} strokeWidth={1.6} className="text-hud-cyan" />
        </div>

        <h1 id="gate-title" className="glow text-balance text-[1.7rem] leading-snug font-bold tracking-[0.04em]">
          Switch to a device with at least {MIN_VIEWPORT.width}&nbsp;×&nbsp;{MIN_VIEWPORT.height} resolution to view the experience.
        </h1>

        <section aria-label="Your screen compared with the minimum" className="w-full rounded-lg border-2 border-hud-cyan/50 bg-black/60 p-5 text-left">
          <p className="hud-label mb-4">Your window right now · <span className="whitespace-nowrap">{w} × {h}</span></p>
          <ul className="flex flex-col gap-5">
            <Requirement icon={MoveHorizontal} label="Width" have={w} need={MIN_VIEWPORT.width} />
            <Requirement icon={MoveVertical} label="Height" have={h} need={MIN_VIEWPORT.height} />
          </ul>
        </section>

        {screenOk && (
          <div className="flex flex-col items-center gap-3">
            <p className="max-w-[44ch] text-base">This screen is big enough. Make the window larger, zoom the page out (Ctrl&nbsp;−), or go full screen.</p>
            {canFullscreen && (
              <button
                type="button"
                onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
                className="pointer-events-auto flex min-h-12 items-center gap-2 rounded-lg bg-hud-cyan px-5 text-base font-bold tracking-[0.06em] text-black hover:brightness-110"
              >
                <Maximize size={20} aria-hidden="true" /> Enter full screen
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
