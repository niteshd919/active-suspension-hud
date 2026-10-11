import { createNoise2D } from 'simplex-noise'

/** Small seeded PRNG so the terrain is identical on every load. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const noise = createNoise2D(mulberry32(0x5eed))

/**
 * Unscaled terrain relief (m) at lateral position x and ground coordinate s.
 * Callers multiply by the current amplitude, so the LiDAR mesh can cache these values.
 */
export function terrainBase(x: number, s: number): number {
  const swell = noise(x * 0.05, s * 0.045) * 0.06 // long, gentle undulation
  const bumps = noise(x * 0.32 + 11.3, s * 0.38) * 0.07 // wheel-scale bumps and dips
  const grit = noise(x * 1.6 + 47.1, s * 1.4) * 0.012 // surface texture
  const r = noise(x * 0.42 + 93.7, s * 0.3 + 21.9)
  const rock = r > 0.45 ? ((r - 0.45) / 0.55) ** 2 * 0.32 : 0 // sparse, sharp obstacles
  return swell + bumps + grit + rock
}

export function terrainHeight(x: number, s: number, amplitude: number): number {
  return amplitude < 1e-4 ? 0 : amplitude * terrainBase(x, s)
}

/** Height under a tyre: the max across its contact patch, so it rolls over edges instead of dropping into them. */
export function contactHeight(x: number, s: number, amplitude: number): number {
  if (amplitude < 1e-4) return 0
  return amplitude * Math.max(terrainBase(x, s - 0.22), terrainBase(x, s), terrainBase(x, s + 0.22))
}
