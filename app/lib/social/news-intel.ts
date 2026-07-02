import { buildXIntelQuery, type XIntelSignalInput } from './x-intel'

export type NewsIntelArticle = {
  title: string
  description?: string
  url: string
  source?: string
  publishedAt?: string
}

export type NewsIntelContext = {
  signalId: string
  query: string
  summary: string
  articles: NewsIntelArticle[]
  sources: string[]
  unavailable?: string
}

type Env = Record<string, string | undefined>
type FetchLike = typeof fetch

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search'
const DEFAULT_MAX_ARTICLES = 4
const DEFAULT_TIMEOUT_MS = 3500

function configured(value: string | undefined): value is string {
  return Boolean(value && value.trim())
}

function braveToken(env: Env) {
  return env.BRAVE_API_KEY || env.BRAVE_SEARCH_API_KEY
}

function clean(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function newsQuery(signal: XIntelSignalInput) {
  const base = buildXIntelQuery(signal)
    .replace(/\s+-is:retweet\s+lang:en/i, '')
    .replace(/\([^)]*OR[^)]*\)/g, match => match.replace(/\bOR\b/g, ' '))
  const sport = clean(signal.sport).toUpperCase()
  return `${base} ${sport} injury lineup preview official beat writer news`.replace(/\s+/g, ' ').trim()
}

function normalizeArticle(row: any): NewsIntelArticle | null {
  const title = clean(row?.title)
  const url = clean(row?.url)
  if (!title || !url) return null
  return {
    title,
    url,
    description: clean(row?.description || row?.extra_snippets?.[0]) || undefined,
    source: clean(row?.profile?.name || row?.meta_url?.hostname) || undefined,
    publishedAt: clean(row?.age) || undefined,
  }
}

export function summarizeNewsArticles(articles: NewsIntelArticle[]): string {
  if (!articles.length) return 'No fresh non-X news receipt found for this player/game context.'
  return articles.slice(0, 3).map(article => {
    const source = article.source ? `${article.source}: ` : ''
    const description = article.description ? ` — ${article.description.slice(0, 170)}` : ''
    return `${source}${article.title}${description}`
  }).join(' | ')
}

export async function fetchNewsIntelForSignal(signal: XIntelSignalInput, options: {
  env?: Env
  fetchImpl?: FetchLike
  maxArticles?: number
  timeoutMs?: number
} = {}): Promise<NewsIntelContext> {
  const env = options.env || process.env
  const token = braveToken(env)
  const query = newsQuery(signal)
  if (!configured(token)) {
    return {
      signalId: signal.id,
      query,
      summary: 'Non-X news search is not configured yet.',
      articles: [],
      sources: [],
      unavailable: 'missing_brave_search_token',
    }
  }

  const maxArticles = Math.max(1, Math.min(10, options.maxArticles || DEFAULT_MAX_ARTICLES))
  const url = new URL(BRAVE_SEARCH_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(maxArticles))
  url.searchParams.set('freshness', 'pw')
  url.searchParams.set('text_decorations', 'false')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS)
  try {
    const res = await (options.fetchImpl || fetch)(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': token },
      cache: 'no-store',
      signal: controller.signal,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        signalId: signal.id,
        query,
        summary: 'Non-X news search failed; using stats/team context only.',
        articles: [],
        sources: [],
        unavailable: data?.message || data?.error || `brave_search_${res.status}`,
      }
    }
    const articles = (Array.isArray(data?.web?.results) ? data.web.results : [])
      .map(normalizeArticle)
      .filter(Boolean)
      .slice(0, maxArticles) as NewsIntelArticle[]
    return {
      signalId: signal.id,
      query,
      summary: summarizeNewsArticles(articles),
      articles,
      sources: articles.map(article => article.url),
    }
  } catch (error) {
    return {
      signalId: signal.id,
      query,
      summary: 'Non-X news search timed out; using stats/team context only.',
      articles: [],
      sources: [],
      unavailable: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchNewsIntelForSignals(signals: XIntelSignalInput[], options: {
  env?: Env
  fetchImpl?: FetchLike
  maxArticles?: number
  timeoutMs?: number
  concurrency?: number
} = {}): Promise<Map<string, NewsIntelContext>> {
  const output = new Map<string, NewsIntelContext>()
  const unique = signals.filter((signal, idx, rows) => rows.findIndex(row => row.id === signal.id) === idx)
  const concurrency = Math.max(1, Math.min(4, options.concurrency || 3))
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (cursor < unique.length) {
      const signal = unique[cursor++]
      output.set(signal.id, await fetchNewsIntelForSignal(signal, options))
    }
  }))
  return output
}
