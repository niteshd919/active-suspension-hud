import { useEffect } from 'react'
import { selectTargetHeight, useTelemetryStore } from '../store/useTelemetryStore'
import { announce, describeHeight, describeState, observeTelemetry, useAnnouncer } from './announcer'

/**
 * Screen-reader output for a display that is otherwise purely visual. Polite for state changes,
 * assertive (role="alert") for wading and tyre warnings. Visually hidden, never removed from the tree.
 */
export function LiveRegion() {
  const polite = useAnnouncer((s) => s.polite)
  const assertive = useAnnouncer((s) => s.assertive)

  useEffect(() => {
    const stop = observeTelemetry()
    // Live regions only announce *changes*, so give the initial state a moment after load.
    const timer = window.setTimeout(() => announce(describeState(useTelemetryStore.getState())), 800)
    return () => {
      stop()
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div className="sr-only">
      <div role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </div>
  )
}

/** Text alternative for the 3D canvas, updated only when the scene meaningfully changes. */
export function useSceneDescription(): string {
  const state = useTelemetryStore((s) => describeState(s))
  const height = useTelemetryStore((s) => describeHeight(selectTargetHeight(s)))
  return `Three-dimensional view of a Land Rover Defender 110 at ${height}. ${state}`
}
