'use client'

import { useEffect, useState } from 'react'

const C = {
  cyan:    '#00f0ff',
  purple:  '#a855f7',
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

function fmt(n: number) { return (n * 100).toFixed(1) + '¢' }
function fmtEdge(n: number) { return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '¢' }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function EdgeBar({ edge }: { edge: number }) {
  const pct = Math.min(Math.abs(edge) * 500, 100)
  const color = edge >= 0.07 ? C.green : edge >= 0.04 ? C.gold : edge >= 0.02 ? '#f97316' : C.red
  return (
    <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, boxShadow: `0 0 6px ${color}88`, borderRadius: 2, transition: 'width 0.5s' }} />
    </div>
  )
}

export default function BotPage() {
  const [data, setData] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'edge'>('all')
  const [narratives, setNarratives] = useState<Record<string, NarrativeSignal | 'loading' | 'error'>>({})

  async function scan() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/bot/scan')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
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

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.textPrimary, fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative' }}>
      {/* Grid */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(rgba(0,240,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.03) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,255,136,0.05) 0%, transparent 70%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '40px 16px 80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <a href="/" style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.15em', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>← BACK</a>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>
              ⬡ <span style={{ color: C.green, textShadow: `0 0 20px ${C.green}55` }}>EDGE SCANNER</span>
            </h1>
            <p style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.06em', marginTop: 4 }}>Polymarket vs DraftKings · Paper Trading</p>
          </div>
          <button onClick={scan} disabled={loading} style={{
            padding: '8px 16px', borderRadius: 12, fontSize: 11, fontWeight: 800,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            background: 'rgba(0,255,136,0.08)', border: `1px solid rgba(0,255,136,0.25)`,
            color: loading ? C.textSecondary : C.green, transition: 'all 0.2s',
          }}>
            {loading ? '⟳ SCANNING…' : '⟳ REFRESH'}
          </button>
        </div>

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

        {data && <p style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.08em', marginBottom: 16 }}>Last scan: {new Date(data.scannedAt).toLocaleTimeString()}</p>}

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
            return (
              <div key={s.gameId} style={{
                borderRadius: 24, overflow: 'visible', position: 'relative',
                background: C.card, backdropFilter: 'blur(24px)',
                border: `1px solid ${hasEdge ? 'rgba(0,240,255,0.3)' : C.border}`,
                boxShadow: hasEdge ? `0 0 40px rgba(0,240,255,0.07), 0 8px 40px rgba(0,0,0,0.6)` : `0 4px 40px rgba(0,0,0,0.5)`,
              }}>
                {/* Top accent */}
                <div style={{
                  position: 'absolute', top: 0, left: 24, right: 24, height: 1,
                  background: hasEdge
                    ? `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`
                    : `linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)`,
                }} />

                <div style={{ padding: 20 }}>
                  {/* Game header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                    <div>
                      <p style={{ color: C.textPrimary, fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em' }}>{s.gameName}</p>
                      <p style={{ color: C.textSecondary, fontSize: 10, marginTop: 2, letterSpacing: '0.06em' }}>{fmtTime(s.gameTime)}</p>
                    </div>
                    {hasEdge && (
                      <div style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                        background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.borderHot}`,
                        color: C.cyan, whiteSpace: 'nowrap', boxShadow: `0 0 12px ${C.cyan}22`,
                        letterSpacing: '0.05em',
                      }}>{fmtEdge(s.bestEdge)} edge</div>
                    )}
                  </div>

                  {/* Odds grid */}
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

                  {/* Recommendation */}
                  {hasEdge && (
                    <div style={{ borderRadius: 12, padding: '10px 14px', background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.2)', marginBottom: 14 }}>
                      <p style={{ color: '#86efac', fontSize: 12, fontWeight: 600 }}>{s.recommendation}</p>
                    </div>
                  )}

                  {/* Narrative scanner */}
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
    </div>
  )
}
