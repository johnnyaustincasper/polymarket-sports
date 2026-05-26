import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getLoadInAnimationStyle, loadInAnimationContract } from './load-animation'

describe('shared load-in animation contract', () => {
  it('uses the proven Slate domino keyframe with bounded stagger delays', () => {
    expect(loadInAnimationContract.keyframeName).toBe('dominoFadeIn')
    expect(loadInAnimationContract.defaultDelayStepMs).toBe(80)

    expect(getLoadInAnimationStyle(0)).toMatchObject({
      opacity: 0,
      animationDelay: '0ms',
    })
    expect(getLoadInAnimationStyle(3).animationDelay).toBe('240ms')
    expect(getLoadInAnimationStyle(99).animationDelay).toBe('560ms')
  })

  it('is wired into loaded Slate and Teams surfaces', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'AppClient.tsx'), 'utf8')
    expect(source).toContain("from './lib/load-animation'")
    expect(source).toContain('getLoadInAnimationStyle(teamIdx')
    expect(source).toContain('getLoadInAnimationStyle(statIdx')
    expect(source).toContain('getLoadInAnimationStyle(rowIdx')
    expect(source).toContain('getLoadInAnimationStyle(idx')
  })
})
