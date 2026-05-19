type JsonCacheEntry<T = any> = { expiresAt: number; data: T }

const jsonCache = new Map<string, JsonCacheEntry>()
const jsonInflight = new Map<string, Promise<any>>()

export function cacheKey(path: string, params: Record<string, string | number | undefined | null> = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  })
  const query = qs.toString()
  return query ? `${path}?${query}` : path
}

export function clearJsonClientCache() {
  jsonCache.clear()
  jsonInflight.clear()
}

export function fetchJsonCached<T>(url: string, ttlMs = 30_000, timeoutMs = 0): Promise<T> {
  const now = Date.now()
  const cached = jsonCache.get(url)
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.data as T)

  const existing = jsonInflight.get(url)
  if (existing) return existing as Promise<T>

  const controller = timeoutMs > 0 ? new AbortController() : null
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const request = fetch(url, { cache: 'no-store', signal: controller?.signal })
    .then(async r => {
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error((data as any)?.error || `request failed (${r.status})`)
      jsonCache.set(url, { expiresAt: Date.now() + ttlMs, data })
      return data as T
    })
    .finally(() => {
      if (timeout) clearTimeout(timeout)
      jsonInflight.delete(url)
    })
  jsonInflight.set(url, request)
  return request
}
