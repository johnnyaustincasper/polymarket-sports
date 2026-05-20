#!/usr/bin/env node
/*
 * Safe production smoke test for Athlete Intelligence.
 *
 * Checks public/read-only status endpoints and validates only booleans,
 * provider labels, and HTTP reachability. Do not add secrets, cookies, or
 * authenticated calls here.
 */

const DEFAULT_BASE_URL = 'https://athleteintelligence.xyz'
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 10000)
const STRICT_WARNINGS = process.env.SMOKE_STRICT_WARNINGS === '1'

const checks = []

function pass(name, detail) {
  checks.push({ ok: true, name, detail })
}

function fail(name, detail) {
  checks.push({ ok: false, name, detail })
}

function warn(name, detail) {
  checks.push({ ok: true, warning: true, name, detail })
}

function baseUrl() {
  const raw = process.env.SMOKE_BASE_URL || process.argv[2] || DEFAULT_BASE_URL
  return raw.replace(/\/$/, '')
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const url = `${baseUrl()}${path}`

  try {
    const res = await fetch(url, {
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        Accept: options.accept || 'application/json,text/html;q=0.9,*/*;q=0.1',
        'User-Agent': 'athlete-intelligence-production-smoke/1.0',
        ...options.headers,
      },
      ...options,
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timeout)
  }
}

