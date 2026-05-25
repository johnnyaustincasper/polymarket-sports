import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/app/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Fighter = {
  id: string
  name: string
  shortName: string
  nickname: string | null
  record: string | null
  rank: number | null
  champion: boolean
  country: string | null
  headshot: string | null
  color: string | null
  url: string | null
}

type WeightClassGroup = {
  id: string
  name: string
  shortName: string
  limit: string | null
  fighters: Fighter[]
}

let cache: { data: { generatedAt: string; weightClasses: WeightClassGroup[] }; ts: number } | null = null
const TTL = 10 * 60 * 1000

async function fetchEspnRankings() {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/rankings', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  } as RequestInit & { next: { revalidate: number } })
  if (!res.ok) throw new Error(`ESPN rankings failed (${res.status})`)
  return res.json()
}

function limitFromName(name: string): string | null {
  return name.match(/\(([^)]+)\)/)?.[1] || null
}

function athleteUrl(athlete: any): string | null {
  const links = Array.isArray(athlete?.links) ? athlete.links : []
  return links.find((link: any) => Array.isArray(link?.rel) && link.rel.includes('playercard'))?.href || links[0]?.href || null
}

function normalizeFighter(rank: any, champion: boolean): Fighter | null {
  const athlete = rank?.athlete || {}
  const id = String(athlete?.id || athlete?.uid || '')
  const name = athlete?.displayName || [athlete?.firstName, athlete?.lastName].filter(Boolean).join(' ')
  if (!id || !name) return null
  return {
    id,
    name,
    shortName: athlete?.shortname || athlete?.shortName || name,
    nickname: athlete?.nickname || null,
    record: rank?.recordSummary || athlete?.record || null,
    rank: champion ? null : Number(rank?.current || rank?.rank || 0) || null,
    champion,
    country: athlete?.flag?.alt || athlete?.citizenship || null,
    headshot: athlete?.headshot?.href || null,
    color: athlete?.color ? `#${String(athlete.color).replace(/^#/, '')}` : null,
    url: athleteUrl(athlete),
  }
}

function buildWeightClasses(data: any): WeightClassGroup[] {
  const groups = new Map<string, WeightClassGroup>()
  const rankings = Array.isArray(data?.rankings) ? data.rankings : []

  for (const group of rankings) {
    const wc = group?.weightClass
    const slug = wc?.slug
    if (!slug) continue
    const rawName = wc?.text || group?.shortName || group?.name || slug
    const existing = groups.get(slug)
    const next: WeightClassGroup = existing || {
      id: slug,
      name: rawName,
      shortName: wc?.shortName || rawName,
      limit: limitFromName(group?.name || ''),
      fighters: [],
    }
    if (!next.limit) next.limit = limitFromName(group?.name || '')

    const isChampionGroup = String(group?.type || '').includes('champions') || String(group?.name || '').toLowerCase().includes('champion')
    for (const rank of group?.ranks || []) {
      const fighter = normalizeFighter(rank, isChampionGroup)
      if (!fighter) continue
      const idx = next.fighters.findIndex(item => item.id === fighter.id)
      if (idx >= 0) {
        next.fighters[idx] = { ...next.fighters[idx], ...fighter, champion: next.fighters[idx].champion || fighter.champion }
      } else {
        next.fighters.push(fighter)
      }
    }
    groups.set(slug, next)
  }

  const order = [
    'heavyweight', 'light-heavyweight', 'middleweight', 'welterweight', 'lightweight', 'featherweight', 'bantamweight', 'flyweight',
    'womens-bantamweight', 'womens-flyweight', 'womens-strawweight',
  ]

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      fighters: group.fighters.sort((a, b) => {
        if (a.champion !== b.champion) return a.champion ? -1 : 1
        return (a.rank || 999) - (b.rank || 999) || a.name.localeCompare(b.name)
      }),
    }))
    .sort((a, b) => {
      const ai = order.indexOf(a.id)
      const bi = order.indexOf(b.id)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.name.localeCompare(b.name)
    })
}

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'fighters', { limit: 40, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  try {
    if (cache && Date.now() - cache.ts < TTL) {
      return NextResponse.json(cache.data)
    }
    const rankings = await fetchEspnRankings()
    const data = { generatedAt: new Date().toISOString(), weightClasses: buildWeightClasses(rankings) }
    cache = { data, ts: Date.now() }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'fighters unavailable', weightClasses: [] }, { status: 200 })
  }
}
