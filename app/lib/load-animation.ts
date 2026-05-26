export const loadInAnimationContract = {
  keyframeName: 'dominoFadeIn',
  className: 'load-in-domino',
  defaultDurationMs: 860,
  defaultDelayStepMs: 80,
  defaultMaxDelayMs: 560,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const

export function getLoadInAnimationStyle(
  index = 0,
  options: {
    durationMs?: number
    delayStepMs?: number
    maxDelayMs?: number
  } = {},
): { opacity: number; animation: string; animationDelay: string } {
  const durationMs = options.durationMs ?? loadInAnimationContract.defaultDurationMs
  const delayStepMs = options.delayStepMs ?? loadInAnimationContract.defaultDelayStepMs
  const maxDelayMs = options.maxDelayMs ?? loadInAnimationContract.defaultMaxDelayMs
  const delayMs = Math.min(Math.max(index, 0) * delayStepMs, maxDelayMs)

  return {
    opacity: 0,
    animation: `${loadInAnimationContract.keyframeName} ${durationMs}ms ${loadInAnimationContract.easing} forwards`,
    animationDelay: `${delayMs}ms`,
  }
}
