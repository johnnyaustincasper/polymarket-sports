'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  TrackedCall, CallStatus, CallStats,
  loadCalls, saveCalls, addCall, updateCallStatus, deleteCalls,
  calcKelly, calcPnL, calcStats, exportCSV,
} from './callTracker'

const C = {
  cyan:    '#00f0ff',
  purple:  '#bf8fff',
  green:   '#00ff88',
  red:     '#ff4466',
  gold:    '#ffd700',
  bg:      '#02020f',
  card:    'rgba(8,8,28,0.9)',
  border:  'rgba(0,240,255,0.12)',
  borderHot: 'rgba(0,240,255,0.45)',
  textPrimary: '#dde8ff',
  textSecondary: 'rgba(180,200,255,0.45)',
}

interface NarrativeSignal {
  signals: {
    type: string; severity: 'high' | 'medium' | 'low'
    team: string; direction: 'favors_away' | 'favors_home' | 'neutral'
    summary: string
  }[]
  overallEdge: 'away' | 'home' | 'none'
  edgeConfidence: number
  aiSummary: string
}

interface Signal {
  gameId: string; gameName: string; gameTime: string; status: string
  dkAwayML: string; dkHomeML: string; dkAwayImplied: number; dkHomeImplied: number
  polyEventTitle: string; polyEventUrl: string; polyConditionId: string
  polyAwayTeam: string; polyHomeTeam: string
  polyAwayPrice: number; polyHomePrice: number
  polyAwayTokenId: string; polyHomeTokenId: string
  awayEdge: number; homeEdge: number
  bestSide: 'away' | 'home' | 'none'; bestEdge: number; recommendation: string
}

interface ScanResult {
  scannedAt: string; gamesScanned: number; polyMarketsFound: number; edgeSignals: number
  signals: Signal[]
}

interface SavedScan {
  id: string
  report: string
  gamesAnalyzed: number
  scannedAt: string
  bankroll: number
}

function fmt(n: number) { return (n * 100).toFixed(1) + '¢' }
function fmtEdge(n: number) { return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '¢' }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}
function fmtPct(n: number) { return (n * 100).toFixed(1) + '%' }
function fmtUnits(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(3) + 'u' }

function EdgeBar({ edge }: { edge: number }) {
  const pct = Math.min(Math.abs(edge) * 500, 100)
  const color = edge >= 0.07 ? C.green : edge >= 0.04 ? C.gold : edge >= 0.02 ? '#f97316' : C.red
  return (
    <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, boxShadow: `0 0 6px ${color}88`, borderRadius: 2, transition: 'width 0.5s' }} />
    </div>
  )
}

// ── Sparkline ROI Chart ───────────────────────────────────────────────────────
function RoiSparkline({ calls }: { calls: TrackedCall[] }) {
  const settled = [...calls]
    .filter(c => c.status !== 'pending' && c.status !== 'void' && c.profitLoss !== null)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-30)

  if (settled.length < 2) {
    return (
      <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 11 }}>
        Need 2+ settled calls for chart
      </div>
    )
  }

  const cumulative: number[] = []
  let running = 0
  for (const c of settled) {
    running += c.profitLoss ?? 0
    cumulative.push(running)
  }

  const min = Math.min(0, ...cumulative)
  const max = Math.max(0, ...cumulative)
  const range = max - min || 1

  const W = 280, H = 60, PAD = 4
  const xs = cumulative.map((_, i) => PAD + (i / (cumulative.length - 1)) * (W - PAD * 2))
  const ys = cumulative.map(v => H - PAD - ((v - min) / range) * (H - PAD * 2))

  const zeroY = H - PAD - ((0 - min) / range) * (H - PAD * 2)
  const lastVal = cumulative[cumulative.length - 1]
  const lineColor = lastVal >= 0 ? C.green : C.red
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Zero line */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 4" />
      {/* Fill */}
      <path
        d={`${d} L${xs[xs.length - 1].toFixed(1)},${zeroY} L${xs[0].toFixed(1)},${zeroY} Z`}
        fill={lineColor + '18'}
      />
      {/* Line */}
      <path d={d} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Dots for last point */}
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3" fill={lineColor} />
    </svg>
  )
}

