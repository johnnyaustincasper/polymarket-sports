import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  it('keeps MLB signal cards separated into pitcher and hitter lanes without filler', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'AppClient.tsx'), 'utf8')

    expect(source).toContain('mlbSignalLane')
    expect(source).toContain('mlbPitcherSignals')
    expect(source).toContain('mlbHitterSignals')
    expect(source).toContain('Pitcher Signals')
    expect(source).toContain('Hitter Signals')
    expect(source).toContain('no filler cards added')
    expect(source).toContain('not forcing filler')
  })

  it('dedupes MLB opponent proof and labels positive matchup evidence clearly', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'components', 'signal-terminal', 'SignalTerminalCard.tsx'), 'utf8')

    expect(source).toContain('cleanUniqueRows')
    expect(source).toContain('Opponent proof')
    expect(source).not.toContain('Misread risk')
    expect(source).toContain('opponentGap')
    expect(source).toContain("? 'risk'")
  })

  it('puts opponent proof on regular compact MLB signal cards before misread-specific proof', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'components', 'signal-terminal', 'SignalTerminalCard.tsx'), 'utf8')

    expect(source).toContain('const opponentFitTitle = `Opponent proof')
    expect(source).toContain('...(mlbConviction.opponentProof || [])')
    expect(source).toContain('...(mlbConviction.matchupRating?.opponentProof || [])')
    expect(source).toContain('...(mlbConviction.misreadSignal?.opponentProof || [])')
    expect(source.indexOf('...(mlbConviction.opponentProof || [])')).toBeLessThan(source.indexOf('...(mlbConviction.misreadSignal?.opponentProof || [])'))
    expect(source).toContain('<OpponentFitPanel title={opponentFitTitle} bullets={opponentFitBullets} tone={opponentFitTone} compact />')
  })
})
