'use client'

import { useState, useEffect, useCallback } from 'react'

interface Team {
  name: string; abbr: string; record: string; score: string; logo: string; color: string
}
interface Game {
  id: string
  homeTeam: Team; awayTeam: Team
  gameTime: string; gameDate: string; status: 'pre' | 'in' | 'post'
  homeWinOdds: number; awayWinOdds: number; hasWinnerOdds: boolean
  spreadLine: number; spreadHomeOdds: number; spreadAwayOdds: number
  spreadFavoriteTeam: string; hasSpreadOdds: boolean
  totalLine: number; overOdds: number; underOdds: number; hasTotalOdds: boolean
  dkSpread: number | null; dkTotal: number | null; dkDetails: string; hasDkOdds: boolean
  polyWinnerUrl: string | null; polySpreadUrl: string | null; polyTotalUrl: string | null
  venue: { name: string; location: string } | null
}
interface BetLog {
  id: string; gameId: string; matchup: string; betType: string
  betLabel: string; odds: number; stake: number; result: 'pending' | 'win' | 'loss'
  createdAt: string
}

const pct = (v: number) => Math.round(v * 100)

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  cyan:    '#00f0ff',
  purple:  '#a855f7',
  green:   '#00ff88',
  red:     '#ff4466',
  gold:    '#ffd700',
  bg:      '#02020f',
  card:    'rgba(8,8,28,0.85)',
  border:  'rgba(0,240,255,0.12)',
  borderHot: 'rgba(0,240,255,0.45)',
  textPrimary: '#dde8ff',
  textSecondary: 'rgba(180,200,255,0.45)',
}

