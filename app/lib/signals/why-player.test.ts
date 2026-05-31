import { describe, expect, it } from 'vitest'
import { selectWhyThisPlayerBullets } from './why-player'

describe('selectWhyThisPlayerBullets', () => {
  it('uses deterministic player-specific bullets instead of generic TodayIntel fallback', () => {
    const bullets = selectWhyThisPlayerBullets({
      playerSpecific: [
        'Josh Hart fits this rebounding look: 8 rebounds over the last 5 and 5 of 5 cleared 4+.',
        'The number is the hook: recent middle is 8.5, range is 4-11, so 4+ has room unless the prop moves up.',
      ],
      apiWhyCare: [
        'Stable 24-35 minute role lately, strong rebounding rate, facing SA on back-to-back.',
        'Simple read: this works if his role looks normal before tipoff.',
      ],
      fallback: ['Last game: 11 rebounds in 24 min.'],
    })

    expect(bullets).toEqual([
      'Josh Hart fits this rebounding look: 8 rebounds over the last 5 and 5 of 5 cleared 4+.',
      'The number is the hook: recent middle is 8.5, range is 4-11, so 4+ has room unless the prop moves up.',
    ])
    expect(bullets.join(' ')).not.toMatch(/Simple read|Stable 24-35 minute role|Last game:/)
  })
})
