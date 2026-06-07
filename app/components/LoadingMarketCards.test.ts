import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('LoadingMarketCards obvious loading treatment', () => {
  it('renders explicit loading language, an animated progress cue, and board-building phases', () => {
    const source = readFileSync(join(process.cwd(), 'app', 'components', 'LoadingMarketCards.tsx'), 'utf8')

    expect(source).toContain('Board is still loading…')
    expect(source).toContain('Still loading — hang tight…')
    expect(source).toContain('Fetching slate')
    expect(source).toContain('Matching markets')
    expect(source).toContain('Building board')
    expect(source).toContain('aiAnalyzeOrbit')
    expect(source).toContain('aiAnalyzeSweep')
  })
})
