import { describe, expect, it } from 'vitest'
import { resolveSignalCardMode } from './card-collapse'

describe('resolveSignalCardMode', () => {
  it('keeps signal cards collapsed by default and expands only the selected card', () => {
    expect(resolveSignalCardMode({ signalId: 'og-10-points', expandedSignalId: null })).toEqual({ compact: true, expanded: false })
    expect(resolveSignalCardMode({ signalId: 'og-10-points', expandedSignalId: 'og-10-points' })).toEqual({ compact: false, expanded: true })
    expect(resolveSignalCardMode({ signalId: 'og-10-points', expandedSignalId: 'tatis-1-hit' })).toEqual({ compact: true, expanded: false })
  })
})
