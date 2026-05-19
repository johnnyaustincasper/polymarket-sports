function parseFlag(value: string | undefined): boolean | null {
  if (value == null || value === '') return null
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return null
}

export function isGuestAccessEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = parseFlag(env.ENABLE_GUEST_ACCESS)
  if (explicit !== null) return explicit
  return env.NODE_ENV !== 'production'
}
