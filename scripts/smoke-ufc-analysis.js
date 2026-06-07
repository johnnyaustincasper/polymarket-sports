const BASE_URL = process.env.AI_BASE_URL || 'https://athleteintelligence.xyz'

async function readJson(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'User-Agent': 'ai-ufc-analysis-smoke/1.0' } })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) throw new Error(`${path} returned ${res.status}: ${text.slice(0, 220)}`)
  return json
}

async function main() {
  const checks = []
  const ufc = await readJson('/api/ufc')
  if (!Array.isArray(ufc)) throw new Error('/api/ufc did not return an array')
  checks.push(`/api/ufc ok (${ufc.length} events)`)

  const analysis = await readJson('/api/ufc-analysis')
  if (analysis?.available) {
    if (!analysis.analysis?.eventId || !Array.isArray(analysis.analysis?.fights)) throw new Error('/api/ufc-analysis available payload is malformed')
    checks.push(`/api/ufc-analysis available (${analysis.analysis.fights.length} fights, ${analysis.analysis.status})`)
  } else {
    if (!['missing', 'stale'].includes(String(analysis?.status))) throw new Error(`/api/ufc-analysis unavailable status unexpected: ${JSON.stringify(analysis)}`)
    checks.push(`/api/ufc-analysis clean unavailable (${analysis.status})`)
  }

  console.log(`UFC analysis smoke passed for ${BASE_URL}`)
  for (const check of checks) console.log(`✓ ${check}`)
}

main().catch(err => {
  console.error(`UFC analysis smoke failed: ${err.message}`)
  process.exit(1)
})
