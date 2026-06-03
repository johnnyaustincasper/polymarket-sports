import { isGuestAccessEnabled } from './guest-access'

const SESSION_COOKIE = 'ai_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

type AuthorizedUser = {
  email: string
  code?: string
  name?: string
}

function getSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.SESSION_SECRET || ''
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
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

async function hmacSha256(data: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  let binary = ''
  new Uint8Array(signature).forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

function parseAuthorizedUsers(): AuthorizedUser[] {
  const usersJson = process.env.AUTHORIZED_USERS_JSON?.trim()
  if (usersJson) {
    try {
      const parsed = JSON.parse(usersJson)
      if (Array.isArray(parsed)) {
        return parsed
          .map(user => typeof user === 'string'
            ? { email: normalizeEmail(user) }
            : { email: normalizeEmail(String(user.email || '')), code: user.code ? String(user.code) : undefined, name: user.name ? String(user.name) : undefined })
          .filter(user => user.email.includes('@'))
      }
    } catch {
      // Fall through to comma-separated config.
    }
  }

  return (process.env.AUTHORIZED_EMAILS || '')
    .split(',')
    .map(email => normalizeEmail(email))
    .filter(email => email.includes('@'))
    .map(email => ({ email }))
}

export function findAuthorizedUser(email: string) {
  const normalized = normalizeEmail(email)
  return parseAuthorizedUsers().find(user => user.email === normalized)
}

export function getAuthConfigStatus() {
  const authorizedUserCount = parseAuthorizedUsers().length
  return {
    hasSecret: Boolean(getSecret()),
    authorizedUserCount,
    hasGlobalInviteCode: Boolean(process.env.AUTH_INVITE_CODE || process.env.APP_PASSWORD),
    guestAccessEnabled: isGuestAccessEnabled(),
    // Keeps the existing production password from locking everyone out until
    // AUTHORIZED_EMAILS or AUTHORIZED_USERS_JSON is added in Vercel.
    bootstrapMode: authorizedUserCount === 0 && Boolean(process.env.APP_PASSWORD),
  }
}

export function validateAccessCode(user: AuthorizedUser, code: string) {
  const submittedCode = code.trim()
  const acceptedCode = user.code || process.env.AUTH_INVITE_CODE || process.env.APP_PASSWORD || ''
  return Boolean(acceptedCode) && safeEqual(submittedCode, acceptedCode)
}

export type SessionUser = {
  id?: string
  email: string
  name?: string
  guest: boolean
  subscriptionStatus?: string
  accessSource?: string
  accessCodeLabel?: string
  iat?: number
  exp?: number
}

type SessionTokenOptions = {
  guest?: boolean
  id?: string
  subscriptionStatus?: string
  accessSource?: string
  accessCodeLabel?: string
}

export async function createSessionToken(email: string, name?: string, options: SessionTokenOptions = {}) {
  const secret = getSecret()
  if (!secret) throw new Error('Missing AUTH_SESSION_SECRET or SESSION_SECRET')

  const normalizedEmail = normalizeEmail(email)
  const now = Math.floor(Date.now() / 1000)
  const payload = base64UrlEncode(JSON.stringify({
    accessCodeLabel: options.accessCodeLabel?.trim() || undefined,
    accessSource: options.accessSource?.trim() || undefined,
    email: normalizedEmail,
    exp: now + SESSION_TTL_SECONDS,
    guest: Boolean(options.guest || normalizedEmail.endsWith('@guest.local') || normalizedEmail.startsWith('guest-')),
    iat: now,
    id: options.id,
    name: name?.trim() || undefined,
    subscriptionStatus: options.subscriptionStatus?.trim() || undefined,
  }))
  const signature = await hmacSha256(payload, secret)
  return `${payload}.${signature}`
}

export async function verifySessionToken(token?: string): Promise<SessionUser | null> {
  const secret = getSecret()
  if (!token || !secret || !token.includes('.')) return null

  const [payload, signature] = token.split('.')
  const expectedSignature = await hmacSha256(payload, secret)
  if (!safeEqual(signature || '', expectedSignature)) return null

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as { id?: string; email?: string; name?: string; guest?: boolean; subscriptionStatus?: string; accessSource?: string; accessCodeLabel?: string; exp?: number; iat?: number }
    if (!session.email || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null
    const email = normalizeEmail(session.email)
    return {
      id: session.id,
      email,
      name: session.name,
      guest: Boolean(session.guest || email.endsWith('@guest.local') || email.startsWith('guest-')),
      subscriptionStatus: session.subscriptionStatus,
      accessSource: session.accessSource,
      accessCodeLabel: session.accessCodeLabel,
      iat: session.iat,
      exp: session.exp,
    }
  } catch {
    return null
  }
}

export { SESSION_COOKIE, SESSION_TTL_SECONDS }