// ── Signal Quality Dashboard ──────────────────────────────────────────────────
function StatsDashboard({ stats, calls }: { stats: CallStats; calls: TrackedCall[] }) {
  const [expanded, setExpanded] = useState(false)
  if (stats.total === 0) return null

  return (
    <div style={{
      borderRadius: 20, padding: '16px 20px',
      background: 'rgba(0,255,136,0.04)',
      border: '1px solid rgba(0,255,136,0.15)',
      marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <p style={{ color: C.green, fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          ◈ Signal Quality Dashboard
        </p>
        <button onClick={() => setExpanded(!expanded)} style={{
          fontSize: 10, padding: '4px 10px', borderRadius: 8,
          background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)',
          color: C.green, cursor: 'pointer', fontWeight: 700,
        }}>{expanded ? 'LESS' : 'MORE'}</button>
      </div>

      {/* Top stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: expanded ? 16 : 0 }}>
        {[
          { label: 'CALLS', val: stats.total.toString(), color: C.textPrimary },
          { label: 'WIN RATE', val: stats.settled > 0 ? fmtPct(stats.wins / (stats.wins + stats.losses || 1)) : '—', color: stats.winRate >= 0.55 ? C.green : stats.winRate >= 0.45 ? C.gold : C.red },
          { label: 'P&L', val: stats.settled > 0 ? fmtUnits(stats.totalPnL) : '—', color: stats.totalPnL >= 0 ? C.green : C.red },
          { label: 'ROI', val: stats.settled > 0 ? fmtPct(stats.roi) : '—', color: stats.roi >= 0 ? C.green : C.red },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <p style={{ color: s.color, fontWeight: 900, fontSize: 18 }}>{s.val}</p>
            <p style={{ color: C.textSecondary, fontSize: 8, letterSpacing: '0.15em', marginTop: 2 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {expanded && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)' }}>
              <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', marginBottom: 4 }}>RECORD</p>
              <p style={{ color: C.textPrimary, fontWeight: 800, fontSize: 15 }}>
                <span style={{ color: C.green }}>{stats.wins}W</span>
                {' — '}
                <span style={{ color: C.red }}>{stats.losses}L</span>
                {stats.pushes > 0 ? <span style={{ color: C.gold }}> — {stats.pushes}P</span> : ''}
              </p>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(0,240,255,0.05)', border: `1px solid ${C.border}` }}>
              <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', marginBottom: 4 }}>AVG EDGE WIN / LOSS</p>
              <p style={{ color: C.textPrimary, fontWeight: 800, fontSize: 13 }}>
                <span style={{ color: C.green }}>{stats.avgEdgeWin > 0 ? fmtEdge(stats.avgEdgeWin) : '—'}</span>
                {' / '}
                <span style={{ color: C.red }}>{stats.avgEdgeLoss > 0 ? fmtEdge(stats.avgEdgeLoss) : '—'}</span>
              </p>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(0,240,255,0.05)', border: `1px solid ${C.border}` }}>
              <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', marginBottom: 4 }}>STREAKS</p>
              <p style={{ color: C.textPrimary, fontWeight: 800, fontSize: 13 }}>
                <span style={{ color: C.green }}>W{stats.longestWinStreak}</span>
                {' / '}
                <span style={{ color: C.red }}>L{stats.longestLossStreak}</span>
              </p>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(0,240,255,0.05)', border: `1px solid ${C.border}` }}>
              <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', marginBottom: 4 }}>PENDING</p>
              <p style={{ color: C.gold, fontWeight: 800, fontSize: 15 }}>{stats.total - stats.settled - stats.voids}</p>
            </div>
          </div>

          {stats.bestCall && (
            <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)' }}>
              <span style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.1em' }}>BEST CALL </span>
              <span style={{ color: C.green, fontSize: 11, fontWeight: 700 }}>
                {stats.bestCall.game} · {fmtEdge(stats.bestCall.edge)} edge
              </span>
            </div>
          )}
          {stats.worstCall && (
            <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,68,102,0.06)', border: '1px solid rgba(255,68,102,0.15)' }}>
              <span style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.1em' }}>WORST CALL </span>
              <span style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>
                {stats.worstCall.game} · {fmtEdge(stats.worstCall.edge)} edge
              </span>
            </div>
          )}

          {/* ROI Chart */}
          <div style={{ marginTop: 14, padding: '12px', borderRadius: 12, background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}` }}>
            <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', marginBottom: 8 }}>ROI CURVE (LAST 30)</p>
            <RoiSparkline calls={calls} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Calls Tracker ─────────────────────────────────────────────────────────────
function CallsTracker({ calls, onUpdate }: { calls: TrackedCall[]; onUpdate: (calls: TrackedCall[]) => void }) {
  const [filterSport, setFilterSport] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<CallStatus | 'all'>('all')
  const [showSettled, setShowSettled] = useState(false)

  const sports = useMemo(() => {
    const set = new Set(calls.map(c => c.sport))
    return ['all', ...Array.from(set)]
  }, [calls])

  const filtered = useMemo(() => {
    return calls.filter(c => {
      if (filterSport !== 'all' && c.sport !== filterSport) return false
      if (filterStatus !== 'all' && c.status !== filterStatus) return false
      if (!showSettled && (c.status === 'won' || c.status === 'lost' || c.status === 'void')) return false
      return true
    })
  }, [calls, filterSport, filterStatus, showSettled])

  function markResult(id: string, status: CallStatus) {
    const call = calls.find(c => c.id === id)
    if (!call) return
    const pnl = calcPnL(status, call.kellySize, call.polymarketPrice)
    const updated = updateCallStatus(id, status, status === 'void' ? null : pnl)
    onUpdate(updated)
  }

  const statusColor: Record<CallStatus, string> = {
    pending: C.gold,
    won: C.green,
    lost: C.red,
    push: C.cyan,
    void: C.textSecondary,
  }

  if (calls.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: C.textSecondary, fontSize: 13 }}>
        No calls tracked yet. Run a scan to auto-log edge signals.
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {sports.map(s => (
          <button key={s} onClick={() => setFilterSport(s)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            background: filterSport === s ? 'rgba(0,240,255,0.12)' : 'transparent',
            border: `1px solid ${filterSport === s ? C.borderHot : C.border}`,
            color: filterSport === s ? C.cyan : C.textSecondary,
          }}>{s}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowSettled(!showSettled)} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', cursor: 'pointer',
          background: showSettled ? 'rgba(191,143,255,0.12)' : 'transparent',
          border: `1px solid ${showSettled ? C.purple : C.border}`,
          color: showSettled ? C.purple : C.textSecondary,
        }}>
          {showSettled ? '◈ ALL' : '⏳ PENDING ONLY'}
        </button>
        <button onClick={() => exportCSV(calls)} style={{
          padding: '5px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', cursor: 'pointer',
          background: 'rgba(0,240,255,0.05)', border: `1px solid ${C.border}`,
          color: C.textSecondary,
        }}>↓ CSV</button>
      </div>

      {/* Calls list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <p style={{ color: C.textSecondary, fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No calls match the current filter.</p>
        )}
        {filtered.map(c => {
          const color = statusColor[c.status]
          return (
            <div key={c.id} style={{
              borderRadius: 16, padding: '14px 16px',
              background: c.status === 'won' ? 'rgba(0,255,136,0.04)'
                : c.status === 'lost' ? 'rgba(255,68,102,0.04)'
                : c.status === 'void' ? 'rgba(255,255,255,0.01)'
                : 'rgba(255,215,0,0.03)',
              border: `1px solid ${color}30`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6,
                      background: color + '20', border: `1px solid ${color}50`,
                      color, letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>{c.status}</span>
                    <span style={{ color: C.textSecondary, fontSize: 9 }}>{c.sport.toUpperCase()}</span>
                    {c.profitLoss !== null && c.status !== 'void' && (
                      <span style={{ color: c.profitLoss >= 0 ? C.green : C.red, fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
                        {fmtUnits(c.profitLoss)}
                      </span>
                    )}
                  </div>
                  <p style={{ color: C.textPrimary, fontWeight: 700, fontSize: 13 }}>{c.game}</p>
                  <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 2 }}>
                    {new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {' · '}Edge: <span style={{ color: C.cyan }}>{fmtEdge(c.edge)}</span>
                    {' · '}Kelly: <span style={{ color: C.purple }}>{fmtPct(c.kellySize)}</span>
                  </p>
                  <p style={{ color: 'rgba(180,210,255,0.5)', fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>{c.recommendation}</p>
                </div>
              </div>

              {c.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.1em', alignSelf: 'center' }}>MARK:</span>
                  {(['won', 'lost', 'push', 'void'] as CallStatus[]).map(s => (
                    <button key={s} onClick={() => markResult(c.id, s)} style={{
                      padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 800,
                      cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
                      background: s === 'won' ? 'rgba(0,255,136,0.12)'
                        : s === 'lost' ? 'rgba(255,68,102,0.12)'
                        : s === 'push' ? 'rgba(0,240,255,0.08)'
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${statusColor[s]}40`,
                      color: statusColor[s],
                    }}>{s}</button>
                  ))}
                </div>
              )}
              {c.settledAt && (
                <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 4 }}>
                  Settled: {new Date(c.settledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BotPage() {
  const [data, setData] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'edge'>('all')
  const [narratives, setNarratives] = useState<Record<string, NarrativeSignal | 'loading' | 'error'>>({})
  const [fullScan, setFullScan] = useState<SavedScan | null>(null)
  const [fullScanLoading, setFullScanLoading] = useState(false)
  const [bankroll, setBankroll] = useState(200)
  const [savedScans, setSavedScans] = useState<SavedScan[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [activeHistoryScan, setActiveHistoryScan] = useState<SavedScan | null>(null)

  // W/L tracker state
  const [trackedCalls, setTrackedCalls] = useState<TrackedCall[]>([])
  const [showTracker, setShowTracker] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('poly-scans')
    if (stored) setSavedScans(JSON.parse(stored))
    setTrackedCalls(loadCalls())
  }, [])

  const stats = useMemo(() => calcStats(trackedCalls), [trackedCalls])

  function persistScan(scan: SavedScan) {
    const stored = localStorage.getItem('poly-scans')
    const existing: SavedScan[] = stored ? JSON.parse(stored) : []
    const updated = [scan, ...existing].slice(0, 50)
    localStorage.setItem('poly-scans', JSON.stringify(updated))
    setSavedScans(updated)
  }

  // Auto-log edge signals from a scan result
  function autoLogSignals(scanData: ScanResult) {
    const edgeSignals = scanData.signals.filter(s => s.bestSide !== 'none')
    for (const s of edgeSignals) {
      const price = s.bestSide === 'away' ? s.polyAwayPrice : s.polyHomePrice
      const dkImplied = s.bestSide === 'away' ? s.dkAwayImplied : s.dkHomeImplied
      const kelly = calcKelly(s.bestEdge, price)
      const call: TrackedCall = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        gameId: s.gameId,
        game: s.gameName,
        sport: 'NBA',
        recommendation: s.recommendation,
        bettingSide: s.bestSide as 'away' | 'home',
        polymarketPrice: price,
        dkImplied,
        edge: s.bestEdge,
        kellySize: kelly,
        status: 'pending',
        settledAt: null,
        profitLoss: null,
        notes: '',
      }
      addCall(call)
    }
    setTrackedCalls(loadCalls())
  }

  async function runFullScan() {
    setFullScanLoading(true)
    setFullScan(null)
    try {
      const res = await fetch(`/api/bot/fullscan?bankroll=${bankroll}`)
      const json = await res.json()
      const scan: SavedScan = { ...json, bankroll, id: crypto.randomUUID() }
      setFullScan(scan)
      persistScan(scan)
    } catch {
      const scan: SavedScan = { report: 'Scan failed.', gamesAnalyzed: 0, scannedAt: new Date().toISOString(), bankroll, id: crypto.randomUUID() }
      setFullScan(scan)
    } finally { setFullScanLoading(false) }
  }

  function deleteScans() {
    localStorage.removeItem('poly-scans')
    setSavedScans([])
  }

  async function scan() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/bot/scan')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
      autoLogSignals(json)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function analyzeGame(s: Signal) {
    setNarratives(prev => ({ ...prev, [s.gameId]: 'loading' }))
    try {
      const res = await fetch('/api/bot/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: s.gameName,
          awayTeam: s.gameName.split(' @ ')[0],
          homeTeam: s.gameName.split(' @ ')[1],
          gameTime: new Date(s.gameTime).toLocaleString(),
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      setNarratives(prev => ({ ...prev, [s.gameId]: json }))
    } catch { setNarratives(prev => ({ ...prev, [s.gameId]: 'error' })) }
  }

  useEffect(() => { scan() }, [])

  const signals = data?.signals || []
  const displayed = filter === 'edge' ? signals.filter(s => s.bestSide !== 'none') : signals

  const sevColor = { high: C.red, medium: C.gold, low: C.textSecondary }
  const dirLabel = (s: Signal, dir: string) => ({
    favors_away: `▲ ${s.gameName.split(' @ ')[0]}`,
    favors_home: `▲ ${s.gameName.split(' @ ')[1]}`,
    neutral: '— Neutral'
  }[dir] || '—')

  const pendingCount = trackedCalls.filter(c => c.status === 'pending').length

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.textPrimary, fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative' }}>
      {/* Grid */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(rgba(0,240,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.03) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,255,136,0.05) 0%, transparent 70%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '40px 16px 80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <a href="/" style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.15em', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>← BACK</a>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>
              ⬡ <span style={{ color: C.green, textShadow: `0 0 20px ${C.green}55` }}>EDGE SCANNER</span>
            </h1>
            <p style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.06em', marginTop: 4 }}>Polymarket vs DraftKings · Paper Trading</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setShowTracker(true)} style={{
              padding: '8px 14px', borderRadius: 12, fontSize: 11, fontWeight: 800,
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
              background: pendingCount > 0 ? 'rgba(255,215,0,0.08)' : 'rgba(0,255,136,0.05)',
              border: `1px solid ${pendingCount > 0 ? 'rgba(255,215,0,0.3)' : 'rgba(0,255,136,0.2)'}`,
              color: pendingCount > 0 ? C.gold : C.green, position: 'relative',
            }}>
              📊 Calls
              {pendingCount > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: C.gold, color: C.bg, fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>
              )}
            </button>
            <button onClick={() => setShowHistory(true)} style={{
              padding: '8px 14px', borderRadius: 12, fontSize: 11, fontWeight: 800,
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
              background: 'rgba(0,240,255,0.05)', border: `1px solid ${C.border}`,
              color: C.textSecondary, position: 'relative',
            }}>
              ◷ History
              {savedScans.length > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: C.purple, color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{savedScans.length}</span>
              )}
            </button>
            <button onClick={scan} disabled={loading} style={{
              padding: '8px 16px', borderRadius: 12, fontSize: 11, fontWeight: 800,
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
              background: 'rgba(0,255,136,0.08)', border: `1px solid rgba(0,255,136,0.25)`,
              color: loading ? C.textSecondary : C.green, transition: 'all 0.2s',
            }}>
              {loading ? '⟳ SCANNING…' : '⟳ REFRESH'}
            </button>
          </div>
        </div>

        {/* Signal Quality Dashboard */}
        <StatsDashboard stats={stats} calls={trackedCalls} />

        {/* Stats */}
        {data && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
            {[
              { label: 'SCANNED', val: data.gamesScanned, color: C.textPrimary },
              { label: 'POLY MATCHED', val: data.polyMarketsFound, color: C.textPrimary },
              { label: 'EDGE SIGNALS', val: data.edgeSignals, color: data.edgeSignals > 0 ? C.green : C.textSecondary, glow: data.edgeSignals > 0 },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, minWidth: 90, borderRadius: 16, padding: '14px 16px', textAlign: 'center',
                background: s.glow ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${s.glow ? 'rgba(0,255,136,0.25)' : C.border}`,
                boxShadow: s.glow ? '0 0 20px rgba(0,255,136,0.1)' : 'none',
              }}>
                <p style={{ color: s.color, fontWeight: 900, fontSize: 24 }}>{s.val}</p>
                <p style={{ color: C.textSecondary, fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 2 }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {data && <p style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.08em', marginBottom: 20 }}>Last scan: {new Date(data.scannedAt).toLocaleTimeString()}</p>}

        {/* ── Full AI Scan ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>BANKROLL</span>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, background: 'rgba(0,240,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '6px 12px' }}>
              <span style={{ color: C.textSecondary, fontSize: 13, marginRight: 4 }}>$</span>
              <input
                type="number"
                value={bankroll}
                onChange={e => setBankroll(Number(e.target.value))}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: C.cyan, fontSize: 15, fontWeight: 800, width: '100%' }}
              />
            </div>
            <span style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.06em' }}>USDC</span>
          </div>
          <button onClick={runFullScan} disabled={fullScanLoading} style={{
            width: '100%', padding: '14px', borderRadius: 16,
            fontSize: 13, fontWeight: 800, letterSpacing: '0.06em',
            cursor: fullScanLoading ? 'not-allowed' : 'pointer',
            background: fullScanLoading
              ? 'rgba(168,85,247,0.06)'
              : 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(0,240,255,0.1))',
            border: `1px solid ${fullScanLoading ? 'rgba(168,85,247,0.15)' : 'rgba(168,85,247,0.4)'}`,
            color: fullScanLoading ? C.textSecondary : '#c4b5fd',
            boxShadow: fullScanLoading ? 'none' : '0 0 30px rgba(168,85,247,0.15)',
            transition: 'all 0.2s',
          }}>
            {fullScanLoading
              ? '◈ Scanning all games with Sonnet — this takes ~30 seconds…'
              : '◈ AI Full Scan — Tell me what to bet today'}
          </button>

          {fullScan && !fullScanLoading && (
            <div style={{
              marginTop: 12, borderRadius: 20, padding: '20px 20px',
              background: 'rgba(168,85,247,0.06)',
              border: '1px solid rgba(168,85,247,0.2)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ color: '#c4b5fd', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  ◈ Sonnet Analysis · {fullScan.gamesAnalyzed} games
                </p>
                <p style={{ color: C.textSecondary, fontSize: 10 }}>{new Date(fullScan.scannedAt).toLocaleTimeString()}</p>
              </div>
              <ScanReport scan={fullScan} />
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, marginBottom: 20 }}>
          {([['edge', '🎯 EDGE ONLY'], ['all', '◈ ALL GAMES']] as const).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              flex: 1, padding: '8px', borderRadius: 10, fontSize: 11, fontWeight: 800,
              letterSpacing: '0.08em', cursor: 'pointer', transition: 'all 0.2s',
              background: filter === f ? 'rgba(0,240,255,0.1)' : 'transparent',
              border: `1px solid ${filter === f ? C.border : 'transparent'}`,
              color: filter === f ? C.cyan : C.textSecondary,
            }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        {error && (
          <div style={{ borderRadius: 16, padding: 16, textAlign: 'center', background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.2)' }}>
            <p style={{ color: C.red, fontSize: 13 }}>Error: {error}</p>
          </div>
        )}

        {loading && !data && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.textSecondary, fontSize: 12, letterSpacing: '0.1em' }}>SCANNING MARKETS…</div>
        )}

        {!loading && displayed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.textSecondary, fontSize: 13 }}>
            {filter === 'edge' ? 'No edge signals detected. Check back closer to tip-off.' : 'No games found today.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {displayed.map(s => {
            const hasEdge = s.bestSide !== 'none'
            const n = narratives[s.gameId]
            // Check if already tracked
            const today = new Date().toISOString().slice(0, 10)
            const isTracked = trackedCalls.some(c =>
              c.gameId === s.gameId &&
              c.bettingSide === s.bestSide &&
              c.timestamp.slice(0, 10) === today
            )
            return (
              <div key={s.gameId} style={{
                borderRadius: 24, overflow: 'visible', position: 'relative',
                background: C.card, backdropFilter: 'blur(24px)',
                border: `1px solid ${hasEdge ? 'rgba(0,240,255,0.3)' : C.border}`,
                boxShadow: hasEdge ? `0 0 40px rgba(0,240,255,0.07), 0 8px 40px rgba(0,0,0,0.6)` : `0 4px 40px rgba(0,0,0,0.5)`,
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 24, right: 24, height: 1,
                  background: hasEdge
                    ? `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`
                    : `linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)`,
                }} />

                <div style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                    <div>
                      <p style={{ color: C.textPrimary, fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>{s.gameName}</p>
                      <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 2, letterSpacing: '0.06em' }}>{fmtTime(s.gameTime)}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {hasEdge && (
                        <div style={{
                          padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                          background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.borderHot}`,
                          color: C.cyan, whiteSpace: 'nowrap', boxShadow: `0 0 12px ${C.cyan}22`,
                          letterSpacing: '0.05em',
                        }}>{fmtEdge(s.bestEdge)} edge</div>
                      )}
                      {isTracked && (
                        <span style={{ fontSize: 9, color: C.green, letterSpacing: '0.1em' }}>✓ TRACKED</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    {[
                      { team: s.polyAwayTeam, ml: s.dkAwayML, implied: s.dkAwayImplied, price: s.polyAwayPrice, edge: s.awayEdge, isBest: s.bestSide === 'away' },
                      { team: s.polyHomeTeam, ml: s.dkHomeML, implied: s.dkHomeImplied, price: s.polyHomePrice, edge: s.homeEdge, isBest: s.bestSide === 'home' },
                    ].map(side => (
                      <div key={side.team} style={{
                        borderRadius: 16, padding: 14,
                        background: side.isBest ? 'rgba(0,240,255,0.07)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${side.isBest ? C.borderHot : C.border}`,
                        boxShadow: side.isBest ? `0 0 20px ${C.cyan}15` : 'none',
                      }}>
                        <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{side.team}</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                          <span style={{ color: C.textPrimary, fontSize: 20, fontWeight: 800 }}>{fmt(side.price)}</span>
                          <span style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.08em' }}>POLY</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textSecondary, marginBottom: 4 }}>
                          <span>DK {side.ml}</span>
                          <span>{fmt(side.implied)} implied</span>
                        </div>
                        <EdgeBar edge={side.edge} />
                        <p style={{
                          fontSize: 11, marginTop: 6, fontWeight: 700,
                          color: side.edge >= 0.03 ? C.green : side.edge >= 0 ? C.gold : C.red,
                        }}>{fmtEdge(side.edge)}{side.isBest ? ' 🎯' : ''}</p>
                      </div>
                    ))}
                  </div>

                  {hasEdge && (
                    <div style={{ borderRadius: 12, padding: '10px 14px', background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.2)', marginBottom: 14 }}>
                      <p style={{ color: '#86efac', fontSize: 12, fontWeight: 600 }}>{s.recommendation}</p>
                    </div>
                  )}

                  {!n && (
                    <button onClick={() => analyzeGame(s)} style={{
                      width: '100%', padding: '10px', borderRadius: 14, fontSize: 11, fontWeight: 800,
                      letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                      background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)',
                      color: C.purple, transition: 'all 0.2s',
                    }}>◈ Scan Narrative Edges — Injuries · Motivation · Revenge Games</button>
                  )}

                  {n === 'loading' && (
                    <div style={{ padding: '12px 0', textAlign: 'center', color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em' }}>◈ ANALYZING INTELLIGENCE…</div>
                  )}

                  {n === 'error' && (
                    <div style={{ padding: '10px', textAlign: 'center', borderRadius: 12, background: 'rgba(255,68,102,0.06)', border: '1px solid rgba(255,68,102,0.15)' }}>
                      <p style={{ color: C.red, fontSize: 11 }}>Analysis failed.</p>
                    </div>
                  )}

                  {n && n !== 'loading' && n !== 'error' && (
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                      {n.signals.length === 0
                        ? <p style={{ color: C.textSecondary, fontSize: 12, fontStyle: 'italic' }}>No significant narrative signals detected.</p>
                        : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                            {n.signals.map((sig, i) => (
                              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <span style={{
                                  fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6,
                                  background: `${sevColor[sig.severity]}15`,
                                  border: `1px solid ${sevColor[sig.severity]}40`,
                                  color: sevColor[sig.severity], letterSpacing: '0.1em',
                                  textTransform: 'uppercase', flexShrink: 0, marginTop: 1,
                                }}>{sig.severity}</span>
                                <div>
                                  <p style={{ color: C.purple, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
                                    {sig.type.toUpperCase()} · {dirLabel(s, sig.direction)}
                                  </p>
                                  <p style={{ color: C.textPrimary, fontSize: 12, lineHeight: 1.5, opacity: 0.75 }}>{sig.summary}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      }
                      <div style={{ borderRadius: 14, padding: '12px 14px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                        <p style={{ color: '#c4b5fd', fontSize: 12, lineHeight: 1.6 }}>{n.aiSummary}</p>
                        {n.overallEdge !== 'none' && (
                          <p style={{ color: C.purple, fontSize: 11, fontWeight: 800, marginTop: 6, letterSpacing: '0.04em' }}>
                            Narrative edge: {n.overallEdge === 'away' ? s.gameName.split(' @ ')[0] : s.gameName.split(' @ ')[1]} · {n.edgeConfidence}% confidence
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <a href={s.polyEventUrl} target="_blank" rel="noopener noreferrer" style={{
                    display: 'inline-block', marginTop: 12, color: C.textSecondary,
                    fontSize: 10, letterSpacing: '0.08em', textDecoration: 'none',
                  }}>View on Polymarket ↗</a>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── History Drawer ── */}
      {showHistory && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,2,15,0.85)', backdropFilter: 'blur(12px)' }} onClick={() => { setShowHistory(false); setActiveHistoryScan(null) }} />
          <div style={{
            position: 'relative', zIndex: 1, marginLeft: 'auto',
            width: '100%', maxWidth: 560, height: '100%',
            background: 'rgba(6,6,22,0.99)', borderLeft: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ color: C.cyan, fontWeight: 900, fontSize: 18, margin: 0 }}>◷ Scan History</h2>
                <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 2 }}>{savedScans.length} saved scan{savedScans.length !== 1 ? 's' : ''}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {savedScans.length > 0 && !activeHistoryScan && (
                  <button onClick={deleteScans} style={{ fontSize: 10, padding: '6px 12px', borderRadius: 10, background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.2)', color: C.red, cursor: 'pointer', fontWeight: 700 }}>Clear All</button>
                )}
                {activeHistoryScan && (
                  <button onClick={() => setActiveHistoryScan(null)} style={{ fontSize: 10, padding: '6px 12px', borderRadius: 10, background: 'rgba(0,240,255,0.06)', border: `1px solid ${C.border}`, color: C.textSecondary, cursor: 'pointer', fontWeight: 700 }}>← Back</button>
                )}
                <button onClick={() => { setShowHistory(false); setActiveHistoryScan(null) }} style={{ fontSize: 16, width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {savedScans.length === 0 ? (
                <p style={{ color: C.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 40 }}>No scans saved yet.</p>
              ) : activeHistoryScan ? (
                <ScanReport scan={activeHistoryScan} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {savedScans.map(s => {
                    const d = new Date(s.scannedAt)
                    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                    return (
                      <button key={s.id} onClick={() => setActiveHistoryScan(s)} style={{
                        width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 16, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
                        transition: 'all 0.15s',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <p style={{ color: C.textPrimary, fontWeight: 700, fontSize: 13 }}>{dateStr} · {timeStr}</p>
                            <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 2 }}>{s.gamesAnalyzed} games · ${s.bankroll} bankroll</p>
                          </div>
                          <span style={{ color: C.purple, fontSize: 18 }}>›</span>
                        </div>
                        <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 8, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                          {s.report.replace(/\*\*/g, '').split('\n').find(l => l.trim().length > 20) || ''}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Calls Tracker Drawer ── */}
      {showTracker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,2,15,0.85)', backdropFilter: 'blur(12px)' }} onClick={() => setShowTracker(false)} />
          <div style={{
            position: 'relative', zIndex: 1, marginLeft: 'auto',
            width: '100%', maxWidth: 600, height: '100%',
            background: 'rgba(6,6,22,0.99)', borderLeft: `1px solid ${C.border}`,
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Drawer header */}
            <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h2 style={{ color: C.green, fontWeight: 900, fontSize: 18, margin: 0 }}>📊 Calls Tracker</h2>
                <p style={{ color: C.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {trackedCalls.length} total · {pendingCount} pending
                  {stats.settled > 0 ? ` · ${fmtPct(stats.wins / (stats.wins + stats.losses || 1))} win rate` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {trackedCalls.length > 0 && (
                  <button onClick={() => {
                    deleteCalls()
                    setTrackedCalls([])
                  }} style={{ fontSize: 10, padding: '6px 12px', borderRadius: 10, background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.2)', color: C.red, cursor: 'pointer', fontWeight: 700 }}>Clear All</button>
                )}
                <button onClick={() => setShowTracker(false)} style={{ fontSize: 16, width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>

            {/* Stats summary inside drawer */}
            {stats.settled > 0 && (
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { label: 'RECORD', val: `${stats.wins}W-${stats.losses}L${stats.pushes > 0 ? `-${stats.pushes}P` : ''}`, color: C.textPrimary },
                    { label: 'WIN%', val: fmtPct(stats.wins / (stats.wins + stats.losses || 1)), color: stats.winRate >= 0.55 ? C.green : stats.winRate >= 0.45 ? C.gold : C.red },
                    { label: 'P&L', val: fmtUnits(stats.totalPnL), color: stats.totalPnL >= 0 ? C.green : C.red },
                    { label: 'ROI', val: fmtPct(stats.roi), color: stats.roi >= 0 ? C.green : C.red },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center' }}>
                      <p style={{ color: s.color, fontWeight: 900, fontSize: 14 }}>{s.val}</p>
                      <p style={{ color: C.textSecondary, fontSize: 8, letterSpacing: '0.12em', marginTop: 1 }}>{s.label}</p>
                    </div>
                  ))}
                </div>
                {/* Mini ROI chart in drawer */}
                <div style={{ marginTop: 10, padding: '8px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}` }}>
                  <RoiSparkline calls={trackedCalls} />
                </div>
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <CallsTracker calls={trackedCalls} onUpdate={setTrackedCalls} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Scan Report Renderer ──────────────────────────────────────────────────────
function ScanReport({ scan }: { scan: SavedScan }) {
  const d = new Date(scan.scannedAt)
  return (
    <div>
      <p style={{ color: C.textSecondary, fontSize: 11, marginBottom: 16 }}>
        {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${scan.bankroll} bankroll · {scan.gamesAnalyzed} games
      </p>
      {scan.report.split('\n').map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} style={{ height: 8 }} />
        const parts = t.split(/\*\*(.*?)\*\*/g)
        const rendered = parts.map((p, j) =>
          j % 2 === 1 ? <span key={j} style={{ color: '#e0d0ff', fontWeight: 800 }}>{p}</span> : <span key={j}>{p}</span>
        )
        if (t.toLowerCase().includes('top pick') || t.includes('⚡')) {
          return <div key={i} style={{ margin: '12px 0 6px', padding: '12px 14px', borderRadius: 12, background: 'rgba(0,240,255,0.07)', border: '1px solid rgba(0,240,255,0.2)', color: C.cyan, fontWeight: 800, fontSize: 13 }}>{rendered}</div>
        }
        if (t.includes('STRONG BET')) return <p key={i} style={{ color: C.green, fontWeight: 700, marginBottom: 2, fontSize: 13 }}>{rendered}</p>
        if (t.includes('PASS')) return <p key={i} style={{ color: C.textSecondary, marginBottom: 2, fontSize: 13 }}>{rendered}</p>
        if (t.includes('LEAN')) return <p key={i} style={{ color: C.gold, fontWeight: 600, marginBottom: 2, fontSize: 13 }}>{rendered}</p>
        return <p key={i} style={{ color: 'rgba(180,210,255,0.75)', marginBottom: 2, fontSize: 13, lineHeight: 1.7 }}>{rendered}</p>
      })}
    </div>
  )
}
