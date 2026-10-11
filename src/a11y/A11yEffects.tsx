import { useEffect } from 'react'
import { useHighContrast, useReducedMotion } from './preferences'

/** Mirrors the effective accessibility preferences onto <html> so plain CSS can react to them. */
export function A11yEffects() {
  const reducedMotion = useReducedMotion()
  const highContrast = useHighContrast()

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full'
  }, [reducedMotion])

  useEffect(() => {
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal'
  }, [highContrast])

  return null
}
