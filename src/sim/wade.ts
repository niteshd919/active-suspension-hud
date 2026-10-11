import { RIDE_HEIGHT_MM, WADE } from '../config'

/**
 * Why the air suspension is doing what it is doing while wading, in words. The depth thresholds and
 * the ride-height targets come from the same config the simulation uses, so the explanation can never
 * drift from the behaviour.
 */

export type WadeStage = 'APPROACH' | 'RAISING' | 'RAISED' | 'MAX' | 'LIMIT' | 'LOWERING'

export interface WadeStory {
  stage: WadeStage
  /** Short banner headline. */
  title: string
  /** One sentence: the cause, and what the raise achieves. */
  reason: string
  /** Two to four words for the ride-height gauge. */
  chip: string
}

/** How far the body rises when the wade trigger fires. */
export const WADE_LIFT_MM = RIDE_HEIGHT_MM.WADE - RIDE_HEIGHT_MM.STANDARD

/** A number bound to its unit with a no-break space, so a sentence never wraps between them. */
const mm = (n: number) => `${n} mm`

const PURPOSE = 'to keep the air intake, axles and electronics above the water'

export function describeWade(input: { flood: boolean; depthMm: number; raised: boolean; heightMm: number }): WadeStory | null {
  const { flood, raised, heightMm } = input
  if (!flood) return null
  const depth = Math.round(input.depthMm)

  if (depth > WADE.LIMIT_MM) {
    return {
      stage: 'LIMIT',
      title: 'MAXIMUM HEIGHT',
      reason: `Already at maximum height (${mm(RIDE_HEIGHT_MM.WADE)}). More lift cannot offset water this deep.`,
      chip: 'MAX HEIGHT · REVERSE',
    }
  }
  if (depth >= WADE.WARN_MM) {
    return {
      stage: 'MAX',
      title: 'MAXIMUM HEIGHT',
      reason: `Already at maximum height. ${mm(WADE.LIMIT_MM - depth)} left before the ${mm(WADE.LIMIT_MM)} wading limit.`,
      chip: 'MAX HEIGHT · NO MORE LIFT',
    }
  }
  if (raised) {
    // Within 6 mm counts as arrived: the air spring settles asymptotically, so the last few mm take seconds.
    const rising = heightMm < RIDE_HEIGHT_MM.WADE - 6
    return rising
      ? {
          stage: 'RAISING',
          title: 'RAISING TO WADE HEIGHT',
          reason: `Water is ${mm(depth)} deep, past the ${mm(WADE.AUTO_RAISE_MM)} trigger. Lifting the body +${mm(WADE_LIFT_MM)} ${PURPOSE}.`,
          chip: `WATER ≥ ${WADE.AUTO_RAISE_MM} MM`,
        }
      : {
          stage: 'RAISED',
          title: `WADE HEIGHT +${WADE_LIFT_MM} MM`,
          reason: `Raised +${mm(WADE_LIFT_MM)} because water passed ${mm(WADE.AUTO_RAISE_MM)} (now ${mm(depth)}) ${PURPOSE}.`,
          chip: `WATER ≥ ${WADE.AUTO_RAISE_MM} MM`,
        }
  }
  if (heightMm > RIDE_HEIGHT_MM.STANDARD + 6) {
    return {
      stage: 'LOWERING',
      title: 'LOWERING TO DRIVE HEIGHT',
      reason: `Water is down to ${mm(depth)}, below ${mm(WADE.AUTO_LOWER_MM)}, so the extra height is no longer needed.`,
      chip: `WATER < ${WADE.AUTO_LOWER_MM} MM`,
    }
  }
  if (depth >= WADE.NOTICE_MM) {
    return {
      stage: 'APPROACH',
      title: 'WATER DETECTED',
      reason: `Water ahead. The body will rise at ${mm(WADE.AUTO_RAISE_MM)} (${mm(WADE.AUTO_RAISE_MM - depth)} to go) ${PURPOSE}.`,
      chip: `RISES AT ${WADE.AUTO_RAISE_MM} MM`,
    }
  }
  return null
}
