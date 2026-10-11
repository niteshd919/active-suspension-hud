import { Color } from 'three'

export type PaletteId = 'standard' | 'cvd'
export type ColorKey = 'cyan' | 'green' | 'amber' | 'red' | 'dip' | 'marking'

/**
 * Semantic HUD colours. Meaning is never carried by colour alone (every state also has an icon,
 * label or shape), so these only reinforce it.
 *
 * `cvd` swaps the red/green axis, which deuteranopes and protanopes cannot separate, for a
 * blue → yellow → vermillion ramp (after Okabe & Ito) that stays distinguishable by hue *and*
 * luminance. Keep the `standard` values in sync with the @theme defaults in index.css.
 */
export const PALETTES: Record<PaletteId, Record<ColorKey, string>> = {
  standard: {
    cyan: '#22e5ff',
    green: '#3dff8f',
    amber: '#ffb020',
    red: '#ff3b30',
    dip: '#1a6dff',
    marking: '#e6fdff',
  },
  cvd: {
    cyan: '#5bc0ff',
    green: '#3ee8c0',
    amber: '#ffd23f',
    red: '#ff6a2b',
    dip: '#4a7dff',
    marking: '#ffffff',
  },
}

export const PALETTE_LABEL: Record<PaletteId, string> = {
  standard: 'Standard',
  cvd: 'Colour-blind safe',
}

/** Live 3D colours. Mutated in place by applyPalette(), so read them at use time, never cache the values. */
export const COLOR: Record<ColorKey, Color> = {
  cyan: new Color(),
  green: new Color(),
  amber: new Color(),
  red: new Color(),
  dip: new Color(),
  marking: new Color(),
}

const CSS_VARS: Partial<Record<ColorKey, string>> = {
  cyan: '--color-hud-cyan',
  green: '--color-hud-green',
  amber: '--color-hud-amber',
  red: '--color-hud-red',
}

export function applyPalette(id: PaletteId) {
  const palette = PALETTES[id]
  for (const key of Object.keys(palette) as ColorKey[]) COLOR[key].set(palette[key])

  const root = document.documentElement
  root.dataset.palette = id
  for (const [key, cssVar] of Object.entries(CSS_VARS) as [ColorKey, string][]) {
    root.style.setProperty(cssVar, palette[key])
  }
}
