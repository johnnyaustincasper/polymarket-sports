export type FreeAccessCodeGrant = {
  code: string
  label: string
  subscriptionStatus: 'active' | 'trialing' | 'paid'
  plan: string
  expiresAt?: string | null
}

type EnvLike = {
  [key: string]: string | undefined
  FREE_ACCESS_CODES?: string
  FREE_ACCESS_CODES_JSON?: string
}

type RawJsonGrant = {
  code?: unknown
  label?: unknown
  status?: unknown
  subscriptionStatus?: unknown
  plan?: unknown
  expiresAt?: unknown
}

function normalizeCode(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function normalizeStatus(value: unknown): FreeAccessCodeGrant['subscriptionStatus'] {
  const status = String(value || '').trim().toLowerCase()
  if (status === 'trialing' || status === 'paid') return status
  return 'active'
}

function isExpired(expiresAt: string | null | undefined, now: Date) {
  if (!expiresAt) return false
  const expiresTime = Date.parse(expiresAt)
  if (!Number.isFinite(expiresTime)) return true
  return expiresTime <= now.getTime()
}

function grantFromRaw(raw: RawJsonGrant): FreeAccessCodeGrant | null {
  const code = normalizeCode(raw.code)
  if (!code) return null
  return {
    code,
    label: String(raw.label || 'Free Access').trim() || 'Free Access',
    subscriptionStatus: normalizeStatus(raw.subscriptionStatus || raw.status),
    plan: String(raw.plan || 'Free Access').trim() || 'Free Access',
    expiresAt: raw.expiresAt ? String(raw.expiresAt) : null,
  }
}

export function parseFreeAccessCodeGrants(env?: EnvLike): FreeAccessCodeGrant[] {
  const source = env ?? process.env
  const grants: FreeAccessCodeGrant[] = []

  const json = source.FREE_ACCESS_CODES_JSON?.trim()
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (Array.isArray(parsed)) {
        for (const raw of parsed) {
          const grant = grantFromRaw(raw || {})
          if (grant) grants.push(grant)
        }
      }
    } catch {
      // Fall through to comma-separated config.
    }
  }

  const simpleCodes = source.FREE_ACCESS_CODES || ''
  for (const code of simpleCodes.split(',').map(normalizeCode).filter(Boolean)) {
    if (!grants.some(grant => grant.code === code)) {
      grants.push({ code, label: 'Free Access', subscriptionStatus: 'active', plan: 'Free Access', expiresAt: null })
    }
  }

  return grants
}

export function findAccessCodeGrant(code: string, env?: EnvLike, now = new Date()): FreeAccessCodeGrant | null {
  const normalized = normalizeCode(code)
  if (!normalized) return null
  const grant = parseFreeAccessCodeGrants(env).find(candidate => candidate.code === normalized)
  if (!grant || isExpired(grant.expiresAt, now)) return null
  return grant
}

export function buildAccessGrantMetadata(grant: FreeAccessCodeGrant, now = new Date()) {
  return {
    subscriptionStatus: grant.subscriptionStatus,
    plan: grant.plan,
    accessSource: 'code',
    accessCodeLabel: grant.label,
    accessGrantedAt: now.toISOString(),
  }
}
