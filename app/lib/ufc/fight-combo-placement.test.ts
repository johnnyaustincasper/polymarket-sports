import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const appClient = readFileSync(join(process.cwd(), 'app/AppClient.tsx'), 'utf8')

describe('UFC fight-card placement', () => {
  it('routes UFC multi-leg fight cards through the Signals tab', () => {
    expect(appClient).toContain("sport === 'ufc' ? <UFCSignalsPanel isMobile={isMobile} />")
    expect(appClient).toContain('UFC Signals · curated multi-leg fight cards')
  })

  it('does not render combo cards inside the UFC slate board section', () => {
    const slateStart = appClient.indexOf('function KalshiUFCSection()')
    const slateEnd = appClient.indexOf('function UFCSection()', slateStart)
    const slateSection = appClient.slice(slateStart, slateEnd)
    expect(slateSection).not.toContain('buildUfcComboCards')
    expect(slateSection).not.toContain('curated multi-leg fight cards')
  })
})
