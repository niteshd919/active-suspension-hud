import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, RotateCcw, Settings2, Square, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { playAlertTone, speak, stopSpeech } from '../a11y/audio'
import { useHighContrast, useReducedMotion } from '../a11y/preferences'
import { useSettingsStore, type TextScale } from '../a11y/useSettingsStore'
import { DEV_PANEL_WIDTH, HEIGHT_LABEL, WADE } from '../config'
import {
  TYRE_OK_BAR,
  selectTargetHeight,
  selectWadeStatus,
  useTelemetryStore,
  type CameraView,
  type Phase,
  type RideMode,
  type SuspensionFault,
} from '../store/useTelemetryStore'
import { Readout, Section, Segmented, Slider, Switch } from './controls'

const PHASES = [
  { id: 'PRE_DRIVE', label: 'Pre-drive', hint: '1' },
  { id: 'ON_RIDE', label: 'On-ride', hint: '2' },
  { id: 'POST_DRIVE', label: 'Post-drive', hint: '3' },
] satisfies { id: Phase; label: string; hint: string }[]

const MODES = [
  { id: 'HIGHWAY', label: 'Highway', hint: 'H' },
  { id: 'ROUGH', label: 'Rough', hint: 'R' },
  { id: 'FLOOD', label: 'Flood', hint: 'F' },
] satisfies { id: RideMode; label: string; hint: string }[]

const VIEWS = [
  { id: 'auto', label: 'Auto' },
  { id: 'side', label: 'Side' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'top', label: 'Top' },
  { id: 'suspension', label: 'Suspension' },
] satisfies { id: CameraView; label: string }[]

const FAULTS = [
  { id: 'NONE', label: 'Healthy' },
  { id: 'LEAK_RR', label: 'Leak RR' },
  { id: 'WORN_FL', label: 'Worn FL' },
] satisfies { id: SuspensionFault; label: string }[]

const TEXT_SIZES = [
  { id: 1, label: '100%' },
  { id: 1.25, label: '125%' },
  { id: 1.5, label: '150%' },
] satisfies { id: TextScale; label: string }[]

const WATER_MARKS = [
  { value: WADE.AUTO_RAISE_MM, label: '500', className: 'text-cyan-300' },
  { value: WADE.WARN_MM, label: '800', className: 'text-amber-300' },
  { value: WADE.LIMIT_MM, label: '900', className: 'text-red-300' },
]

const PRIMARY_ACTION = {
  PRE_DRIVE: { label: 'Start drive', icon: Play, next: 'ON_RIDE' },
  ON_RIDE: { label: 'End drive', icon: Square, next: 'POST_DRIVE' },
  POST_DRIVE: { label: 'New session', icon: RotateCcw, next: 'PRE_DRIVE' },
} as const

/**
 * Developer-only controls plus the accessibility settings. Deliberately styled unlike the HUD so it
 * never reads as part of it, and built from native inputs so keyboard and screen-reader use work.
 */
