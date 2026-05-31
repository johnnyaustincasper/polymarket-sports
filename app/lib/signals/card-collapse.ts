export const signalCardTapContract = {
  collapsedCta: 'Tap to open full signal',
  expandedCta: 'Tap to collapse',
  ringAnimationName: 'slate-main-feature-ring',
  shimmerAnimationName: 'slate-main-feature-shimmer',
} as const

export function resolveSignalCardMode({ signalId, expandedSignalId }: { signalId: string; expandedSignalId?: string | null }) {
  const expanded = Boolean(expandedSignalId && expandedSignalId === signalId)
  return { compact: !expanded, expanded }
}
