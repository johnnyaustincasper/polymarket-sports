import { describe, expect, it } from 'vitest'
import { resolveSignalCardMode, signalCardTapContract } from './card-collapse'

describe('resolveSignalCardMode', () => {
  it('keeps signal cards collapsed by default and expands only the selected card', () => {
    expect(resolveSignalCardMode({ signalId: 'og-10-points', expandedSignalId: null })).toEqual({ compact: true, expanded: false })
    expect(resolveSignalCardMode({ signalId: 'og-10-points', expandedSignalId: 'og-10-points' })).toEqual({ compact: false, expanded: true })
    expect(resolveSignalCardMode({ signalId: 'og-10-points', expandedSignalId: 'tatis-1-hit' })).toEqual({ compact: true, expanded: false })
  })

  it('uses an obvious tap affordance with a simple app-blue glow, not Slate shimmer chrome', () => {
    expect(signalCardTapContract.collapsedCta).toBe('Tap to open full signal')
    expect(signalCardTapContract.expandedCta).toBe('Tap to collapse')
    expect(signalCardTapContract.glowAnimationName).toBe('signal-card-blue-glow')
    expect('ringAnimationName' in signalCardTapContract).toBe(false)
    expect('shimmerAnimationName' in signalCardTapContract).toBe(false)
  })
})
