import { NextRequest, NextResponse } from 'next/server'

export const PROFILE_COOKIE = 'ai_profile'
export const PROFILE_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 365

type SessionIdentity = {
  id?: string
  email: string
  name?: string
  guest?: boolean
}

export type AccountProfile = {
  id: string
  email: string
  name: string
  guest: boolean
  avatarUrl?: string
  preferences: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type StoredProfiles = Record<string, AccountProfile>

const editableFields = new Set(['name', 'displayName', 'avatarUrl', 'preferences'])

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function profileIdFor(session: SessionIdentity) {
  return session.id || normalizeEmail(session.email)
}

function defaultProfile(session: SessionIdentity): AccountProfile {
  const now = new Date().toISOString()
  const email = normalizeEmail(session.email)
  const guest = Boolean(session.guest || email.endsWith('@guest.local') || email.startsWith('guest-'))

  return {
    id: profileIdFor({ ...session, email }),
    email,
    name: session.name?.trim() || (guest ? 'Guest' : email.split('@')[0] || 'User'),
    guest,
    preferences: {},
    createdAt: now,
    updatedAt: now,
  }
}

function cleanString(value: unknown, max = 120) {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, max) : undefined
}

function cleanPreferences(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, val]) => key.length <= 60 && ['string', 'number', 'boolean'].includes(typeof val))
    .slice(0, 50)
  return Object.fromEntries(entries)
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function storeKind() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return 'vercel-kv'
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return 'upstash'
  if (process.env.PROFILE_STORE_FILE || !process.env.VERCEL) return 'file'
  return 'cookie'
}

async function readFileProfiles(): Promise<StoredProfiles> {
  const fs = await import('fs/promises')
  const path = await import('path')
  const file = process.env.PROFILE_STORE_FILE || path.join(process.cwd(), '.data', 'profiles.json')

  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (err: any) {
    if (err?.code === 'ENOENT') return {}
    throw err
  }
}

async function writeFileProfiles(profiles: StoredProfiles) {
  const fs = await import('fs/promises')
  const path = await import('path')
  const file = process.env.PROFILE_STORE_FILE || path.join(process.cwd(), '.data', 'profiles.json')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(profiles, null, 2), 'utf8')
}

function kvConfig() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
  }
}

async function readKvProfile(key: string) {
  const { url, token } = kvConfig()
  const res = await fetch(`${url.replace(/\/$/, '')}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null) as { result?: AccountProfile | string | null } | null
  if (!data?.result) return null
  return typeof data.result === 'string' ? JSON.parse(data.result) as AccountProfile : data.result
}

async function writeKvProfile(key: string, profile: AccountProfile) {
  const { url, token } = kvConfig()
  await fetch(`${url.replace(/\/$/, '')}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
    cache: 'no-store',
  })
}

function readCookieProfile(req: NextRequest, fallback: AccountProfile) {
  const raw = req.cookies.get(PROFILE_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(base64UrlDecode(raw)) as Partial<AccountProfile> & { displayName?: string; username?: string; details?: string }
    const parsedEmail = normalizeEmail(parsed.email || fallback.email)
    if (parsed.id && (parsed.id !== fallback.id || parsedEmail !== fallback.email)) return null

    // Accept the older /api/account cookie shape too so profile APIs do not
    // strand data written before the account-profile storage layer existed.
    return {
      ...fallback,
      ...parsed,
      id: fallback.id,
      email: fallback.email,
      name: parsed.name || parsed.displayName || fallback.name,
      avatarUrl: parsed.avatarUrl || fallback.avatarUrl,
      preferences: parsed.preferences || {},
    }
  } catch {
    return null
  }
}

function setCookieProfile(res: NextResponse, profile: AccountProfile) {
  const cookieProfile = { ...profile, displayName: profile.name }
  res.cookies.set(PROFILE_COOKIE, base64UrlEncode(JSON.stringify(cookieProfile)), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: PROFILE_COOKIE_TTL_SECONDS,
    path: '/',
  })
}

export function clearProfileCookie(res: NextResponse) {
  res.cookies.set(PROFILE_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expires: new Date(0),
    maxAge: 0,
    path: '/',
  })
  res.cookies.set(PROFILE_COOKIE, '', { expires: new Date(0), maxAge: 0, path: '/' })
}

export async function getAccountProfile(session: SessionIdentity, req: NextRequest) {
  const fallback = defaultProfile(session)
  const kind = storeKind()
  const key = `profile:${fallback.id}`
  let stored: AccountProfile | null = null

  if (kind === 'file') {
    stored = (await readFileProfiles())[key] || null
  } else if (kind === 'vercel-kv' || kind === 'upstash') {
    stored = await readKvProfile(key)
  } else {
    stored = readCookieProfile(req, fallback)
  }

  return {
    ...fallback,
    ...stored,
    id: fallback.id,
    email: fallback.email,
    guest: fallback.guest,
    preferences: { ...fallback.preferences, ...(stored?.preferences || {}) },
    storage: kind,
  }
}

export async function saveAccountProfile(session: SessionIdentity, req: NextRequest, patch: Record<string, unknown>, res: NextResponse) {
  const current = await getAccountProfile(session, req)
  const now = new Date().toISOString()
  const next: AccountProfile = {
    id: current.id,
    email: current.email,
    guest: current.guest,
    name: current.name,
    avatarUrl: current.avatarUrl,
    preferences: current.preferences || {},
    createdAt: current.createdAt,
    updatedAt: now,
  }

  for (const [key, value] of Object.entries(patch)) {
    if (!editableFields.has(key)) continue
    if (key === 'name' || key === 'displayName') next.name = cleanString(value) || next.name
    if (key === 'avatarUrl') next.avatarUrl = cleanString(value, 500)
    if (key === 'preferences') next.preferences = { ...next.preferences, ...(cleanPreferences(value) || {}) }
  }

  const kind = storeKind()
  const storageKey = `profile:${next.id}`
  if (kind === 'file') {
    const profiles = await readFileProfiles()
    profiles[storageKey] = next
    await writeFileProfiles(profiles)
  } else if (kind === 'vercel-kv' || kind === 'upstash') {
    await writeKvProfile(storageKey, next)
  } else {
    setCookieProfile(res, next)
  }

  return { ...next, storage: kind }
}

export function getProfileStorageStatus() {
  return { storage: storeKind() }
}
