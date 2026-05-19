function configured(value: string | undefined): boolean {
  return Boolean(value && value.trim())
}

export interface BillingStatus {
  stripeConfigured: boolean
  checkoutConfigured: boolean
  webhookConfigured: boolean
  priceConfigured: boolean
  isFullyConfigured: boolean
}

export function getBillingStatus(env: NodeJS.ProcessEnv = process.env): BillingStatus {
  const stripeConfigured = configured(env.STRIPE_SECRET_KEY)
  const checkoutConfigured = stripeConfigured && configured(env.STRIPE_PRICE_ID)
  const webhookConfigured = stripeConfigured && configured(env.STRIPE_WEBHOOK_SECRET)
  const priceConfigured = configured(env.STRIPE_PRICE_ID)

  return {
    stripeConfigured,
    checkoutConfigured,
    webhookConfigured,
    priceConfigured,
    isFullyConfigured: checkoutConfigured && webhookConfigured,
  }
}

export function requireStripe(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!configured(key)) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.')
  }
  return key as string
}
