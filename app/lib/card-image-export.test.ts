import { describe, expect, it } from 'vitest'
import { buildCardImageFileName, cardExportStatusLabel, canShareFiles } from './card-image-export'

describe('card image export helpers', () => {
  it('builds a safe Athlete Intelligence jpeg filename from a card title', () => {
    const now = new Date('2026-06-03T12:34:56Z')

    expect(buildCardImageFileName('Josh Hart · 10+ PTS / NY @ SA', now)).toBe('athlete-intelligence-josh-hart-10-pts-ny-sa-2026-06-03.jpg')
  })

  it('falls back to a generic card filename when title has no safe characters', () => {
    const now = new Date('2026-06-03T12:34:56Z')

    expect(buildCardImageFileName('///', now)).toBe('athlete-intelligence-card-2026-06-03.jpg')
  })

  it('detects whether browser native share accepts image files', () => {
    const fakeFile = { name: 'card.jpg', type: 'image/jpeg' } as File

    expect(canShareFiles({ canShare: () => true }, [fakeFile])).toBe(true)
    expect(canShareFiles({ canShare: () => false }, [fakeFile])).toBe(false)
    expect(canShareFiles({}, [fakeFile])).toBe(false)
  })

  it('uses image-specific export status copy', () => {
    expect(cardExportStatusLabel('idle')).toBe('Export JPEG')
    expect(cardExportStatusLabel('working')).toBe('Creating JPEG…')
    expect(cardExportStatusLabel('done')).toBe('JPEG ready')
    expect(cardExportStatusLabel('error')).toBe('Could not export JPEG')
  })
})
