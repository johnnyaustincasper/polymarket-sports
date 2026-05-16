type MemoryEntry = { value: unknown; expiresAt: number }

const memoryCache = new Map<string, MemoryEntry>()
const memoryLists = new Map<string, MemoryEntry>()
const CACHE_PREFIX = process.env.DURABLE_CACHE_PREFIX || process.env.KV_CACHE_PREFIX || 'athlete-intel'

function restConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_API_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN || process.env.UPSTASH_REDIS_REST_READONLY_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

function cacheKey(key: string): string {
  return `${CACHE_PREFIX}:${key}`
}

function getMemory<T>(key: string): T | null {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return null
  }
  return entry.value as T
}

function setMemory<T>(key: string, value: T, ttlMs: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

async function redisCommand<T>(command: unknown[]): Promise<T | null> {
  const config = restConfig()
  if (!config) return null

  const res = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(2500),
    cache: 'no-store',
  })

  if (!res.ok) throw new Error(`durable cache ${command[0]} failed: ${res.status}`)
  const data = await res.json()
  return data?.result as T
}

export async function getJsonCache<T>(key: string): Promise<T | null> {
  const fullKey = cacheKey(key)
  const memory = getMemory<T>(fullKey)
  if (memory !== null) return memory

  try {
    const raw = await redisCommand<string | null>(['GET', fullKey])
    if (!raw) return null
    const value = JSON.parse(raw) as T
    // Keep a short L1 copy so repeated work in one request/process does not keep
    // bouncing through the REST API. The remote key remains the source of truth.
    setMemory(fullKey, value, 30_000)
    return value
  } catch {
    return getMemory<T>(fullKey)
  }
}

export async function setJsonCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const fullKey = cacheKey(key)
  setMemory(fullKey, value, ttlMs)

  try {
    await redisCommand(['SET', fullKey, JSON.stringify(value), 'PX', Math.max(1, Math.floor(ttlMs))])
  } catch {
    // Memory cache is intentionally enough when Upstash/Vercel KV is absent or down.
  }
}

export async function getJsonList<T>(key: string, limit = 200): Promise<T[]> {
  const fullKey = cacheKey(key)
  const memory = getMemory<T[]>(fullKey)
  if (memory !== null) return memory.slice(0, limit)

  try {
    const rows = await redisCommand<string[]>(['LRANGE', fullKey, 0, Math.max(0, limit - 1)])
    const value = (rows || []).map(row => JSON.parse(row) as T)
    setMemory(fullKey, value, 30_000)
    return value
  } catch {
    const entry = memoryLists.get(fullKey)
    if (!entry || entry.expiresAt <= Date.now()) return []
    return (entry.value as T[]).slice(0, limit)
  }
}

export async function prependJsonList<T>(key: string, values: T[], maxItems = 500, ttlMs = 30 * 24 * 60 * 60_000): Promise<void> {
  if (!values.length) return
  const fullKey = cacheKey(key)
  const existing = ((memoryLists.get(fullKey)?.value as T[] | undefined) || []).slice()
  const next = [...values, ...existing].slice(0, maxItems)
  memoryLists.set(fullKey, { value: next, expiresAt: Date.now() + ttlMs })
  setMemory(fullKey, next, 30_000)

  try {
    await redisCommand(['LPUSH', fullKey, ...values.map(value => JSON.stringify(value))])
    await redisCommand(['LTRIM', fullKey, 0, Math.max(0, maxItems - 1)])
    await redisCommand(['PEXPIRE', fullKey, Math.max(1, Math.floor(ttlMs))])
  } catch {
    // Memory list is enough for local/dev or when durable storage is temporarily down.
  }
}
