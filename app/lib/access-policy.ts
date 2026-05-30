export type AccessPolicy = 'public' | 'authenticated' | 'paid' | 'admin'

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'paid'
  | 'guest_full_access'
  | 'free'
  | 'past_due'
  | 'canceled'
  | 'inactive'
  | 'unknown'
  | string

export type AccessPrincipal = {
  authenticated?: boolean
  guest?: boolean
  role?: string | null
  subscriptionStatus?: SubscriptionStatus | null
} | null | undefined

export type AccessPolicyOptions = {
  guestAccessEnabled?: boolean
  guestFullAccess?: boolean
}

export type AccessDecisionReason =
  | 'public'
  | 'authenticated'
  | 'paid'
  | 'admin'
  | 'guest_full_access'
  | 'auth_required'
  | 'subscription_required'
  | 'admin_required'
  | 'guest_disabled'

export type AccessDecision = {
  allowed: boolean
  policy: AccessPolicy
  reason: AccessDecisionReason
}

const PAID_STATUSES = new Set(['active', 'trialing', 'paid'])

function isAuthenticated(principal: AccessPrincipal): principal is NonNullable<AccessPrincipal> {
  return Boolean(principal?.authenticated)
}

export function isAdminPrincipal(principal: AccessPrincipal): boolean {
  return isAuthenticated(principal) && principal.role === 'admin'
}

export function hasPaidSubscription(principal: AccessPrincipal): boolean {
  return isAuthenticated(principal) && PAID_STATUSES.has(String(principal.subscriptionStatus || '').toLowerCase())
}

export function evaluateAccessPolicy(
  policy: AccessPolicy,
  principal: AccessPrincipal,
  options: AccessPolicyOptions = {},
): AccessDecision {
  if (policy === 'public') return { allowed: true, policy, reason: 'public' }

  if (!isAuthenticated(principal)) {
    return { allowed: false, policy, reason: 'auth_required' }
  }

  if (policy === 'authenticated') return { allowed: true, policy, reason: 'authenticated' }

  if (policy === 'admin') {
    return isAdminPrincipal(principal)
      ? { allowed: true, policy, reason: 'admin' }
      : { allowed: false, policy, reason: 'admin_required' }
  }

  if (isAdminPrincipal(principal)) return { allowed: true, policy, reason: 'admin' }
  if (hasPaidSubscription(principal)) return { allowed: true, policy, reason: 'paid' }

  if (principal.guest && options.guestFullAccess) {
    return options.guestAccessEnabled === false
      ? { allowed: false, policy, reason: 'guest_disabled' }
      : { allowed: true, policy, reason: 'guest_full_access' }
  }

  return { allowed: false, policy, reason: 'subscription_required' }
}
