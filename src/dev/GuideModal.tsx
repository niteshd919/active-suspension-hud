import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, BookOpen, CircleCheck, CircleHelp, X } from 'lucide-react'
import { RIDE_HEIGHT_MM, WADE } from '../config'
import { TONE_TEXT, type Tone } from '../hud/primitives'
import { WADE_LIFT_MM } from '../sim/wade'
import { Section } from './controls'

const SHOW_ON_START_KEY = 'hud-guide-on-start'

/** A number bound to its unit with a no-break space, so a sentence never wraps between them. */
const mm = (n: number) => `${n} mm`

/** Storage may be blocked (private mode, policy); the guide then simply opens on every load. */
function readShowOnStart() {
  try {
    return localStorage.getItem(SHOW_ON_START_KEY) !== 'off'
  } catch {
    return true
  }
}
function writeShowOnStart(on: boolean) {
  try {
    localStorage.setItem(SHOW_ON_START_KEY, on ? 'on' : 'off')
  } catch {
    /* not persisted; the choice still holds for this page load */
  }
}

/** Module scope, so neither StrictMode's double effect nor the viewport gate remounting the app reopens it. */
let autoOpened = false

/**
 * "How to use" button (top left) and the guide it opens: how to drive the dev panel through a full run
 * and what each step should produce. A native modal <dialog>, so focus stays inside, Escape closes it and
 * the HUD behind is inert. It opens by itself on load until the user turns that off.
 */
