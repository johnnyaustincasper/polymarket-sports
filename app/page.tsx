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

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.35)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 4px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)' }} className={`rounded-3xl ${className}`}>
      {children}
    </div>
  )
}

function OddsChip({ top, bottom, hot, href, onClick }: {
  top: string; bottom: string; hot: boolean; href?: string | null; onClick?: () => void
}) {
  const cls = `flex flex-col items-center justify-center rounded-2xl px-2 py-2 min-w-[72px] border transition-all cursor-pointer active:scale-95 ${
    hot ? 'bg-indigo-500 border-indigo-300 text-white shadow-[0_2px_12px_rgba(79,70,229,0.35)]'
        : 'bg-black/5 border-black/10 text-zinc-800'
  }`
  const content = (
    <>
      <span className="text-[10px] font-medium opacity-70 leading-tight">{top}</span>
      <span className="text-sm font-bold leading-tight">{bottom}%</span>
      {href && <span className="text-[9px] opacity-40 mt-0.5">↗ BET</span>}
    </>
  )
  if (href) return <a href={href} target="_blank" rel="noopener" className={cls}>{content}</a>
  return <div className={cls} onClick={onClick}>{content}</div>
}

// ─── Bet Logger Modal ─────────────────────────────────────────────────────────
function BetModal({ game, betType, betLabel, odds, onClose, onSave }: {
  game: Game; betType: string; betLabel: string; odds: number
  onClose: () => void; onSave: (bet: BetLog) => void
}) {
  const [stake, setStake] = useState('10')
  const payout = (parseFloat(stake) || 0) / odds
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white/90 border border-black/8 rounded-t-3xl p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <p className="text-zinc-700 text-xs mb-1">{game.awayTeam.abbr} @ {game.homeTeam.abbr}</p>
        <h3 className="text-zinc-900 font-black text-lg mb-1">{betLabel}</h3>
        <p className="text-indigo-600 text-sm mb-5">{pct(odds)}% implied probability</p>
        <label className="text-zinc-700 text-xs block mb-1">Stake (USDC)</label>
        <input
          type="number" value={stake} onChange={e => setStake(e.target.value)}
          className="w-full bg-black/4 border border-black/8 rounded-xl px-4 py-3 text-white text-lg font-bold mb-3 focus:outline-none focus:border-indigo-300"
        />
        <p className="text-zinc-700 text-xs mb-5">
          Win: <span className="text-white">${payout.toFixed(2)}</span> · Net: <span className="text-green-400">+${(payout - parseFloat(stake || '0')).toFixed(2)}</span>
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-black/4 border border-black/8 text-zinc-700 font-semibold">Cancel</button>
          <button onClick={save} className="flex-1 py-3 rounded-2xl bg-indigo-50 border border-indigo-300 text-indigo-700 font-bold">Log Bet</button>
        </div>
      </div>
    </div>
  )
}

// ─── Analysis Section Card ────────────────────────────────────────────────────
function AnalysisSection({ title, emoji, content }: { title: string; emoji: string; content: string }) {
  // Parse bullet points and bold text into clean elements
  const lines = content.split('\n').filter(l => l.trim())
  return (
    <div className="rounded-2xl border border-black/8 bg-black/4 backdrop-blur p-4 mb-3">
      <p className="text-[11px] font-bold text-zinc-700 uppercase tracking-widest mb-3">{emoji} {title}</p>
      <div className="flex flex-col gap-1.5">
        {lines.map((line, i) => {
          const trimmed = line.trim()
          if (!trimmed) return null
          // Bold headers like **TeamName**
          if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
            return <p key={i} className="text-zinc-800 font-bold text-sm mt-1">{trimmed.replace(/\*\*/g, '')}</p>
          }
          // Bullet points
          if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
            const text = trimmed.replace(/^[•\-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')
            return (
              <div key={i} className="flex gap-2">
                <span className="text-indigo-600/60 mt-0.5 flex-shrink-0">·</span>
                <p className="text-zinc-800 text-sm leading-snug">{text}</p>
              </div>
            )
          }
          // Bold inline text cleanup
          const cleaned = trimmed.replace(/\*\*(.*?)\*\*/g, '$1')
          return <p key={i} className="text-zinc-800 text-sm leading-snug">{cleaned}</p>
        })}
      </div>
    </div>
  )
}

