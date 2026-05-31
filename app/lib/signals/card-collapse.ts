export const signalCardTapContract = {
  collapsedCta: 'Tap to open full signal',
  expandedCta: 'Tap to collapse',
} as const

export function resolveSignalCardMode({ signalId, expandedSignalId }: { signalId: string; expandedSignalId?: string | null }) {
  const expanded = Boolean(expandedSignalId && expandedSignalId === signalId)
  return { compact: !expanded, expanded }
}