export function GuideModal() {
  const dialog = useRef<HTMLDialogElement>(null)
  const openButton = useRef<HTMLButtonElement>(null)
  const pressedBackdrop = useRef(false)
  const [showOnStart, setShowOnStart] = useState(readShowOnStart)

  const open = () => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }
  const close = () => dialog.current?.close()

  useEffect(() => {
    if (autoOpened || !readShowOnStart()) return
    autoOpened = true
    open()
  }, [])

  return (
    <>
      <button
        ref={openButton}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        data-avoid-callouts
        className="absolute top-4 left-4 z-20 flex min-h-11 items-center gap-2 rounded-lg border border-white/30 bg-zinc-950/90 px-3 font-sans text-sm font-bold text-zinc-100 hover:bg-zinc-800"
      >
        <CircleHelp size={18} aria-hidden="true" /> How to use
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="guide-title"
        onClose={() => openButton.current?.focus()}
        // Close on a click that starts and ends on the backdrop, not on a text selection dragged out of the card.
        onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) close()
        }}
        className="m-auto max-h-[calc(100vh_-_4rem)] w-[1040px] max-w-[calc(100vw_-_4rem)] animate-guide-in flex-col overflow-hidden rounded-xl border border-white/20 bg-zinc-950 p-0 font-sans text-zinc-100 shadow-2xl open:flex backdrop:bg-black/75"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/15 px-6 py-4">
          <div className="flex items-center gap-3">
            <BookOpen size={26} className="shrink-0 text-cyan-300" aria-hidden="true" />
            <div>
              <h2 id="guide-title" className="text-lg font-bold">
                How to use the simulation
              </h2>
              <p className="text-sm text-zinc-400">Land Rover Defender 110 · predictive air-suspension head-up display</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close guide"
            className="grid size-10 shrink-0 place-items-center rounded-md text-zinc-200 hover:bg-white/15"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="max-w-[80ch] text-[15px] leading-relaxed text-zinc-200">
            Everything is driven from the <b>Dev control</b> panel on the right (<Kbd>D</Kbd> shows or hides it). The cyan
            button at its top steps through a drive: <b>Start drive</b> → <b>End drive</b> → <b>New session</b>. Follow the
            three phases below for a full run.
          </p>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_320px] gap-8">
            <Section title="Run the simulation">
              <ol className="flex flex-col gap-6">
                <Step n={1} title="Pre-drive" shortcut="1" action="The app starts here. Give the self-test about three seconds.">
                  <Result>
                    ECU, compressor, height sensors, LiDAR and tyres tick off one by one, then <Tag tone="green">SUSPENSION READY</Tag>
                  </Result>
                  <Result>
                    Tyre pressures show on the right. Switch on <Ctl>Low tyre pressure</Ctl> to see <Tag tone="amber">CHECK TYRES</Tag>
                  </Result>
                  <Result>The car waits at ACCESS height ({mm(RIDE_HEIGHT_MM.ACCESS)}) for easy entry.</Result>
                </Step>

                <Step n={2} title="On-ride" shortcut="2" action={<>Press <b>Start drive</b>, then pick a <Ctl>Ride scenario</Ctl>.</>}>
                  <Scenario name="Highway" shortcut="H">
                    The body rises to DRIVE height ({mm(RIDE_HEIGHT_MM.STANDARD)}) and the <Tag>ADAPTIVE DAMPING</Tag> trace shows
                    continuous micro-adjustments.
                  </Scenario>
                  <Scenario name="Rough" shortcut="R">
                    LiDAR scans the ground ahead. Obstacles are flagged as <Tag tone="amber">CAUTION</Tag> or{' '}
                    <Tag tone="red">HAZARD</Tag> with their distance and the height pre-set before the wheels reach them. Each
                    wheel's travel is shown while the body stays <Tag tone="green">CHASSIS LEVEL</Tag>. <Ctl>Terrain roughness</Ctl>{' '}
                    sets how rough.
                  </Scenario>
                  <Scenario name="Flood" shortcut="F">
                    Drag <Ctl>Water depth</Ctl> or switch on <Ctl>Wade sweep</Ctl> (<Kbd>W</Kbd>). At {mm(WADE.AUTO_RAISE_MM)} the body
                    lifts +{mm(WADE_LIFT_MM)} to WADE height ({mm(RIDE_HEIGHT_MM.WADE)}), and lowers again below {mm(WADE.AUTO_LOWER_MM)}.
                    At {mm(WADE.WARN_MM)}: <Tag tone="amber">WADE LIMIT NEAR</Tag>. Over {mm(WADE.LIMIT_MM)}:{' '}
                    <Tag tone="red">LIMIT EXCEEDED</Tag> with reversing advised.
                  </Scenario>
                </Step>

                <Step n={3} title="Post-drive" shortcut="3" action={<>Press <b>End drive</b>.</>}>
                  <Result>Trip summary: time, distance, maximum wade depth and predictive pre-sets.</Result>
                  <Result>
                    The body lowers to ACCESS height, then <Tag tone="green">EXIT READY</Tag>
                  </Result>
                  <Result>
                    A suspension health score with a card for each wheel. Set <Ctl>Suspension health (demo)</Ctl> to Leak RR or Worn
                    FL to see <Tag tone="amber">WATCH</Tag> and <Tag tone="red">SERVICE</Tag> advice.
                  </Result>
                  <Result>
                    <b>New session</b> starts again from pre-drive.
                  </Result>
                </Step>
              </ol>
            </Section>

            <div className="flex flex-col gap-6">
              <Section title="End result">
                <div className="rounded-lg border border-white/20 bg-white/5 p-4">
                  <p className="text-sm font-semibold">A successful run shows:</p>
                  <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                    <Outcome>The self-test passes with SUSPENSION READY.</Outcome>
                    <Outcome>
                      Ride height follows the situation: ACCESS {RIDE_HEIGHT_MM.ACCESS} → DRIVE {RIDE_HEIGHT_MM.STANDARD} → WADE{' '}
                      {RIDE_HEIGHT_MM.WADE} → back to ACCESS {mm(RIDE_HEIGHT_MM.ACCESS)}.
                    </Outcome>
                    <Outcome>Obstacles are flagged before the wheels reach them, and the chassis stays level.</Outcome>
                    <Outcome>
                      Wade alerts escalate at {mm(WADE.WARN_MM)} and {mm(WADE.LIMIT_MM)}.
                    </Outcome>
                    <Outcome>After parking: a trip summary, EXIT READY and a suspension health report with service advice.</Outcome>
                  </ul>
                </div>
              </Section>

              <Section title="Other controls">
                <dl className="flex flex-col gap-3 text-sm">
                  <Control name="Camera view">
                    Auto follows the scenario. Suspension fades the body to show the hardware. <Kbd>V</Kbd> cycles views.
                  </Control>
                  <Control name="Accessibility">
                    Colour-blind palette, high contrast, reduced motion, text size and audio alerts. Saved in this browser.
                  </Control>
                  <Control name="Live telemetry">Target and actual ride height, speed, wade status and the next hazard.</Control>
                </dl>
              </Section>

              <Section title="Keyboard shortcuts">
                <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
                  <Shortcut keys={['1', '2', '3']}>Phase</Shortcut>
                  <Shortcut keys={['H', 'R', 'F']}>Scenario</Shortcut>
                  <Shortcut keys={['W']}>Wade sweep</Shortcut>
                  <Shortcut keys={['V']}>Camera view</Shortcut>
                  <Shortcut keys={['D']}>Dev panel</Shortcut>
                  <Shortcut keys={['Esc']}>Close this guide</Shortcut>
                </dl>
                <p className="text-xs text-zinc-400">Turn single-key shortcuts off under Accessibility.</p>
              </Section>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-white/15 px-6 py-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={showOnStart}
              onChange={(e) => {
                setShowOnStart(e.target.checked)
                writeShowOnStart(e.target.checked)
              }}
              className="size-5 accent-cyan-300"
            />
            Show this guide when the app opens
          </label>
          <button
            type="button"
            onClick={close}
            className="flex min-h-12 items-center justify-center rounded-lg bg-cyan-300 px-6 text-base font-bold text-zinc-950 transition-colors hover:bg-cyan-200"
          >
            Got it
          </button>
        </footer>
      </dialog>
    </>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block min-w-6 rounded border border-white/30 bg-white/10 px-1.5 text-center font-sans text-xs leading-5 font-semibold text-zinc-100">
      {children}
    </kbd>
  )
}