function parseAnalysis(text: string): { title: string; emoji: string; content: string }[] {
  // Prompt outputs sections delimited by: ###EMOJI TITLE
  const lines = text.split('\n')
  const sections: { title: string; emoji: string; content: string }[] = []
  let current: { title: string; emoji: string; lines: string[] } | null = null

  for (const line of lines) {
    const m = line.match(/^###(\S+)\s+(.+)$/)
    if (m) {
      if (current && current.lines.join('\n').trim().length > 3) {
        sections.push({ emoji: current.emoji, title: current.title, content: current.lines.join('\n').trim() })
      }
      current = { emoji: m[1], title: m[2].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current && current.lines.join('\n').trim().length > 3) {
    sections.push({ emoji: current.emoji, title: current.title, content: current.lines.join('\n').trim() })
  }

  if (!sections.length) {
    return [{ title: 'Analysis', emoji: '✦', content: text }]
  }
  return sections
}

// ─── AI Analysis Modal ────────────────────────────────────────────────────────
function AnalysisModal({ game, onClose }: { game: Game; onClose: () => void }) {
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(true)

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
      .catch(() => { setAnalysis('Failed to load analysis.'); setLoading(false) })
  }, [])

  const sections = analysis ? parseAnalysis(analysis) : []
  const [expanded, setExpanded] = useState<number | null>(null)
  const [read, setRead] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    setExpanded(prev => prev === i ? null : i)
    setRead(prev => new Set(prev).add(i))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(240,242,245,0.95)", backdropFilter: "blur(24px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-4 max-w-md mx-auto w-full flex-shrink-0">
        <div>
          <p className="text-zinc-700 text-xs">{game.awayTeam.abbr} @ {game.homeTeam.abbr}</p>
          <h3 className="text-zinc-900 font-black text-base">AI Breakdown</h3>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/6 border border-black/8 flex items-center justify-center text-zinc-700 text-xl">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-10 max-w-md mx-auto w-full">
        {loading ? (
          <div className="flex flex-col gap-2 mt-1">
            {[1,2,3,4,5,6,7].map(i => (
              <div key={i} className="h-12 rounded-2xl bg-black/4 border border-black/8" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            {sections.map((s, i) => {
              const isOpen = expanded === i
              const isPick = s.title === 'The Pick'
              const isRead = read.has(i)
              return (
                <div
                  key={i}
                  className={`rounded-2xl border backdrop-blur overflow-hidden transition-all ${
                    isPick
                      ? 'border-indigo-300 bg-indigo-50'
                      : isOpen
                        ? 'border-black/12 bg-black/6'
                        : 'border-black/8 bg-black/4'
                  }`}
                >
                  {/* Bubble header — always visible, tap to toggle */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3.5 text-left"
                    onClick={() => toggle(i)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{s.emoji}</span>
                      <span className={`text-sm font-bold ${isPick ? 'text-indigo-700' : 'text-zinc-700'}`}>{s.title}</span>
                    </div>
                    <span className={`text-zinc-700 text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>

                  {/* Expanded content */}
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-black/6">
                      <div className="flex flex-col gap-1.5 mt-3">
                        {s.content.split('\n').filter(l => l.trim()).map((line, j) => {
                          const trimmed = line.trim()
                          if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
                            return <p key={j} className="text-zinc-800 font-bold text-sm mt-1">{trimmed.replace(/\*\*/g, '')}</p>
                          }
                          if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
                            return (
                              <div key={j} className="flex gap-2">
                                <span className="text-indigo-600/50 flex-shrink-0 mt-0.5">·</span>
                                <p className="text-zinc-800 text-sm leading-snug">{trimmed.replace(/^[•\-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}</p>
                              </div>
                            )
                          }
                          return <p key={j} className="text-zinc-800 text-sm leading-snug">{trimmed.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
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

// ─── Bet Tracker Panel ────────────────────────────────────────────────────────
function BetTracker({ bets, onUpdate, onClose }: {
  bets: BetLog[]; onUpdate: (bets: BetLog[]) => void; onClose: () => void
}) {
  const setResult = (id: string, result: 'win' | 'loss') => {
    onUpdate(bets.map(b => b.id === id ? { ...b, result } : b))
  }
  const remove = (id: string) => onUpdate(bets.filter(b => b.id !== id))

  const pending = bets.filter(b => b.result === 'pending')
  const settled = bets.filter(b => b.result !== 'pending')
  const totalStaked = settled.reduce((s, b) => s + b.stake, 0)
  const totalPnl = settled.reduce((s, b) => {
    if (b.result === 'win') return s + (b.stake / b.odds - b.stake)
    return s - b.stake
  }, 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white/80 backdrop-blur-2xl">
      <div className="flex-1 overflow-y-auto max-w-md w-full mx-auto bg-white/90 border-x border-black/8 px-5 py-6">
        <button onClick={onClose} className="text-zinc-700 text-sm mb-4 flex items-center gap-1">← Close</button>
        <h3 className="text-zinc-900 font-black text-lg mb-1">Bet Tracker</h3>

        {settled.length > 0 && (
          <GlassCard className="p-4 mb-4">
            <div className="grid grid-cols-3 text-center">
              <div>
                <p className="text-zinc-700 text-[10px] uppercase tracking-wider">Bets</p>
                <p className="text-zinc-900 font-bold text-lg">{settled.length}</p>
              </div>
              <div>
                <p className="text-zinc-700 text-[10px] uppercase tracking-wider">Staked</p>
                <p className="text-zinc-900 font-bold text-lg">${totalStaked.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-zinc-700 text-[10px] uppercase tracking-wider">P&L</p>
                <p className={`font-bold text-lg ${totalPnl >= 0 ? 'text-green-400' : 'text-red-500'}`}>
                  {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                </p>
              </div>
            </div>
          </GlassCard>
        )}

        {pending.length > 0 && (
          <>
            <p className="text-[11px] text-zinc-700 uppercase tracking-widest mb-2">Pending</p>
            {pending.map(b => (
              <GlassCard key={b.id} className="p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-zinc-800 text-xs font-bold">{b.betLabel}</p>
                    <p className="text-zinc-700 text-[10px]">{b.matchup} · ${b.stake}</p>
                  </div>
                  <button onClick={() => remove(b.id)} className="text-zinc-700 text-xs">✕</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setResult(b.id, 'win')} className="flex-1 py-1.5 rounded-xl bg-green-500/20 border border-green-400/30 text-green-400 text-xs font-bold">Win</button>
                  <button onClick={() => setResult(b.id, 'loss')} className="flex-1 py-1.5 rounded-xl bg-red-400/20 border border-red-400/30 text-red-500 text-xs font-bold">Loss</button>
                </div>
              </GlassCard>
            ))}
          </>
        )}

        {settled.length > 0 && (
          <>
            <p className="text-[11px] text-zinc-700 uppercase tracking-widest mb-2 mt-4">Settled</p>
            {settled.map(b => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-black/5">
                <div>
                  <p className="text-zinc-900 text-xs font-semibold">{b.betLabel}</p>
                  <p className="text-zinc-700 text-[10px]">{b.matchup} · ${b.stake}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${b.result === 'win' ? 'text-green-400' : 'text-red-500'}`}>
                    {b.result === 'win' ? `+$${(b.stake / b.odds - b.stake).toFixed(2)}` : `-$${b.stake}`}
                  </span>
                  <button onClick={() => remove(b.id)} className="text-zinc-700 text-[10px]">✕</button>
                </div>
              </div>
            ))}
          </>
        )}

        {bets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-700 text-sm">No bets logged yet</p>
            <p className="text-zinc-700 text-xs mt-1">Tap any odds chip to log a bet</p>
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
  const isLive = game.status === 'in'
  const isFinal = game.status === 'post'

  const homeSpreadLabel = game.spreadLine < 0 ? `${game.spreadLine}` : `+${game.spreadLine}`
  const awaySpreadLabel = game.spreadLine < 0 ? `+${-game.spreadLine}` : `${-game.spreadLine}`
  const awaySpreadOdds = game.spreadLine < 0 ? game.spreadAwayOdds : game.spreadHomeOdds
  const homeSpreadOdds = game.spreadLine < 0 ? game.spreadHomeOdds : game.spreadAwayOdds

  const dkSpreadDiff = game.hasDkOdds && game.hasSpreadOdds && game.dkSpread != null
    ? Math.abs(game.spreadLine - game.dkSpread) : 0
  const dkTotalDiff = game.hasDkOdds && game.hasTotalOdds && game.dkTotal != null
    ? Math.abs(game.totalLine - game.dkTotal) : 0
  const hasEdge = dkSpreadDiff >= 1.5 || dkTotalDiff >= 2
  const [showEdgeInfo, setShowEdgeInfo] = useState(false)

  return (
    <>
      <GlassCard className="p-4 mb-3">
        {/* Status */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
            <span className={`text-[11px] font-medium ${isLive ? 'text-red-500' : isFinal ? 'text-zinc-700' : 'text-zinc-700'}`}>
              {isLive ? `LIVE · ${game.gameTime}` : isFinal ? 'Final' : game.gameTime}
            </span>
            {hasEdge && (
              <div className="relative">
                <button onClick={() => setShowEdgeInfo(v => !v)} className="text-[10px] bg-indigo-50 border border-indigo-300 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
                  ⚡ Line Discrepancy vs DraftKings {showEdgeInfo ? '▴' : '▾'}
                </button>
                {showEdgeInfo && (
                  <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }} className="absolute left-0 top-7 z-20 w-72 rounded-2xl border border-indigo-200 p-3 shadow-xl">
                    <p className="text-indigo-700 font-bold text-xs mb-1.5">⚡ What does this mean?</p>
                    <p className="text-zinc-800 text-[11px] leading-relaxed mb-2">Polymarket's line on this game is significantly different from DraftKings. That gap = a potential edge.</p>
                    <p className="text-zinc-700 font-semibold text-[11px] mb-1">How to profit:</p>
                    <ul className="text-zinc-800 text-[11px] leading-relaxed space-y-1">
                      <li>• <strong>Bet both sides:</strong> Place opposing bets on Polymarket and DraftKings to lock in a guaranteed profit regardless of outcome (arbitrage).</li>
                      <li>• <strong>Fade the sharp line:</strong> DraftKings has professional bettors setting their lines. If Polymarket is way off, bet the DK-aligned side on Polymarket.</li>
                      <li>• <strong>Move fast:</strong> These gaps close quickly as the market corrects.</li>
                    </ul>
                    <p className="text-zinc-700 text-[10px] mt-2">Not financial advice. Always check vig before placing.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowAnalysis(true)}
            className="text-[10px] text-zinc-700 bg-black/4 border border-black/8 px-2.5 py-1 rounded-full hover:bg-black/6 hover:text-zinc-700 transition-all"
          >
            Analyze ✦
          </button>
        </div>

        {/* Score or matchup */}
        {(isLive || isFinal) ? (
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              {game.awayTeam.logo ? <img src={game.awayTeam.logo} className="w-8 h-8 object-contain" /> : <div className="w-8 h-8 rounded-full bg-black/6 flex items-center justify-center text-white text-[10px] font-black">{game.awayTeam.abbr.slice(0,2)}</div>}
              <span className="text-zinc-900 font-black text-2xl">{game.awayTeam.score}</span>
            </div>
            <span className="text-zinc-700">—</span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-900 font-black text-2xl">{game.homeTeam.score}</span>
              {game.homeTeam.logo ? <img src={game.homeTeam.logo} className="w-8 h-8 object-contain" /> : <div className="w-8 h-8 rounded-full bg-black/6 flex items-center justify-center text-white text-[10px] font-black">{game.homeTeam.abbr.slice(0,2)}</div>}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              {game.awayTeam.logo ? <img src={game.awayTeam.logo} className="w-8 h-8 object-contain" /> : <div className="w-8 h-8 rounded-full bg-black/6 flex items-center justify-center text-white text-[10px] font-black">{game.awayTeam.abbr.slice(0,2)}</div>}
              <div><p className="text-zinc-800 text-sm font-bold">{(game.awayTeam as any).rank ? <span className="text-indigo-500 font-black text-[10px] mr-0.5">#{(game.awayTeam as any).rank}</span> : null}{game.awayTeam.abbr}</p><p className="text-zinc-700 text-[10px]">{game.awayTeam.record}</p></div>
            </div>
            <div className="text-center">
              <span className="text-zinc-700 text-xs">@</span>
              {game.venue && <p className="text-[10px] text-zinc-700 leading-tight mt-0.5">{game.venue.name}<br/><span className="text-zinc-700">{game.venue.location}</span></p>}
            </div>
            <div className="flex items-center gap-2 flex-row-reverse">
              {game.homeTeam.logo ? <img src={game.homeTeam.logo} className="w-8 h-8 object-contain" /> : <div className="w-8 h-8 rounded-full bg-black/6 flex items-center justify-center text-white text-[10px] font-black">{game.homeTeam.abbr.slice(0,2)}</div>}
              <div className="text-right"><p className="text-zinc-800 text-sm font-bold">{(game.homeTeam as any).rank ? <span className="text-indigo-500 font-black text-[10px] mr-0.5">#{(game.homeTeam as any).rank}</span> : null}{game.homeTeam.abbr}</p><p className="text-zinc-700 text-[10px]">{game.homeTeam.record}</p></div>
            </div>
          </div>
        )}

        {/* Win prob bar */}
        {game.hasWinnerOdds && (
          <div className="mb-3">
            <div className="h-1 rounded-full bg-black/6 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400" style={{ width: `${pct(game.homeWinOdds)}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-zinc-700 text-[10px]">{game.awayTeam.abbr} {pct(game.awayWinOdds)}%</span>
              <span className="text-zinc-700 text-[10px]">{game.homeTeam.abbr} {pct(game.homeWinOdds)}%</span>
            </div>
          </div>
        )}

        {/* Lines table */}
        {(game.hasWinnerOdds || game.hasSpreadOdds || game.hasTotalOdds) && (
          <div className="mt-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-24 flex-shrink-0" />
              <div className="min-w-[72px] text-center text-[10px] text-zinc-700 font-semibold uppercase tracking-wider">Winner</div>
              <div className="min-w-[72px] text-center text-[10px] text-zinc-700 font-semibold uppercase tracking-wider">Spread</div>
              <div className="min-w-[72px] text-center text-[10px] text-zinc-700 font-semibold uppercase tracking-wider">Total</div>
            </div>

            {/* Away row */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-24 flex-shrink-0 flex items-center gap-1.5">
                {game.awayTeam.logo ? <img src={game.awayTeam.logo} className="w-6 h-6 object-contain" /> : null}
                <span className="text-zinc-800 text-xs font-bold">{game.awayTeam.abbr}</span>
              </div>
              {game.hasWinnerOdds
                ? <OddsChip top="WIN" bottom={String(pct(game.awayWinOdds))} hot={pct(game.awayWinOdds) >= 55} href={game.polyWinnerUrl} />
                : <div className="min-w-[72px] text-center text-zinc-700 text-xs">—</div>}
              {game.hasSpreadOdds
                ? <OddsChip top={awaySpreadLabel} bottom={String(pct(awaySpreadOdds))} hot={pct(awaySpreadOdds) >= 55} href={game.polySpreadUrl} />
                : <div className="min-w-[72px] text-center text-zinc-700 text-xs">—</div>}
              {game.hasTotalOdds
                ? <OddsChip top={`O ${game.totalLine}`} bottom={String(pct(game.overOdds))} hot={pct(game.overOdds) >= 55} href={game.polyTotalUrl} />
                : <div className="min-w-[72px] text-center text-zinc-700 text-xs">—</div>}
            </div>

            {/* Home row */}
            <div className="flex items-center gap-2">
              <div className="w-24 flex-shrink-0 flex items-center gap-1.5">
                {game.homeTeam.logo ? <img src={game.homeTeam.logo} className="w-6 h-6 object-contain" /> : null}
                <span className="text-zinc-800 text-xs font-bold">{game.homeTeam.abbr}</span>
              </div>
              {game.hasWinnerOdds
                ? <OddsChip top="WIN" bottom={String(pct(game.homeWinOdds))} hot={pct(game.homeWinOdds) >= 55} href={game.polyWinnerUrl} />
                : <div className="min-w-[72px] text-center text-zinc-700 text-xs">—</div>}
              {game.hasSpreadOdds
                ? <OddsChip top={homeSpreadLabel} bottom={String(pct(homeSpreadOdds))} hot={pct(homeSpreadOdds) >= 55} href={game.polySpreadUrl} />
                : <div className="min-w-[72px] text-center text-zinc-700 text-xs">—</div>}
              {game.hasTotalOdds
                ? <OddsChip top={`U ${game.totalLine}`} bottom={String(pct(game.underOdds))} hot={pct(game.underOdds) >= 55} href={game.polyTotalUrl} />
                : <div className="min-w-[72px] text-center text-zinc-700 text-xs">—</div>}
            </div>
          </div>
        )}

        {/* DK comparison */}
        {game.hasDkOdds && (game.hasSpreadOdds || game.hasTotalOdds) && (
          <div className="mt-3 pt-3 border-t border-black/5">
            <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-widest mb-1">Line Comparison vs DraftKings</p>
            <p className="text-[9px] text-zinc-700 mb-2">⚡ = Polymarket line differs from DK — potential value bet</p>
            <div className="grid grid-cols-3 text-[10px] text-zinc-700 text-center mb-1">
              <span className="text-left">Market</span><span>DK</span><span>Poly</span>
            </div>
            {game.hasSpreadOdds && game.dkSpread != null && (() => {
              const edge = Math.abs(game.spreadLine - game.dkSpread) >= 1.5
              return (
                <div style={edge ? { background: 'rgba(79,70,229,0.12)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(79,70,229,0.3)' } : { background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.4)' }} className="grid grid-cols-3 items-center py-1.5 px-2 rounded-xl mb-1">
                  <span className="text-zinc-700 text-[11px]">Spread</span>
                  <span className="text-center text-zinc-700 text-[11px] font-mono">{game.dkSpread > 0 ? '+' : ''}{game.dkSpread}</span>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`text-[11px] font-mono ${edge ? 'text-indigo-700 font-bold' : 'text-zinc-700'}`}>{game.spreadLine > 0 ? '+' : ''}{game.spreadLine}</span>
                    {edge && <span className="text-indigo-600">⚡</span>}
                  </div>
                </div>
              )
            })()}
            {game.hasTotalOdds && game.dkTotal != null && (() => {
              const edge = Math.abs(game.totalLine - game.dkTotal) >= 2
              return (
                <div style={edge ? { background: 'rgba(79,70,229,0.12)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(79,70,229,0.3)' } : { background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.4)' }} className="grid grid-cols-3 items-center py-1.5 px-2 rounded-xl">
                  <span className="text-zinc-700 text-[11px]">Total</span>
                  <span className="text-center text-zinc-700 text-[11px] font-mono">{game.dkTotal}</span>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`text-[11px] font-mono ${edge ? 'text-indigo-700 font-bold' : 'text-zinc-700'}`}>{game.totalLine}</span>
                    {edge && <span className="text-indigo-600">⚡</span>}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {!game.hasWinnerOdds && !game.hasSpreadOdds && !game.hasTotalOdds && (
          <p className="text-center text-zinc-700 text-[10px] mt-2">Lines open closer to tip-off</p>
        )}
      </GlassCard>

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

  // Load bets from localStorage
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
    const nowCST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })); const d = new Date(nowCST); d.setDate(d.getDate() + i - 2)
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
    <main className="min-h-screen text-zinc-900 relative">


      <div style={{ position: "relative", zIndex: 1 }} className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight">{sport === 'nba' ? 'NBA' : 'NCAAB'} <span className="text-indigo-600">Lines</span></h1>
              <div className="flex rounded-xl overflow-hidden border border-black/10 text-xs font-bold">
                <button onClick={() => { setSport('nba'); setLoading(true) }} className={`px-3 py-1.5 transition-all ${sport === 'nba' ? 'bg-indigo-600 text-white' : 'bg-black/5 text-zinc-600 hover:bg-black/10'}`}>NBA</button>
                <button onClick={() => { setSport('ncaab'); setLoading(true) }} className={`px-3 py-1.5 transition-all ${sport === 'ncaab' ? 'bg-indigo-600 text-white' : 'bg-black/5 text-zinc-600 hover:bg-black/10'}`}>NCAAB</button>
              </div>
            </div>
            <p className="text-zinc-700 text-sm mt-0.5">Polymarket · DraftKings · AI Analysis</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {days.map(day => (
                <button key={day.value} onClick={() => setDate(day.value)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${date === day.value ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-black/5 border-black/8 text-zinc-700 hover:bg-black/10'}`}>{day.label}</button>
              ))}
            </div>
            <button onClick={() => setShowTracker(true)} className="relative flex-shrink-0 w-9 h-9 rounded-full bg-black/5 border border-black/8 flex items-center justify-center text-zinc-700 hover:bg-black/10 transition-all">
              📋
              {pendingBets > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-black flex items-center justify-center">{pendingBets}</span>}
            </button>
            <button onClick={() => { setLoading(true); fetchGames() }} className="flex-shrink-0 w-9 h-9 rounded-full bg-black/5 border border-black/8 flex items-center justify-center text-zinc-700 hover:bg-black/10 transition-all text-lg">↻</button>
          </div>
        </div>

        {lastUpdated && <p className="text-[11px] text-zinc-700 text-right mb-4">Updated {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <div key={i} className="rounded-3xl h-56 bg-black/5 border border-black/8 animate-pulse" />)}
          </div>
        ) : games.length === 0 ? (
          <GlassCard className="p-16 text-center"><p className="text-zinc-700 text-lg">No games scheduled</p></GlassCard>
        ) : (
          <div className="space-y-8">
            {live.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Live Now</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {live.map(g => <GameCard key={g.id} game={g} onLogBet={logBet} />)}
                </div>
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <p className="text-xs font-bold text-zinc-700 uppercase tracking-widest mb-3">Upcoming</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {upcoming.map(g => <GameCard key={g.id} game={g} onLogBet={logBet} />)}
                </div>
              </section>
            )}
            {final.length > 0 && (
              <section>
                <p className="text-xs font-bold text-zinc-700 uppercase tracking-widest mb-3">Final</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {final.map(g => <GameCard key={g.id} game={g} onLogBet={logBet} />)}
                </div>
              </section>
            )}
          </div>
        )}

        <p className="text-center text-zinc-700 text-xs mt-10">Prediction market odds · Not financial advice</p>
      </div>

      {showTracker && <BetTracker bets={bets} onUpdate={saveBets} onClose={() => setShowTracker(false)} />}
    </main>
  )
}
