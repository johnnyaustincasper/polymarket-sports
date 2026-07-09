import { normalizeName, playerNameMatches } from './kalshi-matching'

export interface PlayerInjuryReportLike {
  name: string
  team: string
  position?: string
  status?: string
  detail?: string
  updatedAt?: string
}

export interface PlayerLikeWithInjury {
  player: string
  injuryStatus?: string
  injuryDetail?: string
}

export function isInjuryReportAvailabilityPositive(report: PlayerInjuryReportLike): boolean {
  const detail = String(report.detail || '').toLowerCase()
  return /\b(will be activated|has been activated|activated from|reinstated|available|cleared|will start|starting|expected to start|probable)\b/.test(detail)
}

export function shouldScratchPlayerFromInjuryReport(report: PlayerInjuryReportLike): boolean {
  const status = String(report.status || '').toLowerCase()
  if (!status) return false
  if (isInjuryReportAvailabilityPositive(report)) return false
  if (status.includes('day-to-day') || status === 'dtd') return false
  return /\b(il|injured list|out|suspended|bereavement|paternity|restricted|questionable|doubtful)\b/.test(status)
}

export function applyUnavailableInjuryFilter<T extends PlayerLikeWithInjury>(
  players: T[],
  injuries: Map<string, PlayerInjuryReportLike>,
): Array<T & Pick<PlayerLikeWithInjury, 'injuryStatus' | 'injuryDetail'>> {
  if (!injuries.size) return players
  return players
    .map(player => {
      const injury = Array.from(injuries.values()).find(report => playerNameMatches(player.player, report.name))
      return injury ? { ...player, injuryStatus: injury.status, injuryDetail: injury.detail } : player
    })
    .filter(player => {
      if (!player.injuryStatus) return true
      const report = injuries.get(normalizeName(player.player)) || Array.from(injuries.values()).find(injury => playerNameMatches(player.player, injury.name))
      return report ? !shouldScratchPlayerFromInjuryReport(report) : true
    }) as T[]
}
