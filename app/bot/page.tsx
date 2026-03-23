'use client'

import { useEffect, useState } from 'react'

interface NarrativeSignal {
  signals: {
    type: string
    severity: 'high' | 'medium' | 'low'
    team: string
    direction: 'favors_away' | 'favors_home' | 'neutral'
    summary: string
  }[]
  overallEdge: 'away' | 'home' | 'none'
  edgeConfidence: number
  aiSummary: string
}

interface Signal {
  gameId: string
  gameName: string
  gameTime: string
  status: string
  dkAwayML: string
  dkHomeML: string
  dkAwayImplied: number
  dkHomeImplied: number
  polyEventTitle: string
  polyEventUrl: string
  polyConditionId: string
  polyAwayTeam: string
  polyHomeTeam: string
  polyAwayPrice: number
  polyHomePrice: number
  awayEdge: number
  homeEdge: number
  bestSide: 'away' | 'home' | 'none'
  bestEdge: number
  recommendation: string
}

interface ScanResult {
  scannedAt: string
  gamesScanned: number
  polyMarketsFound: number
  edgeSignals: number
  signals: Signal[]
}

function EdgeBar({ edge }: { edge: number }) {
  const pct = Math.min(Math.abs(edge) * 100 * 5, 100) // scale: 20¢ = 100%
  const color = edge >= 0.07 ? '#22c55e' : edge >= 0.04 ? '#eab308' : edge >= 0.02 ? '#f97316' : '#ef4444'
  return (
    <div className="relative h-1.5 rounded-full bg-white/10 w-full overflow-hidden">
      <div style={{ width: `${pct}%`, background: color }} className="h-full rounded-full transition-all" />
    </div>
  )
}

function fmt(n: number) { return (n * 100).toFixed(1) + '¢' }
function fmtEdge(n: number) { return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '¢' }
function fmtTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

