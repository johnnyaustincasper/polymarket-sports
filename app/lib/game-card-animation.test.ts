import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { animatedGameCardFrame, hasAnimatedGameCardFrame } from './game-card-animation'

describe('animatedGameCardFrame', () => {
  it('applies the premium CTA frame to game cards for every supported sport', () => {
    expect(animatedGameCardFrame.sports).toEqual(['nba', 'mlb', 'nfl', 'ufc'])
    for (const sport of animatedGameCardFrame.sports) {
      expect(hasAnimatedGameCardFrame(sport)).toBe(true)
    }
  })

  it('keeps the motion as a frame treatment instead of changing card content layout', () => {
    expect(animatedGameCardFrame.className).toBe('animated-game-card-frame')
    expect(animatedGameCardFrame.compactLoadClassName).toContain('load-board-card')
    expect(animatedGameCardFrame.appliesTo).toEqual([
      'collapsed-slate-card',
      'expanded-slate-board',
      'legacy-market-card',
    ])
    expect(animatedGameCardFrame.ringAnimationName).toBe('gameCardFrameOrbit')
    expect(animatedGameCardFrame.glowAnimationName).toBe('gameCardFrameGlow')
    expect(animatedGameCardFrame.shimmerAnimationName).toBe('gameCardFrameShimmer')
    expect(animatedGameCardFrame.preservesContentLayout).toBe(true)
    expect(animatedGameCardFrame.respectsReducedMotion).toBe(true)
  })

  it('is wired into collapsed and expanded slate card render paths', () => {
    const source = readFileSync(resolve(__dirname, '../AppClient.tsx'), 'utf8')
    expect(source).toContain('className={animatedGameCardFrame.compactLoadClassName}')
    expect(source).toContain('className={animatedGameCardFrame.className}')
    expect(source).toContain('className={`${animatedGameCardFrame.className} ${isLive ?')
    expect(source).toContain('@media (prefers-reduced-motion: reduce)')
    expect(source).toContain('gameCardFrameOrbit')
    expect(source).toContain('gameCardFrameShimmer')
  })
})
