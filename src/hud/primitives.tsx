import type { ReactNode } from 'react'
import { useSettingsStore } from '../a11y/useSettingsStore'
import type { WadeStatus } from '../store/useTelemetryStore'

export type Tone = 'cyan' | 'green' | 'amber' | 'red'

export const TONE_TEXT: Record<Tone, string> = {
  cyan: 'text-hud-cyan',
  green: 'text-hud-green',
  amber: 'text-hud-amber',
  red: 'text-hud-red',
}

export const TONE_BORDER: Record<Tone, string> = {
  cyan: 'border-hud-cyan/60',
  green: 'border-hud-green/60',
  amber: 'border-hud-amber',
  red: 'border-hud-red',
}

/** CSS colour for inline SVG fills, so the active palette (including colour-blind safe) applies. */
export const toneVar = (tone: Tone) => `var(--color-hud-${tone})`

export function wadeTone(status: WadeStatus): Exclude<Tone, 'green'> {
  return status === 'EXCEEDED' ? 'red' : status === 'WARNING' ? 'amber' : 'cyan'
}

/** Shared enter/exit motion: short and calm, never distracting at a glance. */
export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: 'easeOut' },
} as const

export const fadeSide = (dir: 1 | -1) =>
  ({
    initial: { opacity: 0, x: 24 * dir },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 24 * dir },
    transition: { duration: 0.45, ease: 'easeOut' },
  }) as const

export function HudLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`hud-label ${className}`}>{children}</span>
}

/**
 * A positioned region of the HUD. The user's text-size setting scales the whole zone (type, icons and
 * SVG instruments together) so nothing falls out of proportion at 125% or 150%. Zones are also what
 * floating callouts steer around (data-avoid-callouts).
 */
export function Zone({ className = '', children }: { className?: string; children: ReactNode }) {
  const scale = useSettingsStore((s) => s.textScale)
  return (
    <div className={`hud-zone ${className}`} data-avoid-callouts style={scale === 1 ? undefined : { zoom: scale }}>
      {children}
    </div>
  )
}