export default function BotPage() {
  const [data, setData] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'edge'>('all')
  const [narratives, setNarratives] = useState<Record<string, NarrativeSignal | 'loading' | 'error'>>({})

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
    } catch {
      setNarratives(prev => ({ ...prev, [s.gameId]: 'error' }))
    }
  }

  async function scan() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bot/scan')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { scan() }, [])

  const signals = data?.signals || []
  const displayed = filter === 'edge' ? signals.filter(s => s.bestSide !== 'none') : signals

  return (
    <div className="min-h-screen text-white" style={{
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div className="px-4 pt-10 pb-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🤖 NBA Edge Scanner</h1>
            <p className="text-sm text-white/50 mt-0.5">Polymarket vs DraftKings — paper trading only</p>
          </div>
          <button
            onClick={scan}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            {loading ? '⟳ Scanning…' : '⟳ Refresh'}
          </button>
        </div>

        {data && (
          <div className="flex gap-3 mt-4 flex-wrap">
            {[
              { label: 'Games scanned', val: data.gamesScanned },
              { label: 'Poly markets', val: data.polyMarketsFound },
              { label: 'Edge signals', val: data.edgeSignals, highlight: data.edgeSignals > 0 },
            ].map(s => (
              <div key={s.label} className="flex-1 min-w-[90px] rounded-2xl px-4 py-3 text-center"
                style={{ background: s.highlight ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${s.highlight ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}` }}>
                <p className="text-xl font-bold" style={{ color: s.highlight ? '#22c55e' : 'white' }}>{s.val}</p>
                <p className="text-[10px] text-white/50 uppercase tracking-wider mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {data && (
          <p className="text-[10px] text-white/30 mt-3">Last scan: {new Date(data.scannedAt).toLocaleTimeString()}</p>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-4 max-w-2xl mx-auto mb-4">
        <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {(['edge', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: filter === f ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: filter === f ? 'white' : 'rgba(255,255,255,0.4)'
              }}>
              {f === 'edge' ? '🎯 Edge only' : '📋 All games'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 max-w-2xl mx-auto pb-16 space-y-3">
        {error && (
          <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-red-400 text-sm">Error: {error}</p>
          </div>
        )}

        {loading && !data && (
          <div className="text-center py-16 text-white/30 text-sm">Scanning markets…</div>
        )}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-16 text-white/30 text-sm">
            {filter === 'edge' ? 'No edge signals right now. Check back closer to tip-off.' : 'No games found today.'}
          </div>
        )}

        {displayed.map(s => {
          const hasEdge = s.bestSide !== 'none'
          return (
            <div key={s.gameId} className="rounded-3xl overflow-hidden"
              style={{
                background: hasEdge ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${hasEdge ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}`,
              }}>
              {/* Game header */}
              <div className="px-5 pt-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-base leading-tight">{s.gameName}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">{fmtTime(s.gameTime)}</p>
                  </div>
                  {hasEdge && (
                    <div className="shrink-0 px-3 py-1 rounded-full text-xs font-bold"
                      style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e' }}>
                      {fmtEdge(s.bestEdge)} edge
                    </div>
                  )}
                </div>
              </div>

              {/* Odds grid */}
              <div className="px-5 pb-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {[
                    { team: s.polyAwayTeam, ml: s.dkAwayML, dkImplied: s.dkAwayImplied, polyPrice: s.polyAwayPrice, edge: s.awayEdge, isBest: s.bestSide === 'away' },
                    { team: s.polyHomeTeam, ml: s.dkHomeML, dkImplied: s.dkHomeImplied, polyPrice: s.polyHomePrice, edge: s.homeEdge, isBest: s.bestSide === 'home' },
                  ].map((side) => (
                    <div key={side.team} className="rounded-2xl p-3"
                      style={{
                        background: side.isBest ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${side.isBest ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      }}>
                      <p className="text-[10px] text-white/50 uppercase tracking-wider mb-1 truncate">{side.team}</p>
                      <div className="flex items-baseline gap-1 mb-1">
                        <span className="text-base font-bold">{fmt(side.polyPrice)}</span>
                        <span className="text-[10px] text-white/30">poly</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-white/40 mb-2">
                        <span>DK {side.ml}</span>
                        <span>{fmt(side.dkImplied)} implied</span>
                      </div>
                      <EdgeBar edge={side.edge} />
                      <p className="text-[10px] mt-1.5 font-semibold"
                        style={{ color: side.edge >= 0.03 ? '#22c55e' : side.edge >= 0 ? '#eab308' : '#ef4444' }}>
                        {fmtEdge(side.edge)}
                        {side.isBest && ' 🎯'}
                      </p>
                    </div>
                  ))}
                </div>

                {hasEdge && (
                  <div className="rounded-xl px-3 py-2 text-[11px] font-medium"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#86efac' }}>
                    {s.recommendation}
                  </div>
                )}

                {/* Narrative signals */}
                {(() => {
                  const n = narratives[s.gameId]
                  if (!n) return (
                    <button onClick={() => analyzeGame(s)}
                      className="w-full mt-2 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                      🧠 Scan for narrative edges (injuries, motivation, revenge games…)
                    </button>
                  )
                  if (n === 'loading') return (
                    <div className="mt-2 py-3 text-center text-xs text-white/40">🧠 Analyzing news &amp; signals…</div>
                  )
                  if (n === 'error') return (
                    <div className="mt-2 py-2 text-center text-xs text-red-400/60">Analysis failed. Try again.</div>
                  )
                  const sev = { high: '#ef4444', medium: '#eab308', low: '#6b7280' }
                  const dirLabel = { favors_away: `▲ ${s.gameName.split(' @ ')[0]}`, favors_home: `▲ ${s.gameName.split(' @ ')[1]}`, neutral: '— Neutral' }
                  return (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                      {n.signals.length === 0 ? (
                        <p className="text-[11px] text-white/30 italic">No significant signals found.</p>
                      ) : n.signals.map((sig, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                            style={{ background: `${sev[sig.severity]}22`, color: sev[sig.severity] }}>
                            {sig.severity}
                          </span>
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: sig.direction === 'neutral' ? 'rgba(255,255,255,0.5)' : '#c4b5fd' }}>
                              {sig.type.toUpperCase()} · {dirLabel[sig.direction]}
                            </p>
                            <p className="text-[11px] text-white/60 leading-snug">{sig.summary}</p>
                          </div>
                        </div>
                      ))}
                      <div className="mt-2 rounded-xl px-3 py-2" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                        <p className="text-[11px] text-purple-300 leading-snug">{n.aiSummary}</p>
                        {n.overallEdge !== 'none' && (
                          <p className="text-[10px] font-bold mt-1" style={{ color: '#a78bfa' }}>
                            Narrative edge: {n.overallEdge === 'away' ? s.gameName.split(' @ ')[0] : s.gameName.split(' @ ')[1]} ({n.edgeConfidence}% confidence)
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })()}

                <div className="mt-2 flex gap-2">
                  <a href={s.polyEventUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-white/30 hover:text-white/60 transition-colors">
                    View on Polymarket ↗
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
