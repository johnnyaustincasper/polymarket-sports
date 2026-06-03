import { findAccessCodeGrant, type FreeAccessCodeGrant } from './access-codes'

export type AccessCodeGuestSession = {
  email: string
  name: string
  guest: true
  subscriptionStatus: FreeAccessCodeGrant['subscriptionStatus']
  accessSource: 'code'
  accessCodeLabel: string
}

type EnvLike = Parameters<typeof findAccessCodeGrant>[1]

function guestEmailFromCode(code: string) {
  const slug = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'access-code'
  return `${slug}@guest.local`
}

export function buildAccessCodeGuestSession(code: string, env?: EnvLike, now = new Date()): AccessCodeGuestSession | null {
  const grant = findAccessCodeGrant(code, env, now)
  if (!grant) return null

  return {
    email: guestEmailFromCode(grant.code),
    name: `${grant.label} Guest`,
    guest: true,
    subscriptionStatus: grant.subscriptionStatus,
    accessSource: 'code',
    accessCodeLabel: grant.label,
  }
}

export function isAccessCodeGuestSession(session: { guest?: boolean; subscriptionStatus?: string | null; accessSource?: string | null } | null | undefined) {
  const status = String(session?.subscriptionStatus || '').toLowerCase()
  return Boolean(session?.guest && session.accessSource === 'code' && ['active', 'trialing', 'paid'].includes(status))
}
