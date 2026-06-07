import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchUFCEvents, parseEventFromScoreboard } from './events'

function competitor(id: string, name: string, dob = '1996-01-01', homeAway?: 'home' | 'away') {
  return {
    id,
    homeAway,
    records: [{ type: 'total', summary: '10-1-0' }],
    athlete: {
      id,
      displayName: name,
      dateOfBirth: dob,
      displayHeight: '5\'10"',
      reach: 72,
      flag: { alt: 'United States' },
    },
  }
}

function competition(id: string, nameA: string, nameB: string, state = 'pre') {
  return {
    id,
    date: '2026-07-01T00:00:00Z',
    type: { text: 'Lightweight' },
    status: { type: { state, shortDetail: 'Scheduled' } },
    competitors: [competitor(`${id}a`, nameA), competitor(`${id}b`, nameB)],
  }
}

afterEach(() => vi.restoreAllMocks())

describe('UFC events loader', () => {
  it('parses event status from event-level status and sorts main event first', () => {
    const event = parseEventFromScoreboard({
      id: 'evt1',
      name: 'UFC Test Night',
      date: '2026-07-01T00:00:00Z',
      status: { type: { state: 'in' } },
      competitions: [competition('prelim', 'Prelim A', 'Prelim B', 'post'), competition('main', 'Main A', 'Main B', 'pre')],
    }, {}, [])

    expect(event.status).toBe('in')
    expect(event.fights.map(f => f.id)).toEqual(['main', 'prelim'])
    expect(event.fights[0].isMainEvent).toBe(true)
    expect(event.fights[0].fighterA).toMatchObject({ name: 'Main A', record: '10-1-0', height: '5\'10"' })
    expect(event.fights[0].fighterA.age).toEqual(expect.any(Number))
  })

  it('assigns ESPN home/away moneyline to the matching fighter and guards invalid dates', () => {
    const event = parseEventFromScoreboard({
      id: 'evt-odds',
      name: 'UFC Odds Test',
      date: 'not-a-date',
      competitions: [{
        ...competition('odds', 'Away Fighter', 'Home Fighter'),
        competitors: [competitor('odds-a', 'Away Fighter', '1996-01-01', 'away'), competitor('odds-b', 'Home Fighter', '1996-01-01', 'home')],
        odds: [{ homeMoneyLine: -210, awayMoneyLine: 175 }],
      }],
    }, {}, [])

    expect(event.date).toBe('')
    expect(event.fights[0].moneyLineA).toBe(175)
    expect(event.fights[0].moneyLineB).toBe(-210)
  })

  it('fetchUFCEvents preserves current scoreboard event parsing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('rankings')) return new Response(JSON.stringify({ rankings: [] }))
      if (url.includes('gamma-api')) return new Response(JSON.stringify([]))
      return new Response(JSON.stringify({
        leagues: [{ calendar: [] }],
        events: [{
          id: 'evt2',
          name: 'UFC Current',
          date: '2026-07-01T00:00:00Z',
          status: { type: { state: 'pre' } },
          competitions: [competition('early', 'Early A', 'Early B'), competition('headliner', 'Head A', 'Head B')],
        }],
      }))
    })

    const events = await fetchUFCEvents()
    expect(fetchMock).toHaveBeenCalled()
    expect(events[0].id).toBe('evt2')
    expect(events[0].fights[0].id).toBe('headliner')
  })
})
