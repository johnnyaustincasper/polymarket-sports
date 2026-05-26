import { describe, expect, it } from 'vitest'
import { appColorContract, appPalette } from './app-palette'

describe('app palette', () => {
  it('uses soft cyan/teal as the default app accent', () => {
    expect(appColorContract.defaultAccent).toBe('cyan-teal')
    expect(appPalette.primary).toBe('#00d4ff')
    expect(appPalette.primaryBright).toBe('#00e8f8')
    expect(appPalette.primaryBorder).toContain('0,212,255')
  })

  it('keeps lime as a secondary power accent instead of the whole app default', () => {
    expect(appColorContract.keepsLimeAsPowerAccent).toBe(true)
    expect(appPalette.power).toBe('#a6ff3f')
    expect(appPalette.primary).not.toBe(appPalette.power)
  })
})
