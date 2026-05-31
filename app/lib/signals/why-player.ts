export function selectWhyThisPlayerBullets(input: {
  playerSpecific?: string[] | null
  apiWhyCare?: string[] | null
  fallback?: Array<string | undefined | null>
  limit?: number
}): string[] {
  const limit = input.limit ?? 3
  const clean = (items?: Array<string | undefined | null> | null) => (items || [])
    .map(item => String(item || '').trim())
    .filter(Boolean)

  const playerSpecific = clean(input.playerSpecific)
  if (playerSpecific.length) return playerSpecific.slice(0, limit)

  const apiWhyCare = clean(input.apiWhyCare)
  if (apiWhyCare.length) return apiWhyCare.slice(0, limit)

  return clean(input.fallback).slice(0, limit)
}