export function DevControlPanel() {
  const s = useTelemetryStore(
    useShallow((st) => ({
      open: st.devPanelOpen,
      phase: st.phase,
      rideMode: st.rideMode,
      cameraView: st.cameraView,
      fault: st.suspensionFault,
      roughness: st.roughness,
      water: st.waterDepthMm,
      autoWade: st.autoWade,
      lowTyre: st.tirePressureBar[0] < TYRE_OK_BAR[0],
      targetHeight: selectTargetHeight(st),
      wadeStatus: selectWadeStatus(st),
      rideHeight: st.live.rideHeightMm,
      speed: st.live.speedKmh,
      hazard: st.live.hazard,
    })),
  )
  const prefs = useSettingsStore(
    useShallow((st) => ({
      palette: st.palette,
      textScale: st.textScale,
      audioAlerts: st.audioAlerts,
      shortcuts: st.shortcuts,
      contrastChoice: st.highContrast,
      motionChoice: st.reduceMotion,
    })),
  )
  const updateSettings = useSettingsStore((st) => st.update)
  const resetSettings = useSettingsStore((st) => st.reset)
  const highContrast = useHighContrast()
  const reducedMotion = useReducedMotion()
  const actions = useTelemetryStore.getState()
  const primary = PRIMARY_ACTION[s.phase]
  const PrimaryIcon = primary.icon

  // When the control you were using disappears, keyboard focus must land somewhere sensible.
  const showButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const moveFocusTo = useRef<'show' | 'panel' | null>(null)
  useEffect(() => {
    if (moveFocusTo.current === 'show') showButton.current?.focus()
    if (moveFocusTo.current === 'panel') heading.current?.focus()
    moveFocusTo.current = null
  }, [s.open])
  const hidePanel = () => {
    moveFocusTo.current = 'show'
    actions.toggleDevPanel()
  }
  const showPanel = () => {
    moveFocusTo.current = 'panel'
    actions.toggleDevPanel()
  }

  const toggleAudio = (on: boolean) => {
    updateSettings({ audioAlerts: on })
    if (on) {
      // The click is the user gesture browsers require before audio may start; confirm so they can verify it works.
      playAlertTone('caution')
      speak('Audio alerts on')
    } else {
      stopSpeech()
    }
  }

  return (
    <AnimatePresence initial={false}>
      {s.open ? (
        <motion.aside
          key="panel"
          aria-label="Developer controls"
          initial={{ x: DEV_PANEL_WIDTH + 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: DEV_PANEL_WIDTH + 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          style={{ width: DEV_PANEL_WIDTH }}
          className="absolute top-4 right-4 bottom-4 z-20 flex flex-col gap-4 overflow-y-auto rounded-xl border border-white/20 bg-zinc-950/95 p-4 font-sans text-zinc-100 shadow-2xl backdrop-blur"
        >
          <header className="flex items-center justify-between gap-2">
            <h2 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-sm font-bold tracking-[0.14em] uppercase outline-none">
              <Settings2 size={18} aria-hidden="true" /> Dev control
            </h2>
            <button
              type="button"
              onClick={hidePanel}
              aria-label="Hide developer panel (shortcut D)"
              className="grid size-10 place-items-center rounded-md text-zinc-200 hover:bg-white/15"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          <button
            type="button"
            onClick={() => actions.setPhase(primary.next)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-cyan-300 text-base font-bold text-zinc-950 transition-colors hover:bg-cyan-200"
          >
            <PrimaryIcon size={18} aria-hidden="true" /> {primary.label}
          </button>

          <Section title="Lifecycle phase">
            <Segmented label="Lifecycle phase" options={PHASES} value={s.phase} onChange={actions.setPhase} />
          </Section>

          <Section title="Ride scenario">
            <Segmented
              label="Ride scenario"
              options={MODES}
              value={s.phase === 'ON_RIDE' ? s.rideMode : null}
              onChange={actions.setRideMode}
            />
            <Slider
              label="Terrain roughness"
              value={s.roughness}
              display={`${Math.round(s.roughness * 100)}%`}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => {
                if (s.phase !== 'ON_RIDE' || s.rideMode !== 'ROUGH') actions.setRideMode('ROUGH')
                actions.setRoughness(v)
              }}
            />
            <Slider
              label="Water depth"
              value={s.water}
              display={`${Math.round(s.water)} mm`}
              valueText={`${Math.round(s.water)} millimetres`}
              min={0}
              max={WADE.SENSOR_MAX_MM}
              step={10}
              marks={WATER_MARKS}
              onChange={(v) => {
                if (s.phase !== 'ON_RIDE' || s.rideMode !== 'FLOOD') actions.setRideMode('FLOOD')
                actions.setAutoWade(false)
                actions.setWaterDepth(v)
              }}
            />
            <Switch
              label="Wade sweep 0 → 1000 mm"
              hint="Shortcut: W"
              checked={s.autoWade}
              onChange={(on) => actions.setAutoWade(on)}
            />
            <Switch
              label="Low tyre pressure"
              hint="Demo: shows the warning cues (pre-drive)"
              checked={s.lowTyre}
              onChange={(on) => actions.setLowTyre(on)}
            />
          </Section>

          <Section title="Camera view">
            <Segmented
              label="Camera view"
              options={VIEWS}
              value={s.cameraView}
              columns={3}
              onChange={actions.setCameraView}
            />
            <p className="text-xs text-zinc-400">V cycles views. Suspension fades the body to show the hardware.</p>
          </Section>

          <Section title="Suspension health (demo)">
            <Segmented label="Suspension condition" options={FAULTS} value={s.fault} onChange={actions.setSuspensionFault} />
            <p className="text-xs text-zinc-400">Shown in post-drive. Leak RR drops that spring's pressure; Worn FL ages that damper.</p>
          </Section>

          <Section title="Accessibility">
            <Switch
              label="Colour-blind safe palette"
              hint="Blue · yellow · orange instead of green · amber · red"
              checked={prefs.palette === 'cvd'}
              onChange={(on) => updateSettings({ palette: on ? 'cvd' : 'standard' })}
            />
            <Switch
              label="High contrast"
              hint={prefs.contrastChoice === null ? 'Following your system setting' : 'Solid plates, full-strength labels'}
              checked={highContrast}
              onChange={(on) => updateSettings({ highContrast: on })}
            />
            <Switch
              label="Reduce motion"
              hint={prefs.motionChoice === null ? 'Following your system setting' : 'No flashing, drifting or sweeping'}
              checked={reducedMotion}
              onChange={(on) => updateSettings({ reduceMotion: on })}
            />
            <div className="flex flex-col gap-1.5 px-1">
              <span className="text-sm font-semibold">Text size</span>
              <Segmented
                label="Text size"
                options={TEXT_SIZES}
                value={prefs.textScale}
                onChange={(textScale) => updateSettings({ textScale })}
              />
            </div>
            <Switch
              label="Audio alerts"
              hint="Tones and spoken wade and tyre warnings"
              checked={prefs.audioAlerts}
              onChange={toggleAudio}
            />
            <Switch
              label="Single-key shortcuts"
              hint="1 2 3 · H R F · W · D · V"
              checked={prefs.shortcuts}
              onChange={(on) => updateSettings({ shortcuts: on })}
            />
            <button
              type="button"
              onClick={resetSettings}
              className="min-h-11 rounded-md border border-white/25 text-sm font-semibold text-zinc-100 hover:bg-white/10"
            >
              Reset accessibility settings
            </button>
          </Section>

          <Section title="Live telemetry">
            <dl className="flex flex-col gap-1.5">
              <Readout label="Target height" value={HEIGHT_LABEL[s.targetHeight]} />
              <Readout label="Ride height" value={`${s.rideHeight} mm`} />
              <Readout label="Speed" value={`${s.speed} km/h`} />
              <Readout
                label="Wade status"
                value={s.wadeStatus}
                className={s.wadeStatus === 'EXCEEDED' ? 'text-red-300' : s.wadeStatus === 'WARNING' ? 'text-amber-300' : ''}
              />
              <Readout
                label="Next hazard"
                value={s.hazard ? `${s.hazard.distanceM.toFixed(1)} m · ${s.hazard.heightMm} mm` : '—'}
              />
            </dl>
          </Section>
        </motion.aside>
      ) : (
        <motion.button
          key="tab"
          ref={showButton}
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={showPanel}
          aria-label="Dev panel: show (shortcut D)"
          className="absolute top-4 right-4 z-20 flex min-h-11 items-center gap-2 rounded-lg border border-white/30 bg-zinc-950/90 px-3 font-sans text-sm font-bold text-zinc-100 hover:bg-zinc-800"
        >
          <Settings2 size={18} aria-hidden="true" /> Dev panel
        </motion.button>
      )}
    </AnimatePresence>
  )
}
