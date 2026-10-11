import { useSyncExternalStore } from 'react'
import { useSettingsStore } from './useSettingsStore'

const query = (q: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null

const reducedMotionQuery = query('(prefers-reduced-motion: reduce)')
const highContrastQuery = query('(prefers-contrast: more)')

function useMediaQuery(mql: MediaQueryList | null): boolean {
  return useSyncExternalStore(
    (onChange) => {
      mql?.addEventListener('change', onChange)
      return () => mql?.removeEventListener('change', onChange)
    },
    () => mql?.matches ?? false,
    () => false,
  )
}

/** Effective values (explicit user choice, else the OS setting). Safe to call outside React, e.g. in useFrame. */
export const isReducedMotion = () => useSettingsStore.getState().reduceMotion ?? reducedMotionQuery?.matches ?? false
export const isHighContrast = () => useSettingsStore.getState().highContrast ?? highContrastQuery?.matches ?? false

export function useReducedMotion(): boolean {
  const choice = useSettingsStore((s) => s.reduceMotion)
  const system = useMediaQuery(reducedMotionQuery)
  return choice ?? system
}

export function useHighContrast(): boolean {
  const choice = useSettingsStore((s) => s.highContrast)
  const system = useMediaQuery(highContrastQuery)
  return choice ?? system
}