async function getJson(path) {
  const res = await request(path, { method: 'GET', accept: 'application/json' })
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()

  if (!res.ok) {
    throw new Error(`${path} returned HTTP ${res.status}`)
  }
  if (!contentType.includes('application/json')) {
    throw new Error(`${path} returned non-JSON content-type ${contentType || '(missing)'}`)
  }

  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${path} returned invalid JSON: ${error.message}`)
  }
}

function valueAt(object, path) {
  return path.split('.').reduce((current, part) => current && current[part], object)
}

function requireBoolean(object, path) {
  const value = valueAt(object, path)
  if (typeof value !== 'boolean') {
    fail(`boolean:${path}`, `expected boolean, got ${value === null ? 'null' : typeof value}`)
    return false
  }
  pass(`boolean:${path}`, String(value))
  return true
}

function findSecretLikeValues(value, trail = '$', findings = []) {
  if (value == null) return findings

  if (typeof value === 'string') {
    const secretPatterns = [
      /sk_(live|test)_[A-Za-z0-9]+/,
      /rk_(live|test)_[A-Za-z0-9]+/,
      /whsec_[A-Za-z0-9]+/,
      /xox[baprs]-[A-Za-z0-9-]+/,
      /Bearer\s+[A-Za-z0-9._-]+/i,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    ]
    if (secretPatterns.some(pattern => pattern.test(value))) findings.push(trail)
    return findings
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => findSecretLikeValues(item, `${trail}[${index}]`, findings))
    return findings
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const lowerKey = key.toLowerCase()
      // These endpoints intentionally expose booleans such as configured/hasSecret
      // and harmless host/model labels. Flag only high-risk raw secret containers.
      if (['secret', 'token', 'apikey', 'api_key', 'password', 'authorization'].includes(lowerKey) && typeof child === 'string' && child.length > 0) {
        findings.push(`${trail}.${key}`)
      }
      findSecretLikeValues(child, `${trail}.${key}`, findings)
    }
  }

  return findings
}

function validateProviderStatus(status) {
  const booleans = [
    'app.appUrlConfigured',
    'app.isVercel',
    'auth.clerkConfigured',
    'auth.legacySessionConfigured',
    'auth.hasGlobalInviteCode',
    'auth.guestAccessEnabled',
    'auth.bootstrapMode',
    'billing.stripeConfigured',
    'billing.checkoutConfigured',
    'billing.webhookConfigured',
    'billing.priceConfigured',
    'cache.remoteConfigured',
    'cache.recommendedForProduction',
    'ai.xai.configured',
    'ai.anthropic.configured',
    'ai.openai.configured',
    'search.brave.configured',
    'markets.kalshi.available',
    'markets.kalshi.requiresSecret',
    'markets.polymarket.available',
    'markets.polymarket.requiresSecret',
    'sports.espn.available',
    'sports.espn.requiresSecret',
    'database.supabase.configured',
  ]

  booleans.forEach(path => requireBoolean(status, path))

  if (!status.ai || !['xai', 'anthropic', null].includes(status.ai.primary)) {
    fail('provider:ai.primary', `unexpected primary provider ${JSON.stringify(status.ai && status.ai.primary)}`)
  } else {
    pass('provider:ai.primary', status.ai.primary || 'none')
  }

  if (status.markets?.primary !== 'kalshi') {
    warn('provider:markets.primary', `expected kalshi, got ${JSON.stringify(status.markets?.primary)}`)
  } else {
    pass('provider:markets.primary', 'kalshi')
  }

  const leakedPaths = findSecretLikeValues(status)
  if (leakedPaths.length) {
    fail('secrets:redaction', `secret-like values found at ${leakedPaths.join(', ')}`)
  } else {
    pass('secrets:redaction', 'no raw secret-like values found')
  }

  if (Array.isArray(status.warnings) && status.warnings.length > 0) {
    const detail = status.warnings.join(' | ')
    if (STRICT_WARNINGS) fail('provider:warnings', detail)
    else warn('provider:warnings', detail)
  } else {
    pass('provider:warnings', 'none')
  }
}

async function checkStatusEndpoints() {
  try {
    const authStatus = await getJson('/api/auth/status')
    pass('GET /api/auth/status', 'HTTP 200 JSON')

    if (!authStatus.providers) {
      fail('auth-status:providers', 'missing providers object')
    } else {
      pass('auth-status:providers', 'present')
      validateProviderStatus(authStatus.providers)
    }

    requireBoolean(authStatus, 'hasSecret')
    requireBoolean(authStatus, 'guestAccessEnabled')
    requireBoolean(authStatus, 'cache.remoteConfigured')
  } catch (error) {
    fail('GET /api/auth/status', error.message)
  }

  try {
    const providerStatus = await getJson('/api/provider-status')
    pass('GET /api/provider-status', 'HTTP 200 JSON')
    validateProviderStatus(providerStatus)
  } catch (error) {
    fail('GET /api/provider-status', error.message)
  }
}

async function checkAdminStatus() {
  const acceptable = new Set([200, 301, 302, 303, 307, 308, 401, 403, 405])

  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await request('/admin/status', { method, accept: method === 'GET' ? 'text/html,*/*;q=0.1' : '*/*' })
      if (!acceptable.has(res.status)) {
        fail(`${method} /admin/status`, `unexpected HTTP ${res.status}`)
        continue
      }

      const location = res.headers.get('location')
      const detail = location ? `HTTP ${res.status} -> ${location}` : `HTTP ${res.status}`
      pass(`${method} /admin/status`, detail)

      if (method === 'GET' && res.status === 200) {
        const text = await res.text()
        if (!/Provider Status|Athlete|sign|login/i.test(text)) {
          warn('GET /admin/status content', 'HTML did not contain expected status/login markers')
        } else {
          pass('GET /admin/status content', 'contains expected status/login marker')
        }
      }
    } catch (error) {
      fail(`${method} /admin/status`, error.message)
    }
  }
}

async function main() {
  console.log(`Athlete Intelligence production smoke: ${baseUrl()}`)
  await checkStatusEndpoints()
  await checkAdminStatus()

  const failures = checks.filter(check => !check.ok)
  const warnings = checks.filter(check => check.warning)

  for (const check of checks) {
    const icon = check.ok ? (check.warning ? '⚠' : '✓') : '✗'
    console.log(`${icon} ${check.name}: ${check.detail}`)
  }

  console.log(`\nResult: ${checks.length - failures.length}/${checks.length} checks passed, ${warnings.length} warning(s).`)

  if (failures.length) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error(`Smoke test crashed: ${error.stack || error.message}`)
  process.exit(1)
})
