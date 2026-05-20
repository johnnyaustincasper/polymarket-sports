type MemoryEntry = { value: unknown; expiresAt: number }

const memoryCache = new Map<string, MemoryEntry>()
const memoryLists = new Map<string, MemoryEntry>()

function cachePrefix(env: Record<string, string | undefined> = process.env): string {
  return env.DURABLE_CACHE_PREFIX || env.KV_CACHE_PREFIX || 'athlete-intel'
}

const CACHE_PREFIX = cachePrefix()

function restConfig(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || env.REDIS_REST_API_URL
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || env.REDIS_REST_API_TOKEN || env.KV_REST_API_READ_ONLY_TOKEN || env.UPSTASH_REDIS_REST_READONLY_TOKEN
  return url && token ? { url: url.replace(/\/$/, ''), token } : null
}

function cacheKey(key: string): string {
  return `${CACHE_PREFIX}:${key}`
}

export function getDurableCacheStatus(env: Record<string, string | undefined> = process.env) {
  const remoteConfigured = Boolean(restConfig(env))
  const productionRuntime = env.NODE_ENV === 'production' || env.VERCEL === '1' || env.VERCEL === 'true'
  const recommendedForProduction = remoteConfigured || !productionRuntime
  const warning = recommendedForProduction
    ? undefined
    : 'Redis/Vercel KV is not configured; memory fallback is not durable in production.'

  return {
    mode: remoteConfigured ? 'redis' : 'memory',
    remoteConfigured,
    prefix: cachePrefix(env),
    memoryKeys: memoryCache.size,
    memoryListKeys: memoryLists.size,
    recommendedForProduction,
    warning,
  }
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

export async function setJsonList<T>(key: string, values: T[], maxItems = 500, ttlMs = 30 * 24 * 60 * 60_000): Promise<void> {
  const fullKey = cacheKey(key)
  const next = values.slice(0, maxItems)
  memoryLists.set(fullKey, { value: next, expiresAt: Date.now() + ttlMs })
  setMemory(fullKey, next, 30_000)

  try {
    await redisCommand(['DEL', fullKey])
    if (next.length) await redisCommand(['RPUSH', fullKey, ...next.map(value => JSON.stringify(value))])
    await redisCommand(['PEXPIRE', fullKey, Math.max(1, Math.floor(ttlMs))])
  } catch {
    // Memory list is enough for local/dev or when durable storage is temporarily down.
  }
}
