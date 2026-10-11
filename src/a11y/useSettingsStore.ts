import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyPalette, type PaletteId } from '../theme/palette'

export type TextScale = 1 | 1.25 | 1.5

export interface SettingsValues {
  palette: PaletteId
  /** null = follow the operating-system preference (prefers-contrast: more). */
  highContrast: boolean | null
  /** null = follow the operating-system preference (prefers-reduced-motion). */
  reduceMotion: boolean | null
  textScale: TextScale
  /** Spoken alerts and tones for caution / critical wade states. Off until the user opts in. */
  audioAlerts: boolean
  /** Single-character shortcuts (WCAG 2.1.4): can be switched off so they never fire by accident. */
  shortcuts: boolean
}

export const DEFAULT_SETTINGS: SettingsValues = {
  palette: 'standard',
  highContrast: null,
  reduceMotion: null,
  textScale: 1,
  audioAlerts: false,
  shortcuts: true,
}

export interface SettingsState extends SettingsValues {
  update: (patch: Partial<SettingsValues>) => void
  reset: () => void
}

/** Persisted to localStorage; if storage is blocked zustand falls back to in-memory state. */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'hud-accessibility',
      version: 1,
      partialize: (s): SettingsValues => ({
        palette: s.palette,
        highContrast: s.highContrast,
        reduceMotion: s.reduceMotion,
        textScale: s.textScale,
        audioAlerts: s.audioAlerts,
        shortcuts: s.shortcuts,
      }),
    },
  ),
)

/**
 * Apply the persisted palette before first paint and keep it in sync. This runs synchronously inside
 * the store update, ahead of React re-rendering, so 3D materials rebuilt on the change already see
 * the new colours.
 */
export function initTheme() {
  applyPalette(useSettingsStore.getState().palette)
  useSettingsStore.subscribe((state, prev) => {
    if (state.palette !== prev.palette) applyPalette(state.palette)
  })
}
