import { useMemo } from 'react'
import { describeWade, type WadeStory } from '../sim/wade'
import { useTelemetryStore } from '../store/useTelemetryStore'

/** Live, plain-language explanation of what the air suspension is doing about the water (null when dry or not wading). */
export function useWadeStory(): WadeStory | null {
  const flood = useTelemetryStore((s) => s.phase === 'ON_RIDE' && s.rideMode === 'FLOOD')
  const depthMm = useTelemetryStore((s) => s.waterDepthMm)
  const raised = useTelemetryStore((s) => s.wadeRaised)
  const heightMm = useTelemetryStore((s) => s.live.rideHeightMm)
  return useMemo(() => describeWade({ flood, depthMm, raised, heightMm }), [flood, depthMm, raised, heightMm])
}