// ─── Glow Card ────────────────────────────────────────────────────────────────
function GlowCard({ children, className = '', hot = false, color = C.cyan }: {
  children: React.ReactNode; className?: string; hot?: boolean; color?: string
}) {
  const borderColor = hot ? color : C.border
  const shadow = hot
    ? `0 0 30px ${color}22, 0 4px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)`
    : `0 4px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)`
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${borderColor}`,
      boxShadow: shadow,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
    }} className={`rounded-3xl ${className}`}>
      {children}
    </div>
  )
}

// ─── Odds Chip ────────────────────────────────────────────────────────────────
function OddsChip({ top, bottom, hot, href, onClick }: {
  top: string; bottom: string; hot: boolean; href?: string | null; onClick?: () => void
}) {
  const bg = hot
    ? `linear-gradient(135deg, rgba(0,240,255,0.2) 0%, rgba(168,85,247,0.2) 100%)`
    : `rgba(255,255,255,0.04)`
  const border = hot ? C.borderHot : C.border
  const textColor = hot ? C.cyan : C.textPrimary
  const glow = hot ? `0 0 16px ${C.cyan}44` : 'none'

  const cls = `flex flex-col items-center justify-center rounded-2xl px-2 py-2.5 min-w-[72px] transition-all cursor-pointer active:scale-95`
  const content = (
    <>
      <span style={{ color: C.textSecondary, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{top}</span>
      <span style={{ color: textColor, fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', textShadow: hot ? `0 0 12px ${C.cyan}` : 'none' }}>{bottom}%</span>
      {href && <span style={{ color: C.textSecondary, fontSize: 8, marginTop: 2, letterSpacing: '0.1em' }}>TRADE ↗</span>}
    </>
  )
  const style = { background: bg, border: `1px solid ${border}`, boxShadow: glow }
  if (href) return <a href={href} target="_blank" rel="noopener" className={cls} style={style}>{content}</a>
  return <div className={cls} style={style} onClick={onClick}>{content}</div>
}

// ─── Bet Modal ────────────────────────────────────────────────────────────────
function BetModal({ game, betType, betLabel, odds, onClose, onSave }: {
  game: Game; betType: string; betLabel: string; odds: number
  onClose: () => void; onSave: (bet: BetLog) => void
}) {
  const [stake, setStake] = useState('10')
  const payout = (parseFloat(stake) || 0) / odds
  const profit = payout - (parseFloat(stake) || 0)
  const save = () => {
    onSave({
      id: crypto.randomUUID(), gameId: game.id,
      matchup: `${game.awayTeam.abbr} @ ${game.homeTeam.abbr}`,
      betType, betLabel, odds, stake: parseFloat(stake) || 0,
      result: 'pending', createdAt: new Date().toISOString(),
    })
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(2,2,15,0.85)', backdropFilter: 'blur(12px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-6" style={{ background: 'rgba(8,8,32,0.98)', border: `1px solid ${C.border}`, borderBottom: 'none', boxShadow: `0 -20px 60px rgba(0,240,255,0.08)` }} onClick={e => e.stopPropagation()}>
        <div className="w-8 h-0.5 rounded-full mx-auto mb-5" style={{ background: C.border }} />
        <p style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{game.awayTeam.abbr} @ {game.homeTeam.abbr}</p>
        <h3 style={{ color: C.textPrimary, fontWeight: 800, fontSize: 18, marginTop: 4 }}>{betLabel}</h3>
        <p style={{ color: C.cyan, fontSize: 13, marginTop: 4 }}>{pct(odds)}% implied probability</p>
        <div className="mt-6 mb-3">
          <label style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Stake (USDC)</label>
          <input
            type="number" value={stake} onChange={e => setStake(e.target.value)}
            className="w-full mt-2 text-center text-2xl font-bold focus:outline-none"
            style={{ background: 'rgba(0,240,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '12px', color: C.cyan, caretColor: C.cyan }}
          />
        </div>
        <div className="flex justify-between mb-6" style={{ fontSize: 12, color: C.textSecondary }}>
          <span>Return: <span style={{ color: C.textPrimary }}>${payout.toFixed(2)}</span></span>
          <span>Net profit: <span style={{ color: C.green }}>+${profit.toFixed(2)}</span></span>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl font-semibold transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textSecondary }}>Cancel</button>
          <button onClick={save} className="flex-1 py-3 rounded-2xl font-bold transition-all" style={{ background: `linear-gradient(135deg, rgba(0,240,255,0.2), rgba(168,85,247,0.2))`, border: `1px solid ${C.borderHot}`, color: C.cyan, boxShadow: `0 0 20px ${C.cyan}22` }}>Log Bet</button>
        </div>
      </div>
    </div>
  )
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────
function parseAnalysis(text: string): { title: string; emoji: string; content: string }[] {
  const lines = text.split('\n')
  const sections: { title: string; emoji: string; content: string }[] = []
  let current: { title: string; emoji: string; lines: string[] } | null = null
  for (const line of lines) {
    const m = line.match(/^###(\S+)\s+(.+)$/)
    if (m) {
      if (current && current.lines.join('\n').trim().length > 3)
        sections.push({ emoji: current.emoji, title: current.title, content: current.lines.join('\n').trim() })
      current = { emoji: m[1], title: m[2].trim(), lines: [] }
    } else if (current) { current.lines.push(line) }
  }
  if (current && current.lines.join('\n').trim().length > 3)
    sections.push({ emoji: current.emoji, title: current.title, content: current.lines.join('\n').trim() })
  return sections.length ? sections : [{ title: 'Analysis', emoji: '◈', content: text }]
}

function AnalysisModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamA: game.awayTeam.name, teamB: game.homeTeam.name,
        polyOddsA: pct(game.awayWinOdds), polyOddsB: pct(game.homeWinOdds),
        recordA: game.awayTeam.record, recordB: game.homeTeam.record,
      }),
    })
      .then(r => r.json())
      .then(d => { setAnalysis(d.analysis || d.error || 'No analysis available'); setLoading(false) })
      .catch(() => { setAnalysis('Failed.'); setLoading(false) })
  }, [])

  const sections = analysis ? parseAnalysis(analysis) : []

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(2,2,15,0.96)', backdropFilter: 'blur(24px)' }}>
      {/* Scan line effect */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.015) 2px, rgba(0,240,255,0.015) 4px)',
      }} />
      <div className="flex items-center justify-between px-5 pt-8 pb-4 max-w-lg mx-auto w-full flex-shrink-0" style={{ position: 'relative', zIndex: 1 }}>
        <div>
          <p style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{game.awayTeam.abbr} @ {game.homeTeam.abbr}</p>
          <h3 style={{ color: C.cyan, fontWeight: 900, fontSize: 18, letterSpacing: '-0.02em', textShadow: `0 0 20px ${C.cyan}55` }}>◈ INTELLIGENCE BRIEF</h3>
        </div>
        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,240,255,0.07)', border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-12 max-w-lg mx-auto w-full" style={{ position: 'relative', zIndex: 1 }}>
        {loading ? (
          <div className="flex flex-col gap-2 mt-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-12 rounded-2xl animate-pulse" style={{ background: 'rgba(0,240,255,0.04)', border: `1px solid ${C.border}` }} />
            ))}
            <p style={{ color: C.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 8, letterSpacing: '0.1em' }}>PROCESSING INTELLIGENCE…</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            {sections.map((s, i) => {
              const isOpen = expanded === i
              const isPick = s.title === 'The Pick'
              return (
                <div key={i} className="rounded-2xl overflow-hidden transition-all" style={{
                  background: isPick ? 'rgba(0,240,255,0.06)' : isOpen ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isPick ? C.borderHot : isOpen ? 'rgba(168,85,247,0.3)' : C.border}`,
                  boxShadow: isPick ? `0 0 20px ${C.cyan}15` : 'none',
                }}>
                  <button className="w-full flex items-center justify-between px-4 py-3.5 text-left" onClick={() => setExpanded(prev => prev === i ? null : i)}>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 15 }}>{s.emoji}</span>
                      <span style={{ color: isPick ? C.cyan : C.textPrimary, fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>{s.title}</span>
                    </div>
                    <span style={{ color: C.textSecondary, fontSize: 10, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▾</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4" style={{ borderTop: `1px solid ${C.border}` }}>
                      <div className="flex flex-col gap-1.5 mt-3">
                        {s.content.split('\n').filter(l => l.trim()).map((line, j) => {
                          const t = line.trim()
                          if (t.startsWith('•') || t.startsWith('-') || t.startsWith('*')) {
                            return (
                              <div key={j} className="flex gap-2">
                                <span style={{ color: C.cyan, opacity: 0.5, flexShrink: 0, marginTop: 2 }}>◆</span>
                                <p style={{ color: C.textPrimary, fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>{t.replace(/^[•\-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}</p>
                              </div>
                            )
                          }
                          return <p key={j} style={{ color: C.textPrimary, fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>{t.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bet Tracker ──────────────────────────────────────────────────────────────
function BetTracker({ bets, onUpdate, onClose }: {
  bets: BetLog[]; onUpdate: (bets: BetLog[]) => void; onClose: () => void
}) {
  const setResult = (id: string, result: 'win' | 'loss') =>
    onUpdate(bets.map(b => b.id === id ? { ...b, result } : b))
  const remove = (id: string) => onUpdate(bets.filter(b => b.id !== id))

  const pending = bets.filter(b => b.result === 'pending')
  const settled = bets.filter(b => b.result !== 'pending')
  const totalStaked = settled.reduce((s, b) => s + b.stake, 0)
  const totalPnl = settled.reduce((s, b) => b.result === 'win' ? s + (b.stake / b.odds - b.stake) : s - b.stake, 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(2,2,15,0.96)', backdropFilter: 'blur(24px)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.015) 2px, rgba(0,240,255,0.015) 4px)' }} />
      <div className="flex-1 overflow-y-auto max-w-lg w-full mx-auto px-5 py-8" style={{ position: 'relative', zIndex: 1 }}>
        <button onClick={onClose} style={{ color: C.textSecondary, fontSize: 12, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>← CLOSE</button>
        <h3 style={{ color: C.cyan, fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', textShadow: `0 0 20px ${C.cyan}55` }}>◈ BET TRACKER</h3>

        {settled.length > 0 && (
          <div className="mt-4 mb-6 rounded-2xl p-4 grid grid-cols-3 text-center" style={{ background: 'rgba(0,240,255,0.04)', border: `1px solid ${C.border}` }}>
            {[['BETS', settled.length, C.textPrimary], ['STAKED', `$${totalStaked.toFixed(0)}`, C.textPrimary], ['P&L', `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, totalPnl >= 0 ? C.green : C.red]].map(([label, val, color]) => (
              <div key={String(label)}>
                <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</p>
                <p style={{ color: String(color), fontWeight: 800, fontSize: 20, marginTop: 2 }}>{val}</p>
              </div>
            ))}
          </div>
        )}

        {pending.length > 0 && (
          <>
            <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>Pending</p>
            {pending.map(b => (
              <div key={b.id} className="rounded-2xl p-4 mb-2" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p style={{ color: C.textPrimary, fontWeight: 700, fontSize: 13 }}>{b.betLabel}</p>
                    <p style={{ color: C.textSecondary, fontSize: 11 }}>{b.matchup} · ${b.stake}</p>
                  </div>
                  <button onClick={() => remove(b.id)} style={{ color: C.textSecondary, fontSize: 12 }}>✕</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setResult(b.id, 'win')} className="flex-1 py-2 rounded-xl font-bold transition-all" style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: C.green, fontSize: 12 }}>WIN</button>
                  <button onClick={() => setResult(b.id, 'loss')} className="flex-1 py-2 rounded-xl font-bold transition-all" style={{ background: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.3)', color: C.red, fontSize: 12 }}>LOSS</button>
                </div>
              </div>
            ))}
          </>
        )}

        {settled.length > 0 && (
          <>
            <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10, marginTop: 20 }}>Settled</p>
            {settled.map(b => (
              <div key={b.id} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 600 }}>{b.betLabel}</p>
                  <p style={{ color: C.textSecondary, fontSize: 10 }}>{b.matchup} · ${b.stake}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 12, fontWeight: 700, color: b.result === 'win' ? C.green : C.red }}>
                    {b.result === 'win' ? `+$${(b.stake / b.odds - b.stake).toFixed(2)}` : `-$${b.stake}`}
                  </span>
                  <button onClick={() => remove(b.id)} style={{ color: C.textSecondary, fontSize: 10 }}>✕</button>
                </div>
              </div>
            ))}
          </>
        )}

        {bets.length === 0 && (
          <div className="text-center py-16">
            <p style={{ color: C.textSecondary, fontSize: 14 }}>No bets logged</p>
            <p style={{ color: C.textSecondary, opacity: 0.5, fontSize: 11, marginTop: 6, letterSpacing: '0.05em' }}>Tap any odds chip to log a position</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Game Card ────────────────────────────────────────────────────────────────
function GameCard({ game, onLogBet }: { game: Game; onLogBet: (bet: Omit<BetLog, 'id' | 'createdAt' | 'stake' | 'result'>) => void }) {
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [betDraft, setBetDraft] = useState<{ betType: string; betLabel: string; odds: number } | null>(null)
  const [showEdgeInfo, setShowEdgeInfo] = useState(false)
  const isLive = game.status === 'in'
  const isFinal = game.status === 'post'

  const homeSpreadLabel = game.spreadLine < 0 ? `${game.spreadLine}` : `+${game.spreadLine}`
  const awaySpreadLabel = game.spreadLine < 0 ? `+${-game.spreadLine}` : `${-game.spreadLine}`
  const awaySpreadOdds = game.spreadLine < 0 ? game.spreadAwayOdds : game.spreadHomeOdds
  const homeSpreadOdds = game.spreadLine < 0 ? game.spreadHomeOdds : game.spreadAwayOdds

  const dkSpreadDiff = game.hasDkOdds && game.hasSpreadOdds && game.dkSpread != null ? Math.abs(game.spreadLine - game.dkSpread) : 0
  const dkTotalDiff = game.hasDkOdds && game.hasTotalOdds && game.dkTotal != null ? Math.abs(game.totalLine - game.dkTotal) : 0
  const hasEdge = dkSpreadDiff >= 1.5 || dkTotalDiff >= 2

  return (
    <>
      {/* Hologram projector wrapper */}
      <div className="mb-6" style={{ position: 'relative' }}>

        {/* Projection beam — cone of light rising from base */}
        <div style={{
          position: 'absolute', bottom: -2, left: '10%', right: '10%', height: '100%',
          background: `linear-gradient(180deg, transparent 0%, rgba(0,240,255,0.04) 60%, rgba(0,240,255,0.12) 100%)`,
          clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
          pointerEvents: 'none', zIndex: 0,
          animation: 'holo-beam-pulse 3s ease-in-out infinite',
        }} />

        {/* The holographic card */}
        <div className="holo-card holo-sweep rounded-3xl overflow-hidden transition-all" style={{
          position: 'relative', zIndex: 1,
          background: isLive
            ? 'rgba(255,20,20,0.04)'
            : hasEdge
              ? 'rgba(0,240,255,0.04)'
              : 'rgba(0,220,255,0.03)',
          border: `1px solid ${isLive ? 'rgba(255,68,102,0.35)' : hasEdge ? 'rgba(0,240,255,0.45)' : 'rgba(0,240,255,0.18)'}`,
          boxShadow: isLive
            ? `0 0 30px rgba(255,68,102,0.1), inset 0 0 60px rgba(255,68,102,0.03)`
            : hasEdge
              ? `0 0 40px rgba(0,240,255,0.12), inset 0 0 80px rgba(0,240,255,0.04)`
              : `0 0 20px rgba(0,240,255,0.06), inset 0 0 60px rgba(0,240,255,0.02)`,
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}>
          {/* Horizontal scanlines overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,240,255,0.025) 3px, rgba(0,240,255,0.025) 4px)',
            borderRadius: 'inherit',
          }} />

          {/* Top glow edge */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: isLive
              ? `linear-gradient(90deg, transparent, ${C.red} 30%, ${C.red} 70%, transparent)`
              : `linear-gradient(90deg, transparent, ${C.cyan} 20%, rgba(0,240,255,0.9) 50%, ${C.cyan} 80%, transparent)`,
            boxShadow: `0 0 12px ${isLive ? C.red : C.cyan}`,
            animation: 'holo-glow-pulse 3s ease-in-out infinite',
          }} />

          {/* Bottom glow edge */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent, rgba(0,240,255,0.4) 30%, rgba(0,240,255,0.4) 70%, transparent)`,
          }} />

        <div className="p-5">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {isLive && (
                <div className="flex items-center gap-1.5">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, boxShadow: `0 0 8px ${C.red}`, display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                  <span style={{ color: C.red, fontSize: 10, fontWeight: 800, letterSpacing: '0.15em' }}>LIVE</span>
                  <span style={{ color: C.textSecondary, fontSize: 10 }}>· {game.gameTime}</span>
                </div>
              )}
              {!isLive && !isFinal && <span style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.06em' }}>{game.gameTime}</span>}
              {isFinal && <span style={{ color: C.textSecondary, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Final</span>}
              {hasEdge && (
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowEdgeInfo(v => !v)} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                    padding: '3px 8px', borderRadius: 8,
                    background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.borderHot}`,
                    color: C.cyan, textTransform: 'uppercase',
                    boxShadow: `0 0 12px ${C.cyan}22`, cursor: 'pointer'
                  }}>⚡ LINE GAP</button>
                  {showEdgeInfo && (
                    <div style={{
                      position: 'absolute', left: 0, top: 30, zIndex: 30, width: 280,
                      background: 'rgba(8,8,32,0.98)', border: `1px solid ${C.borderHot}`,
                      borderRadius: 16, padding: 16,
                      boxShadow: `0 0 40px rgba(0,240,255,0.15), 0 16px 40px rgba(0,0,0,0.8)`,
                    }}>
                      <p style={{ color: C.cyan, fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ POLYMARKET LINE DISCREPANCY</p>
                      <p style={{ color: C.textPrimary, fontSize: 12, lineHeight: 1.6, opacity: 0.8, marginBottom: 10 }}>Polymarket's line differs significantly from DraftKings. This gap is a potential edge.</p>
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                        <p style={{ color: C.textSecondary, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>How to exploit it:</p>
                        {['Bet the DK-aligned side on Polymarket — sharp books set sharper lines.', 'Arbitrage: bet both sides across platforms to lock guaranteed profit.', 'Move fast — these gaps close within hours.'].map((t, i) => (
                          <div key={i} className="flex gap-2 mb-1.5">
                            <span style={{ color: C.cyan, opacity: 0.5, flexShrink: 0, fontSize: 10 }}>◆</span>
                            <p style={{ color: C.textPrimary, fontSize: 11, lineHeight: 1.5, opacity: 0.75 }}>{t}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setShowAnalysis(true)} style={{
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '4px 12px', borderRadius: 10, fontWeight: 700,
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)',
              color: C.purple, cursor: 'pointer', transition: 'all 0.2s',
            }}>◈ Analyze</button>
          </div>

          {/* Teams */}
          {(isLive || isFinal) ? (
            <div className="flex items-center justify-between px-1 mb-4">
              <div className="flex items-center gap-2.5">
                {game.awayTeam.logo
                  ? <img src={game.awayTeam.logo} style={{ width: 36, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.3))' }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 10, fontWeight: 800 }}>{game.awayTeam.abbr.slice(0,2)}</div>}
                <span style={{ color: C.textPrimary, fontSize: 28, fontWeight: 900 }}>{game.awayTeam.score}</span>
              </div>
              <span style={{ color: C.textSecondary, fontSize: 12 }}>—</span>
              <div className="flex items-center gap-2.5">
                <span style={{ color: C.textPrimary, fontSize: 28, fontWeight: 900 }}>{game.homeTeam.score}</span>
                {game.homeTeam.logo
                  ? <img src={game.homeTeam.logo} style={{ width: 36, height: 36, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.3))' }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,240,255,0.1)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 10, fontWeight: 800 }}>{game.homeTeam.abbr.slice(0,2)}</div>}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between px-1 mb-4">
              <div className="flex items-center gap-2.5">
                {game.awayTeam.logo
                  ? <img src={game.awayTeam.logo} style={{ width: 32, height: 32, objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(0,240,255,0.25))' }} />
                  : <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,240,255,0.08)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 9, fontWeight: 800 }}>{game.awayTeam.abbr.slice(0,2)}</div>}
                <div>
                  <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>{game.awayTeam.abbr}</p>
                  <p style={{ color: C.textSecondary, fontSize: 10 }}>{game.awayTeam.record}</p>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: C.textSecondary, fontSize: 11, letterSpacing: '0.1em' }}>@</span>
                {game.venue && <p style={{ color: C.textSecondary, fontSize: 9, marginTop: 2, lineHeight: 1.4 }}>{game.venue.name}</p>}
              </div>
              <div className="flex items-center gap-2.5 flex-row-reverse">
                {game.homeTeam.logo
                  ? <img src={game.homeTeam.logo} style={{ width: 32, height: 32, objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(0,240,255,0.25))' }} />
                  : <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,240,255,0.08)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cyan, fontSize: 9, fontWeight: 800 }}>{game.homeTeam.abbr.slice(0,2)}</div>}
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>{game.homeTeam.abbr}</p>
                  <p style={{ color: C.textSecondary, fontSize: 10 }}>{game.homeTeam.record}</p>
                </div>
              </div>
            </div>
          )}

          {/* Win prob bar */}
          {game.hasWinnerOdds && (
            <div className="mb-4">
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct(game.homeWinOdds)}%`,
                  background: `linear-gradient(90deg, ${C.cyan}, ${C.purple})`,
                  boxShadow: `0 0 8px ${C.cyan}55`,
                  borderRadius: 2,
                }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span style={{ color: C.textSecondary, fontSize: 10 }}>{game.awayTeam.abbr} {pct(game.awayWinOdds)}%</span>
                <span style={{ color: C.textSecondary, fontSize: 10 }}>{game.homeTeam.abbr} {pct(game.homeWinOdds)}%</span>
              </div>
            </div>
          )}

          {/* Lines table */}
          {(game.hasWinnerOdds || game.hasSpreadOdds || game.hasTotalOdds) && (
            <div>
              {/* Column headers */}
              <div className="flex items-center gap-2 mb-2">
                <div style={{ width: 80, flexShrink: 0 }} />
                {['WIN', 'SPREAD', 'TOTAL'].map(h => (
                  <div key={h} style={{ minWidth: 72, textAlign: 'center', fontSize: 8, color: C.textSecondary, fontWeight: 800, letterSpacing: '0.15em' }}>{h}</div>
                ))}
              </div>

              {/* Away */}
              <div className="flex items-center gap-2 mb-2">
                <div style={{ width: 80, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {game.awayTeam.logo && <img src={game.awayTeam.logo} style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                  <span style={{ color: C.textSecondary, fontSize: 11, fontWeight: 700 }}>{game.awayTeam.abbr}</span>
                </div>
                {game.hasWinnerOdds ? <OddsChip top="WIN" bottom={String(pct(game.awayWinOdds))} hot={pct(game.awayWinOdds) >= 55} href={game.polyWinnerUrl} /> : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                {game.hasSpreadOdds ? <OddsChip top={awaySpreadLabel} bottom={String(pct(awaySpreadOdds))} hot={pct(awaySpreadOdds) >= 55} href={game.polySpreadUrl} /> : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                {game.hasTotalOdds ? <OddsChip top={`O ${game.totalLine}`} bottom={String(pct(game.overOdds))} hot={pct(game.overOdds) >= 55} href={game.polyTotalUrl} /> : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
              </div>

              {/* Home */}
              <div className="flex items-center gap-2">
                <div style={{ width: 80, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {game.homeTeam.logo && <img src={game.homeTeam.logo} style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                  <span style={{ color: C.textSecondary, fontSize: 11, fontWeight: 700 }}>{game.homeTeam.abbr}</span>
                </div>
                {game.hasWinnerOdds ? <OddsChip top="WIN" bottom={String(pct(game.homeWinOdds))} hot={pct(game.homeWinOdds) >= 55} href={game.polyWinnerUrl} /> : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                {game.hasSpreadOdds ? <OddsChip top={homeSpreadLabel} bottom={String(pct(homeSpreadOdds))} hot={pct(homeSpreadOdds) >= 55} href={game.polySpreadUrl} /> : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
                {game.hasTotalOdds ? <OddsChip top={`U ${game.totalLine}`} bottom={String(pct(game.underOdds))} hot={pct(game.underOdds) >= 55} href={game.polyTotalUrl} /> : <div style={{ minWidth: 72, textAlign: 'center', color: C.textSecondary, fontSize: 13 }}>—</div>}
              </div>
            </div>
          )}

          {/* DK comparison */}
          {game.hasDkOdds && (game.hasSpreadOdds || game.hasTotalOdds) && (
            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
              <p style={{ color: C.textSecondary, fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 800, marginBottom: 8 }}>Line Comparison · Polymarket vs DraftKings</p>
              <div className="flex flex-col gap-1.5">
                {game.hasSpreadOdds && game.dkSpread != null && (() => {
                  const edge = Math.abs(game.spreadLine - game.dkSpread) >= 1.5
                  return (
                    <div className="grid grid-cols-3 items-center py-2 px-3 rounded-xl" style={{ background: edge ? 'rgba(0,240,255,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${edge ? C.borderHot : C.border}` }}>
                      <span style={{ color: C.textSecondary, fontSize: 11 }}>Spread</span>
                      <span style={{ textAlign: 'center', color: C.textSecondary, fontSize: 11, fontFamily: 'monospace' }}>{game.dkSpread > 0 ? '+' : ''}{game.dkSpread}</span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <span style={{ color: edge ? C.cyan : C.textSecondary, fontSize: 11, fontFamily: 'monospace', fontWeight: edge ? 800 : 400 }}>{game.spreadLine > 0 ? '+' : ''}{game.spreadLine}</span>
                        {edge && <span style={{ color: C.cyan, fontSize: 10 }}>⚡</span>}
                      </div>
                    </div>
                  )
                })()}
                {game.hasTotalOdds && game.dkTotal != null && (() => {
                  const edge = Math.abs(game.totalLine - game.dkTotal) >= 2
                  return (
                    <div className="grid grid-cols-3 items-center py-2 px-3 rounded-xl" style={{ background: edge ? 'rgba(0,240,255,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${edge ? C.borderHot : C.border}` }}>
                      <span style={{ color: C.textSecondary, fontSize: 11 }}>Total</span>
                      <span style={{ textAlign: 'center', color: C.textSecondary, fontSize: 11, fontFamily: 'monospace' }}>{game.dkTotal}</span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <span style={{ color: edge ? C.cyan : C.textSecondary, fontSize: 11, fontFamily: 'monospace', fontWeight: edge ? 800 : 400 }}>{game.totalLine}</span>
                        {edge && <span style={{ color: C.cyan, fontSize: 10 }}>⚡</span>}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {!game.hasWinnerOdds && !game.hasSpreadOdds && !game.hasTotalOdds && (
            <p style={{ textAlign: 'center', color: C.textSecondary, fontSize: 10, marginTop: 8, letterSpacing: '0.08em' }}>Lines open closer to tip-off</p>
          )}
        </div>{/* end card content */}
        </div>{/* end holo-card */}

        {/* Projector base */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -1 }}>
          {/* Base plate */}
          <div style={{
            width: '70%', height: 6, borderRadius: '0 0 40px 40px',
            background: `linear-gradient(180deg, rgba(0,240,255,0.3), rgba(0,240,255,0.08))`,
            boxShadow: `0 4px 20px rgba(0,240,255,0.25), 0 0 40px rgba(0,240,255,0.1)`,
          }} />
          {/* Emitter ring */}
          <div style={{
            marginTop: 2, width: '40%', height: 4, borderRadius: 4,
            background: `linear-gradient(180deg, rgba(0,240,255,0.5), rgba(0,240,255,0.1))`,
            boxShadow: `0 0 16px ${C.cyan}, 0 0 30px rgba(0,240,255,0.3)`,
            animation: 'holo-glow-pulse 3s ease-in-out infinite',
          }} />
          {/* Core dot */}
          <div style={{
            marginTop: 3, width: 8, height: 8, borderRadius: '50%',
            background: C.cyan,
            boxShadow: `0 0 10px ${C.cyan}, 0 0 20px ${C.cyan}, 0 0 40px rgba(0,240,255,0.5)`,
            animation: 'holo-glow-pulse 2s ease-in-out infinite',
          }} />
        </div>

      </div>{/* end projector wrapper */}

      {showAnalysis && <AnalysisModal game={game} onClose={() => setShowAnalysis(false)} />}
      {betDraft && (
        <BetModal
          game={game} betType={betDraft.betType} betLabel={betDraft.betLabel} odds={betDraft.odds}
          onClose={() => setBetDraft(null)}
          onSave={(bet) => { onLogBet(bet); setBetDraft(null) }}
        />
      )}
    </>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).replace(/-/g, '')
  const [date, setDate] = useState(today)
  const [sport, setSport] = useState<'nba' | 'ncaab'>('nba')
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showTracker, setShowTracker] = useState(false)
  const [bets, setBets] = useState<BetLog[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('poly-bets')
    if (stored) setBets(JSON.parse(stored))
  }, [])

  const saveBets = (updated: BetLog[]) => {
    setBets(updated)
    localStorage.setItem('poly-bets', JSON.stringify(updated))
  }

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch(`/api/markets?date=${date}&sport=${sport}`)
      setGames(Array.isArray(await res.clone().json()) ? await res.json() : [])
      setLastUpdated(new Date())
    } catch { } finally { setLoading(false) }
  }, [date, sport])

  useEffect(() => { setLoading(true); fetchGames(); const iv = setInterval(fetchGames, 60000); return () => clearInterval(iv) }, [fetchGames])

  const days = Array.from({ length: 5 }, (_, i) => {
    const nowCST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
    const d = new Date(nowCST); d.setDate(d.getDate() + i - 2)
    return {
      label: i === 2 ? 'Today' : i === 1 ? 'Yest' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: d.toISOString().slice(0, 10).replace(/-/g, ''),
    }
  })

  const live = games.filter(g => g.status === 'in')
  const upcoming = games.filter(g => g.status === 'pre')
  const final = games.filter(g => g.status === 'post')
  const pendingBets = bets.filter(b => b.result === 'pending').length
  const logBet = (b: Omit<BetLog, 'id' | 'createdAt' | 'stake' | 'result'>) =>
    saveBets([...bets, { ...b, id: crypto.randomUUID(), stake: 0, result: 'pending', createdAt: new Date().toISOString() }])

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.textPrimary, position: 'relative', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Grid background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,240,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,240,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }} />
      {/* Radial glow center */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,240,255,0.06) 0%, transparent 70%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '32px 16px 80px' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            {/* Logo / wordmark */}
            <div className="flex items-center gap-3 mb-1">
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(135deg, rgba(0,240,255,0.2), rgba(168,85,247,0.2))`,
                border: `1px solid ${C.borderHot}`,
                boxShadow: `0 0 20px rgba(0,240,255,0.2)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18
              }}>◈</div>
              <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', color: C.textPrimary }}>
                {sport === 'nba' ? 'NBA' : 'NCAAB'}
                <span style={{ color: C.cyan, textShadow: `0 0 20px ${C.cyan}55` }}> LINES</span>
              </h1>
              {/* Sport tabs */}
              <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                {(['nba', 'ncaab'] as const).map(s => (
                  <button key={s} onClick={() => { setSport(s); setLoading(true) }} style={{
                    padding: '5px 12px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
                    textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s',
                    background: sport === s ? `linear-gradient(135deg, rgba(0,240,255,0.2), rgba(168,85,247,0.15))` : 'rgba(255,255,255,0.03)',
                    color: sport === s ? C.cyan : C.textSecondary,
                    borderRight: s === 'nba' ? `1px solid ${C.border}` : 'none',
                  }}>{s.toUpperCase()}</button>
                ))}
              </div>
              <a href="/bot" style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 10, fontSize: 11, fontWeight: 800,
                letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none',
                background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)',
                color: C.green, boxShadow: '0 0 12px rgba(0,255,136,0.1)',
                transition: 'all 0.2s',
              }}>⬡ Edge Bot</a>
            </div>
            <p style={{ color: C.textSecondary, fontSize: 12, letterSpacing: '0.06em' }}>
              Polymarket · DraftKings · AI Intelligence
              {lastUpdated && <span> · Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Date pills */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
              {days.map(day => (
                <button key={day.value} onClick={() => setDate(day.value)} style={{
                  flexShrink: 0, padding: '5px 12px', borderRadius: 20,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  background: date === day.value ? 'rgba(0,240,255,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${date === day.value ? C.borderHot : C.border}`,
                  color: date === day.value ? C.cyan : C.textSecondary,
                  boxShadow: date === day.value ? `0 0 12px ${C.cyan}22` : 'none',
                }}>{day.label}</button>
              ))}
            </div>
            {/* Bet tracker */}
            <button onClick={() => setShowTracker(true)} style={{
              position: 'relative', width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              color: C.textSecondary, fontSize: 15, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              ◫
              {pendingBets > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: C.cyan, color: C.bg, fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingBets}</span>}
            </button>
            {/* Refresh */}
            <button onClick={() => { setLoading(true); fetchGames() }} style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
              color: C.textSecondary, fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>↻</button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ borderRadius: 24, height: 220, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, animation: 'pulse 2s infinite' }} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ color: C.textSecondary, fontSize: 16 }}>No games scheduled</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {live.length > 0 && (
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, boxShadow: `0 0 8px ${C.red}`, display: 'inline-block' }} />
                  <span style={{ color: C.red, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Live Now</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {live.map(g => <GameCard key={g.id} game={g} onLogBet={logBet} />)}
                </div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Upcoming</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {upcoming.map(g => <GameCard key={g.id} game={g} onLogBet={logBet} />)}
                </div>
              </section>
            )}
            {final.length > 0 && (
              <section>
                <p style={{ color: C.textSecondary, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>Final</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {final.map(g => <GameCard key={g.id} game={g} onLogBet={logBet} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showTracker && <BetTracker bets={bets} onUpdate={saveBets} onClose={() => setShowTracker(false)} />}
    </main>
  )
}
