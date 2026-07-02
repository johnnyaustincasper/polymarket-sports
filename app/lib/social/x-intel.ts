export type XIntelSignalInput = {
  id: string
  sport?: string
  player: string
  team?: string
  matchup?: string
  metric?: string
  label?: string
  gameTime?: string
}

export type XIntelPost = {
  id: string
  text: string
  author?: string
  createdAt?: string
  url?: string
}

export type XIntelContext = {
  signalId: string
  query: string
  summary: string
  posts: XIntelPost[]
  sources: string[]
  unavailable?: string
}

type Env = Record<string, string | undefined>

type FetchLike = typeof fetch

const X_RECENT_SEARCH_URL = 'https://api.x.com/2/tweets/search/recent'
const DEFAULT_MAX_POSTS = 4
const DEFAULT_TIMEOUT_MS = 3500

function configured(value: string | undefined): value is string {
  return Boolean(value && value.trim())
}

function bearerFromEnv(env: Env) {
  return env.X_API_BEARER_TOKEN || env.X_BEARER_TOKEN || env.TWITTER_BEARER_TOKEN
}

function cleanTerm(value: string | undefined) {
  return String(value || '')
    .replace(/[“”]/g, '"')
    .replace(/[^a-zA-Z0-9 .@#&'"+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function quoted(value: string | undefined) {
  const clean = cleanTerm(value)
  if (!clean) return ''
  return clean.includes(' ') ? `"${clean.replace(/"/g, '')}"` : clean
}

function matchupTeams(matchup: string | undefined) {
  return cleanTerm(matchup)
    .split(/\s+@\s+|\s+vs\.?\s+/i)
    .map(part => part.trim())
    .filter(Boolean)
}

export function buildXIntelQuery(signal: XIntelSignalInput): string {
  const player = quoted(signal.player)
  const team = cleanTerm(signal.team)
  const teams = matchupTeams(signal.matchup)
  const label = cleanTerm(signal.label || signal.metric)
  const sport = cleanTerm(signal.sport).toLowerCase()

  const roleTerms = sport === 'nba'
    ? '(starter OR starting OR minutes OR rotation OR injury OR questionable OR out OR available OR lineup)'
    : sport === 'mlb'
      ? '(lineup OR batting OR scratched OR weather OR pitcher OR injury OR out OR available)'
      : sport === 'ufc'
        ? '(weigh-in OR weight OR camp OR injury OR illness OR odds OR interview)'
        : '(injury OR lineup OR status OR available OR out OR questionable)'

  const contextTerms = [team, ...teams].filter(Boolean).slice(0, 3).join(' OR ')
  const propTerms = label ? ` (${label.split(/\s+/).filter(word => word.length > 3).slice(0, 3).join(' OR ')})` : ''
  const context = contextTerms ? ` (${contextTerms})` : ''
  return `${player}${context} ${roleTerms}${propTerms} -is:retweet lang:en`.replace(/\s+/g, ' ').trim()
}

function postUrl(post: XIntelPost) {
  if (post.url) return post.url
  if (post.author) return `https://x.com/${post.author}/status/${post.id}`
  return `https://x.com/i/web/status/${post.id}`
}

function normalizePost(row: any, usersById: Map<string, string>): XIntelPost | null {
  const id = String(row?.id || '').trim()
  const text = String(row?.text || '').replace(/\s+/g, ' ').trim()
  if (!id || !text) return null
  const author = usersById.get(String(row?.author_id || ''))
  return {
    id,
    text,
    author,
    createdAt: String(row?.created_at || '').trim() || undefined,
    url: author ? `https://x.com/${author}/status/${id}` : `https://x.com/i/web/status/${id}`,
  }
}

export function summarizeXPosts(posts: XIntelPost[]): string {
  if (!posts.length) return 'No recent X posts found for this player/game context.'
  const snippets = posts.slice(0, 3).map(post => {
    const author = post.author ? `@${post.author}` : 'X post'
    return `${author}: ${post.text.slice(0, 180)}`
  })
  return snippets.join(' | ')
}

export async function fetchXIntelForSignal(signal: XIntelSignalInput, options: {
  env?: Env
  fetchImpl?: FetchLike
  maxPosts?: number
  timeoutMs?: number
} = {}): Promise<XIntelContext> {
  const env = options.env || process.env
  const bearer = bearerFromEnv(env)
  const query = buildXIntelQuery(signal)
  if (!configured(bearer)) {
    return {
      signalId: signal.id,
      query,
      summary: 'X API is not configured yet.',
      posts: [],
      sources: [],
      unavailable: 'missing_x_bearer_token',
    }
  }

  const maxPosts = Math.max(1, Math.min(10, options.maxPosts || DEFAULT_MAX_POSTS))
  const url = new URL(X_RECENT_SEARCH_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('max_results', String(Math.max(10, maxPosts)))
  url.searchParams.set('tweet.fields', 'created_at,author_id,public_metrics,context_annotations')
  url.searchParams.set('expansions', 'author_id')
  url.searchParams.set('user.fields', 'username,name,verified')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS)
  try {
    const res = await (options.fetchImpl || fetch)(url, {
      headers: { Authorization: `Bearer ${bearer}` },
      cache: 'no-store',
      signal: controller.signal,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        signalId: signal.id,
        query,
        summary: 'X API search failed; falling back to model/news context.',
        posts: [],
        sources: [],
        unavailable: data?.detail || data?.title || `x_api_${res.status}`,
      }
    }
    const usersById = new Map<string, string>()
    for (const user of Array.isArray(data?.includes?.users) ? data.includes.users : []) {
      const id = String(user?.id || '')
      const username = String(user?.username || '').trim()
      if (id && username) usersById.set(id, username)
    }
    const posts = (Array.isArray(data?.data) ? data.data : [])
      .map((row: any) => normalizePost(row, usersById))
      .filter(Boolean)
      .slice(0, maxPosts) as XIntelPost[]
    return {
      signalId: signal.id,
      query,
      summary: summarizeXPosts(posts),
      posts,
      sources: posts.map(postUrl),
    }
  } catch (error) {
    return {
      signalId: signal.id,
      query,
      summary: 'X API search timed out; falling back to model/news context.',
      posts: [],
      sources: [],
      unavailable: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchXIntelForSignals(signals: XIntelSignalInput[], options: {
  env?: Env
  fetchImpl?: FetchLike
  maxPosts?: number
  timeoutMs?: number
  concurrency?: number
} = {}): Promise<Map<string, XIntelContext>> {
  const output = new Map<string, XIntelContext>()
  const unique = signals.filter((signal, idx, rows) => rows.findIndex(row => row.id === signal.id) === idx)
  const concurrency = Math.max(1, Math.min(4, options.concurrency || 3))
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (cursor < unique.length) {
      const signal = unique[cursor++]
      output.set(signal.id, await fetchXIntelForSignal(signal, options))
    }
  }))
  return output
}
