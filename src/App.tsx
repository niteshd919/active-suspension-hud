import { useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import { A11yEffects } from './a11y/A11yEffects'
import { LiveRegion } from './a11y/LiveRegion'
import { useReducedMotion } from './a11y/preferences'
import { useSettingsStore } from './a11y/useSettingsStore'
import { DevControlPanel } from './dev/DevControlPanel'
import { HUDOverlay } from './hud/HUDOverlay'
import { HUDScene } from './scene/HUDScene'
import { useTelemetryStore, type CameraView } from './store/useTelemetryStore'

const CAMERA_VIEWS: CameraView[] = ['auto', 'side', 'front', 'rear', 'top', 'suspension']

/** Single-character shortcuts. They can be switched off (WCAG 2.1.4) and never fire while typing. */
function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (!useSettingsStore.getState().shortcuts) return
      if ((e.target as HTMLElement | null)?.closest('input[type="text"], input[type="number"], textarea, select, [contenteditable="true"]')) return
      const s = useTelemetryStore.getState()
      switch (e.key.toLowerCase()) {
        case '1':
          return s.setPhase('PRE_DRIVE')
        case '2':
          return s.setPhase('ON_RIDE')
        case '3':
          return s.setPhase('POST_DRIVE')
        case 'h':
          return s.setRideMode('HIGHWAY')
        case 'r':
          return s.setRideMode('ROUGH')
        case 'f':
          return s.setRideMode('FLOOD')
        case 'w':
          return s.setAutoWade(!s.autoWade)
        case 'd':
          return s.toggleDevPanel()
        case 'v':
          return s.setCameraView(CAMERA_VIEWS[(CAMERA_VIEWS.indexOf(s.cameraView) + 1) % CAMERA_VIEWS.length])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  useKeyboardShortcuts()
  const reducedMotion = useReducedMotion()
  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <A11yEffects />
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <main aria-label="Active suspension head-up display" className="absolute inset-0">
          <HUDScene />
          <HUDOverlay />
        </main>
        <DevControlPanel />
      </div>
      <LiveRegion />
    </MotionConfig>
  )
}