/** A dev-panel control, named exactly as the panel labels it. */
function Ctl({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-cyan-200">{children}</span>
}

/** A HUD label quoted in the HUD's own font and colour (following the active palette), so it is easy to spot on screen. */
function Tag({ tone = 'cyan', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded border border-current/60 px-1.5 font-hud text-xs leading-5 font-bold tracking-[0.08em] whitespace-nowrap ${TONE_TEXT[tone]}`}
    >
      {children}
    </span>
  )
}

function Step({ n, title, shortcut, action, children }: { n: number; title: string; shortcut: string; action: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-cyan-300 text-sm font-bold text-zinc-950">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h4 className="flex items-center gap-2 text-base font-bold">
          {title} <Kbd>{shortcut}</Kbd>
        </h4>
        <p className="text-sm text-zinc-300">{action}</p>
        <ul aria-label="What you will see" className="flex flex-col gap-2 text-sm leading-relaxed">
          {children}
        </ul>
      </div>
    </li>
  )
}

function Result({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <ArrowRight size={16} className="mt-1 shrink-0 text-cyan-300" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

function Scenario({ name, shortcut, children }: { name: string; shortcut: string; children: ReactNode }) {
  return (
    <li className="rounded-lg border border-white/15 bg-white/5 px-3 py-2.5">
      <span className="flex items-center gap-2 font-bold">
        {name} <Kbd>{shortcut}</Kbd>
      </span>
      <p className="mt-1">{children}</p>
    </li>
  )
}

function Outcome({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <CircleCheck size={18} strokeWidth={2.4} className="mt-px shrink-0 text-hud-green" aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

function Control({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-zinc-100">{name}</dt>
      <dd className="text-zinc-400">{children}</dd>
    </div>
  )
}

function Shortcut({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <>
      <dt className="flex gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </dt>
      <dd className="text-zinc-300">{children}</dd>
    </>
  )
}
