import { describe, expect, it } from 'vitest'
import { appColorContract, appPalette } from './app-palette'

describe('app palette', () => {
  it('uses lighter cyan as the whole-app default accent', () => {
    expect(appColorContract.defaultAccent).toBe('light-cyan')
    expect(appColorContract.wholeAppCyan).toBe(true)
    expect(appPalette.primary).toBe('#7df6ff')
    expect(appPalette.primaryBright).toBe('#b8fbff')
    expect(appPalette.primaryBorder).toContain('125,246,255')
  })

  it('converts former power accents to the same lighter cyan family', () => {
    expect(appPalette.power).toBe('#7df6ff')
    expect(appPalette.powerSoft).toContain('125,246,255')
    expect(appPalette.powerBorder).toContain('125,246,255')
  })
})
