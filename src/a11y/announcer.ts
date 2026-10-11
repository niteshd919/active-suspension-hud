import { create } from 'zustand'
import { HEIGHT_NAME, RIDE_HEIGHT_MM, WADE, type HeightMode } from '../config'
import {
  TYRE_OK_BAR,
  selectTargetHeight,
  selectWadeStatus,
  useTelemetryStore,
  type TelemetryState,
} from '../store/useTelemetryStore'
import { describeHealth } from '../sim/health'
import { describeWade } from '../sim/wade'
import { playAlertTone, speak, stopSpeech } from './audio'
import { useSettingsStore } from './useSettingsStore'

export type Politeness = 'polite' | 'assertive'

interface AnnouncerState {
  polite: string
  assertive: string
}

export const useAnnouncer = create<AnnouncerState>()(() => ({ polite: '', assertive: '' }))

let seq = 0

/**
 * Push a message to the screen-reader live regions (and, if the user opted in, to speech).
 * Assertive messages interrupt: reserve them for safety-relevant alerts.
 */
export function announce(text: string, politeness: Politeness = 'polite') {
  // Alternate a trailing no-break space so an identical message is still re-announced.
  useAnnouncer.setState({ [politeness]: seq++ % 2 ? text : `${text} ` })
  if (politeness === 'assertive' && useSettingsStore.getState().audioAlerts) speak(text, true)
}

const audioOn = () => useSettingsStore.getState().audioAlerts

const CORNER = ['front left', 'front right', 'rear left', 'rear right']

export function describeHeight(mode: HeightMode): string {
  return `${HEIGHT_NAME[mode]}, ${RIDE_HEIGHT_MM[mode]} millimetres`
}

/** One-sentence description of the current phase and scenario (also used as the 3D view's description). */
export function describeState(s: TelemetryState): string {
  if (s.phase === 'PRE_DRIVE') return 'Pre-drive. Running system check. Vehicle at access height.'
  if (s.phase === 'POST_DRIVE') return 'Parked. Lowering to access height. Trip summary shown.'
  switch (s.rideMode) {
    case 'HIGHWAY':
      return 'Highway mode. Adaptive damping active.'
    case 'ROUGH':
      return 'Rough terrain. Predictive LiDAR suspension active.'
    case 'FLOOD':
      return 'Flood zone. Wade sensing active.'
  }
}

const lowTyres = (s: TelemetryState) =>
  s.tirePressureBar.flatMap((bar, i) => (bar < TYRE_OK_BAR[0] || bar > TYRE_OK_BAR[1] ? [i] : []))

/**
 * Turns telemetry transitions into announcements and (opt-in) tones. Returns an unsubscribe function.
 * Only discrete changes are announced, never the 12 Hz readouts, so assistive tech is not flooded.
 */
export function observeTelemetry(): () => void {
  let repeat: number | undefined
  let healthTimer: number | undefined
  let lastHazard = -Infinity

  const wadeStory = (st: TelemetryState) =>
    describeWade({
      flood: st.phase === 'ON_RIDE' && st.rideMode === 'FLOOD',
      depthMm: st.waterDepthMm,
      raised: st.wadeRaised,
      heightMm: st.live.rideHeightMm,
    })

  const stopRepeat = () => {
    window.clearInterval(repeat)
    repeat = undefined
  }

  const unsubscribe = useTelemetryStore.subscribe((s, prev) => {
    if (s.phase !== prev.phase || (s.phase === 'ON_RIDE' && s.rideMode !== prev.rideMode)) {
      announce(describeState(s))
    }

    const height = selectTargetHeight(s)
    const heightBefore = selectTargetHeight(prev)
    if (height !== heightBefore) {
      const wading = s.phase === 'ON_RIDE' && s.rideMode === 'FLOOD'
      const depth = Math.round(s.waterDepthMm)
      if (wading && height === 'WADE') {
        // Say *why*, not just that: the ride height change is automatic and the driver should know the cause.
        announce(`Water depth ${depth} millimetres. Raising to ${describeHeight('WADE')}, to keep the air intake, axles and electronics above the water.`)
      } else if (wading && heightBefore === 'WADE') {
        announce(`Water depth fell to ${depth} millimetres. Lowering to ${describeHeight('STANDARD')}; the extra height is no longer needed.`)
      } else {
        const verb = RIDE_HEIGHT_MM[height] > RIDE_HEIGHT_MM[heightBefore] ? 'Raising' : 'Lowering'
        announce(`${verb} to ${describeHeight(height)}.`)
      }
    }

    const story = wadeStory(s)
    if (story?.stage === 'APPROACH' && wadeStory(prev)?.stage !== 'APPROACH') announce(story.reason)

    // Once a drive ends, the health snapshot is published a moment later; read out the verdict.
    if (s.phase === 'POST_DRIVE' && prev.phase !== 'POST_DRIVE') {
      window.clearTimeout(healthTimer)
      healthTimer = window.setTimeout(() => {
        const health = useTelemetryStore.getState().live.health
        if (health) announce(describeHealth(health))
      }, 1800)
    } else if (s.phase !== 'POST_DRIVE' && prev.phase === 'POST_DRIVE') {
      window.clearTimeout(healthTimer)
    }

    const wade = selectWadeStatus(s)
    const wadeBefore = selectWadeStatus(prev)
    if (wade !== wadeBefore) {
      const depth = Math.round(s.waterDepthMm)
      if (wade === 'WARNING') {
        announce(`Caution. Water depth ${depth} millimetres. Wading limit of ${WADE.LIMIT_MM} is near.`, 'assertive')
        if (audioOn()) playAlertTone('caution')
      } else if (wade === 'EXCEEDED') {
        announce(`Warning. Wading limit of ${WADE.LIMIT_MM} millimetres exceeded. Reversing advised.`, 'assertive')
        if (audioOn()) playAlertTone('critical')
        stopRepeat()
        repeat = window.setInterval(() => audioOn() && playAlertTone('critical'), 2500)
      } else if (wadeBefore === 'EXCEEDED' || wadeBefore === 'WARNING') {
        announce(`Water depth ${depth} millimetres, back within the wading limit.`)
      }
      if (wade !== 'EXCEEDED') stopRepeat()
      if (wade === 'INACTIVE') stopSpeech()
    }

    if (s.live.hazard && !prev.live.hazard && performance.now() - lastHazard > 4000) {
      lastHazard = performance.now()
      const { distanceM, heightMm } = s.live.hazard
      announce(`Hazard ahead, ${Math.round(distanceM)} metres, ${heightMm} millimetres high. Suspension pre-setting.`)
    }

    const low = lowTyres(s)
    if (low.join() !== lowTyres(prev).join() && low.length > 0) {
      announce(
        `Tyre pressure outside range: ${low.map((i) => `${CORNER[i]} ${s.tirePressureBar[i].toFixed(1)} bar`).join(', ')}.`,
        'assertive',
      )
    }
  })

  return () => {
    unsubscribe()
    stopRepeat()
    window.clearTimeout(healthTimer)
  }
}
