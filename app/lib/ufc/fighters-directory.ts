export type FighterPhotoInput = {
  id?: string | number | null
  name?: string | null
  headshot?: string | null
}

export function getFighterPhotoUrl(fighter: FighterPhotoInput): string | null {
  const explicit = typeof fighter.headshot === 'string' ? fighter.headshot.trim() : ''
  if (explicit) return explicit

  const id = fighter.id == null ? '' : String(fighter.id).trim()
  if (!/^\d+$/.test(id)) return null

  return `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`
}

export function isWeightClassOpenByDefault(index: number): boolean {
  return index === 0
}
