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

let cache: { data: { generatedAt: string; source: string; weightClasses: WeightClassGroup[] }; ts: number } | null = null
const TTL = 10 * 60 * 1000
const UFC_BASE_URL = 'https://www.ufc.com'

const ORDER = [
  'heavyweight', 'light-heavyweight', 'middleweight', 'welterweight', 'lightweight', 'featherweight', 'bantamweight', 'flyweight',
  'womens-bantamweight', 'womens-flyweight', 'womens-strawweight',
]
const LIMITS: Record<string, string> = {
  heavyweight: 'Up to 265 pounds',
  'light-heavyweight': 'Up to 205 pounds',
  middleweight: 'Up to 185 pounds',
  welterweight: 'Up to 170 pounds',
  lightweight: 'Up to 155 pounds',
  featherweight: 'Up to 145 pounds',
  bantamweight: 'Up to 135 pounds',
  flyweight: 'Up to 125 pounds',
  'womens-bantamweight': 'Up to 135 pounds',
  'womens-flyweight': 'Up to 125 pounds',
  'womens-strawweight': 'Up to 115 pounds',
}

async function fetchOfficialUfcRankingsHtml() {
  const res = await fetch(`${UFC_BASE_URL}/rankings`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  } as RequestInit & { next: { revalidate: number } })
  if (!res.ok) throw new Error(`UFC rankings failed (${res.status})`)
  return res.text()
}

async function fetchEspnRankings() {
  const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/mma/ufc/rankings', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  } as RequestInit & { next: { revalidate: number } })
  if (!res.ok) throw new Error(`ESPN rankings failed (${res.status})`)
  return res.json()
}

function decodeHtml(value: string) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(value: string) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function slugifyDivision(name: string) {
  return stripTags(name)
    .toLowerCase()
    .replace(/women's/g, 'womens')
    .replace(/men's/g, 'mens')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function idFromUfcHref(href: string | null, name: string) {
  const slug = href?.split('/').filter(Boolean).pop()
  return slug || slugifyDivision(name)
}

function absoluteUfcUrl(href: string | null) {
  if (!href) return null
  return href.startsWith('http') ? href : `${UFC_BASE_URL}${href}`
}

function parseOfficialUfcRankings(html: string): WeightClassGroup[] {
  const sections = html.split('<div class="view-grouping">').slice(1)
  const groups: WeightClassGroup[] = []

  for (const section of sections) {
    const headerMatch = section.match(/<div class="view-grouping-header">([\s\S]*?)<\/div>/)
    const name = stripTags(headerMatch?.[1] || '')
    if (!name || /pound-for-pound/i.test(name)) continue

    const id = slugifyDivision(name)
    if (!ORDER.includes(id)) continue

    const captionMatch = section.match(/<caption>([\s\S]*?)<\/caption>/)
    const caption = captionMatch?.[1] || ''
    const championLink = caption.match(/<h5>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h5>/)
    const championImg = caption.match(/<img[^>]+src="([^"]+)"[^>]*>/)
    const fighters: Fighter[] = []

    if (championLink) {
      const champName = stripTags(championLink[2])
      fighters.push({
        id: idFromUfcHref(championLink[1], champName),
        name: champName,
        shortName: champName,
        nickname: null,
        record: null,
        rank: null,
        champion: true,
        country: null,
        headshot: championImg ? decodeHtml(championImg[1]) : null,
        color: null,
        url: absoluteUfcUrl(championLink[1]),
      })
    }

    const rows = section.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || ''
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g
    let rowMatch: RegExpExecArray | null
    while ((rowMatch = rowRegex.exec(rows))) {
      const row = rowMatch[1]
      const rankRaw = row.match(/views-field-weight-class-rank">\s*([0-9]+)/)?.[1]
      const nameLink = row.match(/views-field-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
      if (!rankRaw || !nameLink) continue
      const rank = Number(rankRaw)
      const fighterName = stripTags(nameLink[2])
      const fighterId = idFromUfcHref(nameLink[1], fighterName)
      if (fighters.some(fighter => fighter.id === fighterId)) continue
      fighters.push({
        id: fighterId,
        name: fighterName,
        shortName: fighterName,
        nickname: null,
        record: null,
        rank,
        champion: false,
        country: null,
        headshot: null,
        color: null,
        url: absoluteUfcUrl(nameLink[1]),
      })
    }

    groups.push({
      id,
      name,
      shortName: name,
      limit: LIMITS[id] || null,
      fighters: fighters.sort((a, b) => {
        if (a.champion !== b.champion) return a.champion ? -1 : 1
        return (a.rank || 999) - (b.rank || 999) || a.name.localeCompare(b.name)
      }),
    })
  }

  return groups.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
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

function buildEspnWeightClasses(data: any): WeightClassGroup[] {
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

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      fighters: group.fighters.sort((a, b) => {
        if (a.champion !== b.champion) return a.champion ? -1 : 1
        return (a.rank || 999) - (b.rank || 999) || a.name.localeCompare(b.name)
      }),
    }))
    .sort((a, b) => {
      const ai = ORDER.indexOf(a.id)
      const bi = ORDER.indexOf(b.id)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.name.localeCompare(b.name)
    })
}

async function loadWeightClasses(): Promise<{ source: string; weightClasses: WeightClassGroup[] }> {
  try {
    const html = await fetchOfficialUfcRankingsHtml()
    const weightClasses = parseOfficialUfcRankings(html)
    if (weightClasses.length >= 8 && weightClasses.every(group => group.fighters.some(fighter => fighter.champion))) {
      return { source: 'ufc.com/rankings', weightClasses }
    }
  } catch (err) {
    console.warn('Official UFC rankings unavailable, falling back to ESPN rankings:', err)
  }

  const rankings = await fetchEspnRankings()
  return { source: 'espn/rankings-fallback', weightClasses: buildEspnWeightClasses(rankings) }
}

export async function GET(req: NextRequest) {
  const rateLimited = enforceRateLimit(req, 'fighters', { limit: 40, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  try {
    if (cache && Date.now() - cache.ts < TTL) {
      return NextResponse.json(cache.data)
    }
    const loaded = await loadWeightClasses()
    const data = { generatedAt: new Date().toISOString(), source: loaded.source, weightClasses: loaded.weightClasses }
    cache = { data, ts: Date.now() }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'fighters unavailable', weightClasses: [] }, { status: 200 })
  }
}
