// ── Call Tracker ─────────────────────────────────────────────────────────────
// Manages W/L tracking for edge signals in localStorage

export type CallStatus = 'pending' | 'won' | 'lost' | 'push' | 'void'

export interface TrackedCall {
  id: string
  timestamp: string        // ISO when call was logged
  gameId: string
  game: string             // "Away @ Home"
  sport: string
  recommendation: string   // full recommendation text
  bettingSide: 'away' | 'home'
  polymarketPrice: number  // e.g. 0.45 = 45¢
  dkImplied: number        // DK vig-removed implied prob
  edge: number             // polymarket edge (DK - poly)
  kellySize: number        // kelly fraction (bet size as decimal of bankroll)
  status: CallStatus
  settledAt: string | null
  profitLoss: number | null // in units (kelly-based); +kelly on win, -kelly on loss
  notes: string
}

const STORAGE_KEY = 'poly-calls'

export function loadCalls(): TrackedCall[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveCalls(calls: TrackedCall[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calls))
}

export function addCall(call: TrackedCall): void {
  const calls = loadCalls()
  // Dedup: same gameId + same bettingSide on same calendar day
  const dayKey = call.timestamp.slice(0, 10)
  const existing = calls.find(c =>
    c.gameId === call.gameId &&
    c.bettingSide === call.bettingSide &&
    c.timestamp.slice(0, 10) === dayKey
  )
  if (existing) return // already tracked
  saveCalls([call, ...calls].slice(0, 500))
}

export function updateCallStatus(
  id: string,
  status: CallStatus,
  profitLoss: number | null
): TrackedCall[] {
  const calls = loadCalls()
  const updated = calls.map(c =>
    c.id === id
      ? { ...c, status, settledAt: new Date().toISOString(), profitLoss }
      : c
  )
  saveCalls(updated)
  return updated
}

export function deleteCalls(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

// ── Kelly calculation ─────────────────────────────────────────────────────────
// For a binary bet at price p with true probability q:
// Kelly fraction = (q - p) / (1 - p) = edge / (1 - price)
// Capped at 10% of bankroll
export function calcKelly(edge: number, price: number): number {
  if (price >= 1 || price <= 0) return 0
  const raw = edge / (1 - price)
  return Math.min(Math.max(raw, 0), 0.1) // cap at 10%
}

// P&L in units: win = +(1-price)/price * kelly, loss = -kelly
export function calcPnL(status: CallStatus, kelly: number, price: number): number {
  if (status === 'won') return kelly * ((1 - price) / price) // net profit in units
  if (status === 'lost') return -kelly
  if (status === 'push') return 0
  return 0
}

// ── Analytics ────────────────────────────────────────────────────────────────
export interface CallStats {
  total: number
  settled: number
  wins: number
  losses: number
  pushes: number
  voids: number
  winRate: number   // 0-1
  totalPnL: number  // units
  roi: number       // P&L / total wagered
  avgEdgeWin: number
  avgEdgeLoss: number
  longestWinStreak: number
  longestLossStreak: number
  bestCall: TrackedCall | null
  worstCall: TrackedCall | null
}

export function calcStats(calls: TrackedCall[]): CallStats {
  const settled = calls.filter(c => c.status !== 'pending' && c.status !== 'void')
  const wins = settled.filter(c => c.status === 'won')
  const losses = settled.filter(c => c.status === 'lost')
  const pushes = settled.filter(c => c.status === 'push')
  const voids = calls.filter(c => c.status === 'void')

  const totalWagered = settled.reduce((s, c) => s + c.kellySize, 0)
  const totalPnL = settled.reduce((s, c) => s + (c.profitLoss ?? 0), 0)

  const avgEdgeWin = wins.length ? wins.reduce((s, c) => s + c.edge, 0) / wins.length : 0
  const avgEdgeLoss = losses.length ? losses.reduce((s, c) => s + c.edge, 0) / losses.length : 0

  // Streaks — walk through sorted by timestamp
  const sorted = [...settled].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  let longestWin = 0, longestLoss = 0, curWin = 0, curLoss = 0
  for (const c of sorted) {
    if (c.status === 'won') { curWin++; curLoss = 0 }
    else if (c.status === 'lost') { curLoss++; curWin = 0 }
    else { curWin = 0; curLoss = 0 }
    if (curWin > longestWin) longestWin = curWin
    if (curLoss > longestLoss) longestLoss = curLoss
  }

  const bestCall = wins.length
    ? wins.reduce((best, c) => c.edge > best.edge ? c : best, wins[0])
    : null
  const worstCall = losses.length
    ? losses.reduce((worst, c) => c.edge > worst.edge ? c : worst, losses[0])
    : null

  return {
    total: calls.length,
    settled: settled.length,
    wins: wins.length,
    losses: losses.length,
    pushes: pushes.length,
    voids: voids.length,
    winRate: settled.length > 0 ? wins.length / (wins.length + losses.length || 1) : 0,
    totalPnL,
    roi: totalWagered > 0 ? totalPnL / totalWagered : 0,
    avgEdgeWin,
    avgEdgeLoss,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    bestCall,
    worstCall,
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────
export function exportCSV(calls: TrackedCall[]): void {
  const headers = [
    'id', 'timestamp', 'game', 'sport', 'recommendation', 'bettingSide',
    'polymarketPrice', 'dkImplied', 'edge', 'kellySize',
    'status', 'settledAt', 'profitLoss', 'notes'
  ]
  const rows = calls.map(c => [
    c.id, c.timestamp, `"${c.game}"`, c.sport, `"${c.recommendation}"`,
    c.bettingSide, c.polymarketPrice, c.dkImplied, c.edge, c.kellySize,
    c.status, c.settledAt ?? '', c.profitLoss ?? '', `"${c.notes}"`
  ].join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `polymarket-calls-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
