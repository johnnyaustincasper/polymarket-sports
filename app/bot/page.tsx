'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  TrackedCall, CallStatus,
  loadCalls, addCall, updateCallStatus, deleteCalls,
  calcKelly, calcPnL, calcStats, exportCSV,
} from './callTracker'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  cyan:          '#00f0ff',
  purple:        '#bf8fff',
  green:         '#00ff88',
  red:           '#ff4466',
  gold:          '#ffd700',
  bg:            '#02020f',
  card:          'rgba(10,10,30,0.95)',
  cardEdge:      'rgba(0,20,10,0.97)',
  cardMuted:     'rgba(8,8,22,0.85)',
  surface:       'rgba(255,255,255,0.03)',
  border:        'rgba(0,240,255,0.10)',
  borderMid:     'rgba(0,240,255,0.22)',
  borderHot:     'rgba(0,240,255,0.5)',
  borderGreen:   'rgba(0,255,136,0.35)',
  text:          '#e8f0ff',
  textDim:       'rgba(180,200,255,0.5)',
  textFaint:     'rgba(180,200,255,0.28)',
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface NarrativeSig {
  type: string; severity: 'high' | 'medium' | 'low'
  team: string; direction: 'favors_away' | 'favors_home' | 'neutral'
  summary: string
}
interface NarrativeResult {
  signals: NarrativeSig[]
  overallEdge: 'away' | 'home' | 'none'
  edgeConfidence: number
  aiSummary: string
}
interface Signal {
  gameId: string; gameName: string; gameTime: string; status: string
  isLive?: boolean; awayScore?: string; homeScore?: string
  dkAwayML: string; dkHomeML: string; dkAwayImplied: number; dkHomeImplied: number
  dkSpread?: number | null; dkTotal?: number | null
  polyEventTitle: string; polyEventUrl: string; polyConditionId: string
  polyAwayTeam: string; polyHomeTeam: string
  polyAwayPrice: number; polyHomePrice: number
  polyAwayTokenId: string; polyHomeTokenId: string
  awayEdge: number; homeEdge: number
  bestSide: 'away' | 'home' | 'none'; bestEdge: number; recommendation: string
  sport?: string
}
interface ScanResult {
  scannedAt: string; gamesScanned: number; polyMarketsFound: number; edgeSignals: number
  signals: Signal[]
}
interface SavedScan {
  id: string; report: string; gamesAnalyzed: number; scannedAt: string; bankroll: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pct  = (n: number) => (n * 100).toFixed(1) + '%'
const cent = (n: number) => (n * 100).toFixed(1) + '¢'
const edge = (n: number) => (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '¢'
const units= (n: number) => (n >= 0 ? '+' : '') + n.toFixed(3) + 'u'

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Now'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Micro components ──────────────────────────────────────────────────────────
function Pill({ label, color, bg, size = 9 }: { label: string; color: string; bg: string; size?: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 99,
      fontSize: size, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
      background: bg, color,
    }}>{label}</span>
  )
}

function SportBadge({ sport = 'NBA' }: { sport?: string }) {
  const colors: Record<string, { color: string; bg: string }> = {
    NBA:   { color: '#ff6b35', bg: 'rgba(255,107,53,0.15)' },
    NCAAB: { color: '#4fc3f7', bg: 'rgba(79,195,247,0.15)' },
    NFL:   { color: '#66bb6a', bg: 'rgba(102,187,106,0.15)' },
    NCAAF: { color: '#ce93d8', bg: 'rgba(206,147,216,0.15)' },
    MLB:   { color: '#ffd54f', bg: 'rgba(255,213,79,0.15)' },
  }
  const c = colors[sport] || { color: C.textDim, bg: C.surface }
  return <Pill label={sport} color={c.color} bg={c.bg} />
}

function LiveBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 99,
      fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
      background: 'rgba(255,68,102,0.15)', color: C.red,
      border: '1px solid rgba(255,68,102,0.35)',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: C.red,
        display: 'inline-block',
        animation: 'pulse 1.2s ease-in-out infinite',
      }} />
      LIVE
    </span>
  )
}

function BigStat({ label, value, color = C.text, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color, fontWeight: 900, fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>{sub}</div>}
      <div style={{ color: C.textFaint, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: C.border }} />
}

// ── Skeleton Card (loading state) ─────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden',
      background: C.card, border: `1px solid ${C.border}`,
    }}>
      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.3 }
          50% { opacity: 0.7 }
          100% { opacity: 0.3 }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50% { opacity: 0.4 }
        }
      `}</style>
      {[80, 120, 60].map((h, i) => (
        <div key={i} style={{
          height: h, margin: 16, borderRadius: 12,
          background: 'rgba(255,255,255,0.06)',
          animation: `shimmer 1.5s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  )
}

// ── ROI Sparkline ─────────────────────────────────────────────────────────────
function RoiSpark({ calls }: { calls: TrackedCall[] }) {
  const pts = [...calls]
    .filter(c => c.status !== 'pending' && c.status !== 'void' && c.profitLoss !== null)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-30)

  if (pts.length < 2) return (
    <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textFaint, fontSize: 10 }}>
      Settle 2+ calls to see chart
    </div>
  )

  const cum: number[] = []
  let r = 0
  for (const c of pts) { r += c.profitLoss ?? 0; cum.push(r) }

  const mn = Math.min(0, ...cum), mx = Math.max(0, ...cum)
  const rng = mx - mn || 1
  const W = 300, H = 48, P = 3
  const xs = cum.map((_, i) => P + (i / (cum.length - 1)) * (W - P * 2))
  const ys = cum.map(v => H - P - ((v - mn) / rng) * (H - P * 2))
  const z  = H - P - ((0 - mn) / rng) * (H - P * 2)
  const lc = cum[cum.length - 1] >= 0 ? C.green : C.red
  const d  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={P} y1={z} x2={W - P} y2={z} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 3" />
      <path d={`${d} L${xs[xs.length-1]},${z} L${xs[0]},${z} Z`} fill={lc + '15'} />
      <path d={d} fill="none" stroke={lc} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="3" fill={lc} />
    </svg>
  )
}

// ── Stats Bar (top of page) ───────────────────────────────────────────────────
function StatsBar({ calls }: { calls: TrackedCall[] }) {
  const s = useMemo(() => calcStats(calls), [calls])
  if (s.total === 0) return null

  const wr = s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0

  return (
    <div style={{
      borderRadius: 20, marginBottom: 24,
      background: C.card,
      border: `1px solid ${C.borderMid}`,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '18px 16px', gap: 4 }}>
        <BigStat label="Calls" value={String(s.total)} sub={`${s.settled} settled`} />
        <BigStat
          label="Win Rate"
          value={s.settled > 0 ? pct(wr) : '—'}
          color={wr >= 0.55 ? C.green : wr >= 0.44 ? C.gold : s.settled > 0 ? C.red : C.textDim}
          sub={s.settled > 0 ? `${s.wins}W · ${s.losses}L${s.pushes > 0 ? ` · ${s.pushes}P` : ''}` : undefined}
        />
        <BigStat
          label="P&L"
          value={s.settled > 0 ? units(s.totalPnL) : '—'}
          color={s.totalPnL > 0 ? C.green : s.totalPnL < 0 ? C.red : C.textDim}
        />
        <BigStat
          label="ROI"
          value={s.settled > 0 ? pct(s.roi) : '—'}
          color={s.roi > 0 ? C.green : s.roi < 0 ? C.red : C.textDim}
        />
      </div>
      {s.settled >= 3 && (
        <>
          <Divider />
          <div style={{ padding: '10px 16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {s.longestWinStreak > 1 && <span style={{ color: C.green, fontSize: 11, fontWeight: 700 }}>🔥 W{s.longestWinStreak} streak</span>}
            {s.longestLossStreak > 1 && <span style={{ color: C.red, fontSize: 11, fontWeight: 700 }}>💀 L{s.longestLossStreak} streak</span>}
            {s.avgEdgeWin > 0 && <span style={{ color: C.textDim, fontSize: 11 }}>Avg win edge <span style={{ color: C.green, fontWeight: 700 }}>{edge(s.avgEdgeWin)}</span></span>}
            <button onClick={() => exportCSV(calls)} style={{
              marginLeft: 'auto', padding: '5px 12px', borderRadius: 20,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.textDim, cursor: 'pointer',
            }}>↓ CSV</button>
          </div>
          <Divider />
          <div style={{ padding: '10px 16px' }}>
            <RoiSpark calls={calls} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Odds Column ───────────────────────────────────────────────────────────────
function OddsCol({ label, value, sub, color = C.text }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 6px' }}>
      <div style={{ color: C.textFaint, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ color, fontWeight: 900, fontSize: 24, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: C.textFaint, fontSize: 9, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ── Signal Card ───────────────────────────────────────────────────────────────
function SignalCard({
  s, trackedCalls, onTrack, narrative, onAnalyze,
}: {
  s: Signal
  trackedCalls: TrackedCall[]
  onTrack: () => void
  narrative: NarrativeResult | 'loading' | 'error' | undefined
  onAnalyze: () => void
}) {
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const hasEdge = s.bestSide !== 'none'
  const isLive = s.isLive || s.status === 'in'
  const today   = new Date().toISOString().slice(0, 10)
  const tracked = trackedCalls.some(c =>
    c.gameId === s.gameId && c.bettingSide === s.bestSide && c.timestamp.slice(0, 10) === today
  )

  const betTeam  = hasEdge ? (s.bestSide === 'away' ? s.polyAwayTeam : s.polyHomeTeam) : null
  const betPrice = hasEdge ? (s.bestSide === 'away' ? s.polyAwayPrice : s.polyHomePrice) : null
  const dkImp    = hasEdge ? (s.bestSide === 'away' ? s.dkAwayImplied : s.dkHomeImplied) : null
  const kelly    = hasEdge && betPrice ? calcKelly(s.bestEdge, betPrice) : 0
  const evPer100 = hasEdge && betPrice && dkImp ? ((dkImp * (1 / betPrice - 1) - (1 - dkImp)) * 100).toFixed(2) : null

  const parts    = s.gameName.split(' @ ')
  const awayName = parts[0] || ''
  const homeName = parts[1] || ''

  const spreadDisplay = s.dkSpread != null
    ? (s.dkSpread > 0 ? `+${s.dkSpread}` : String(s.dkSpread))
    : 'N/A'

  const glowStyle = hasEdge
    ? { boxShadow: '0 4px 40px rgba(0,255,136,0.12), 0 0 0 1px rgba(0,255,136,0.2)' }
    : {}

  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden',
      background: hasEdge ? C.cardEdge : C.cardMuted,
      border: `1px solid ${hasEdge ? C.borderGreen : C.border}`,
      ...glowStyle,
      transition: 'box-shadow 0.3s',
    }}>

      {/* ── EDGE DETECTED banner ── */}
      {hasEdge && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,255,136,0.12) 0%, rgba(0,240,255,0.05) 100%)',
          borderBottom: `1px solid rgba(0,255,136,0.2)`,
          padding: '16px 18px 14px',
        }}>
          {/* Banner title */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🎯</span>
              <span style={{
                color: C.green, fontWeight: 900, fontSize: 13,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                textShadow: `0 0 20px ${C.green}60`,
              }}>EDGE DETECTED</span>
            </div>
            <div style={{
              padding: '5px 14px', borderRadius: 99,
              background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)',
              color: C.green, fontWeight: 900, fontSize: 22, letterSpacing: '-0.01em',
            }}>
              {edge(s.bestEdge)}
            </div>
          </div>

          {/* Bet line */}
          <div style={{
            color: C.green, fontWeight: 900, fontSize: 19,
            letterSpacing: '-0.01em', marginBottom: 12, lineHeight: 1.1,
          }}>
            BET: {betTeam?.toUpperCase()} YES @ {cent(betPrice!)}
          </div>

          {/* 3-col odds */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
            background: 'rgba(0,0,0,0.25)', borderRadius: 14, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <OddsCol label="Polymarket" value={cent(betPrice!)} color={C.cyan} />
            <div style={{ background: 'rgba(255,255,255,0.06)' }} />
            <OddsCol label="DK Implied" value={cent(dkImp!)} color={C.text} />
            <div style={{ background: 'rgba(255,255,255,0.06)' }} />
            <OddsCol label="Spread" value={spreadDisplay} color={C.purple} sub={s.dkTotal ? `O/U ${s.dkTotal}` : undefined} />
          </div>

          {/* Kelly + EV row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{
              flex: 1, padding: '8px 12px', borderRadius: 10,
              background: 'rgba(191,143,255,0.1)', border: '1px solid rgba(191,143,255,0.2)',
              textAlign: 'center',
            }}>
              <div style={{ color: C.textFaint, fontSize: 8, letterSpacing: '0.12em', marginBottom: 2 }}>KELLY SIZE</div>
              <div style={{ color: C.purple, fontWeight: 900, fontSize: 18 }}>{pct(kelly)}</div>
            </div>
            {evPer100 && (
              <div style={{
                flex: 1, padding: '8px 12px', borderRadius: 10,
                background: 'rgba(0,255,136,0.07)', border: '1px solid rgba(0,255,136,0.15)',
                textAlign: 'center',
              }}>
                <div style={{ color: C.textFaint, fontSize: 8, letterSpacing: '0.12em', marginBottom: 2 }}>EV / $100</div>
                <div style={{ color: C.green, fontWeight: 900, fontSize: 18 }}>
                  {parseFloat(evPer100) >= 0 ? '+' : ''}${evPer100}
                </div>
              </div>
            )}
          </div>

          {/* Confidence bar */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: C.textFaint, fontSize: 9, letterSpacing: '0.1em' }}>EDGE STRENGTH</span>
              <span style={{ color: C.textDim, fontSize: 9 }}>
                {s.bestEdge >= 0.10 ? 'STRONG' : s.bestEdge >= 0.06 ? 'SOLID' : 'LEAN'}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 4, background: 'rgba(0,255,136,0.1)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${Math.min(s.bestEdge * 600, 100)}%`,
                background: s.bestEdge >= 0.08 ? C.green : s.bestEdge >= 0.05 ? C.gold : '#f97316',
                boxShadow: `0 0 10px ${C.green}60`,
                transition: 'width 0.7s ease',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Game header ── */}
      <div style={{
        padding: '14px 18px 10px',
        borderBottom: `1px solid ${C.border}`,
        background: hasEdge ? 'transparent' : 'rgba(255,255,255,0.01)',
      }}>
        {/* Badge row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <SportBadge sport={s.sport || 'NBA'} />
          {isLive && <LiveBadge />}
          {tracked && <Pill label="tracked" color={C.green} bg="rgba(0,255,136,0.12)" />}
          {!hasEdge && <Pill label="no edge" color={C.textFaint} bg="rgba(255,255,255,0.04)" />}
        </div>

        {/* Teams */}
        <div style={{
          color: C.text, fontWeight: 900,
          fontSize: hasEdge ? 18 : 16,
          letterSpacing: '-0.02em', lineHeight: 1.1,
          marginBottom: 6,
        }}>
          {awayName.toUpperCase()} <span style={{ color: C.textFaint, fontWeight: 400, fontSize: 14 }}>vs</span> {homeName.toUpperCase()}
        </div>

        {/* Score if live */}
        {isLive && s.awayScore && s.homeScore && (
          <div style={{
            display: 'inline-flex', gap: 10, alignItems: 'center',
            padding: '4px 12px', borderRadius: 99, marginBottom: 6,
            background: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.2)',
          }}>
            <span style={{ color: C.text, fontWeight: 900, fontSize: 16 }}>{s.awayScore}</span>
            <span style={{ color: C.textFaint, fontSize: 11 }}>–</span>
            <span style={{ color: C.text, fontWeight: 900, fontSize: 16 }}>{s.homeScore}</span>
          </div>
        )}

        {/* Time row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: C.textDim, fontSize: 11 }}>
            {isLive ? '🔴 In Progress' : hhmm(s.gameTime)}
          </span>
          {!isLive && (
            <span style={{
              color: C.textFaint, fontSize: 10,
              padding: '1px 8px', borderRadius: 99,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
            }}>
              Starts in {timeUntil(s.gameTime)}
            </span>
          )}
        </div>
      </div>

      {/* ── Both sides price grid (always visible) ── */}
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ color: C.textFaint, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
          All Odds
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { team: s.polyAwayTeam || awayName, price: s.polyAwayPrice, imp: s.dkAwayImplied, e: s.awayEdge, ml: s.dkAwayML, side: 'AWAY' },
            { team: s.polyHomeTeam || homeName, price: s.polyHomePrice, imp: s.dkHomeImplied, e: s.homeEdge, ml: s.dkHomeML, side: 'HOME' },
          ].map((side) => {
            const hasThisEdge = hasEdge && (
              (s.bestSide === 'away' && side.side === 'AWAY') ||
              (s.bestSide === 'home' && side.side === 'HOME')
            )
            return (
              <div key={side.team} style={{
                borderRadius: 12, padding: '10px 12px',
                background: hasThisEdge ? 'rgba(0,255,136,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${hasThisEdge ? 'rgba(0,255,136,0.25)' : C.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: C.textFaint, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {side.side}
                  </span>
                  {hasThisEdge && <span style={{ color: C.green, fontSize: 9, fontWeight: 800 }}>★ BEST BET</span>}
                </div>
                <div style={{ color: C.textDim, fontSize: 10, marginBottom: 4, fontWeight: 600 }}>
                  {side.team}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: C.textFaint, fontSize: 7, letterSpacing: '0.1em' }}>POLY</div>
                    <div style={{ color: hasThisEdge ? C.cyan : C.text, fontWeight: 900, fontSize: 20 }}>{cent(side.price)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: C.textFaint, fontSize: 7, letterSpacing: '0.1em' }}>DK%</div>
                    <div style={{ color: C.textDim, fontWeight: 700, fontSize: 14 }}>{cent(side.imp)}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: C.textFaint, fontSize: 7, letterSpacing: '0.1em' }}>EDGE</div>
                    <div style={{
                      fontWeight: 800, fontSize: 14,
                      color: side.e >= 0.03 ? C.green : side.e <= -0.03 ? C.red : C.textDim,
                    }}>{edge(side.e)}</div>
                  </div>
                </div>
                <div style={{ color: C.textFaint, fontSize: 9, marginTop: 4 }}>
                  ML: {side.ml || 'N/A'}
                </div>
              </div>
            )
          })}
        </div>

        {/* Spread / total summary row */}
        {(s.dkSpread != null || s.dkTotal != null) && (
          <div style={{
            display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap',
          }}>
            {s.dkSpread != null && (
              <div style={{
                flex: 1, padding: '6px 10px', borderRadius: 8,
                background: 'rgba(191,143,255,0.05)', border: `1px solid rgba(191,143,255,0.12)`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: C.textFaint, fontSize: 9, letterSpacing: '0.08em' }}>SPREAD</span>
                <span style={{ color: C.purple, fontWeight: 800, fontSize: 13 }}>
                  {awayName.split(' ').pop()} {s.dkSpread > 0 ? `+${s.dkSpread}` : s.dkSpread}
                </span>
              </div>
            )}
            {s.dkTotal != null && (
              <div style={{
                flex: 1, padding: '6px 10px', borderRadius: 8,
                background: 'rgba(0,240,255,0.04)', border: `1px solid rgba(0,240,255,0.1)`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ color: C.textFaint, fontSize: 9, letterSpacing: '0.08em' }}>O/U</span>
                <span style={{ color: C.cyan, fontWeight: 800, fontSize: 13 }}>{s.dkTotal}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── AI Analysis (expandable) ── */}
      <div>
        {!narrative && hasEdge && (
          <button onClick={() => { onAnalyze(); setAnalysisOpen(true) }} style={{
            width: '100%', padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: C.textDim, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
            textAlign: 'left', borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ color: C.purple, fontSize: 14 }}>📊</span>
            AI Analysis — injuries, motivation, revenge games
            <span style={{ marginLeft: 'auto', color: C.textFaint, fontSize: 12 }}>›</span>
          </button>
        )}

        {narrative === 'loading' && (
          <div style={{ padding: '14px 18px', color: C.textDim, fontSize: 11, letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}` }}>
            ◈ Analyzing intel…
          </div>
        )}

        {narrative === 'error' && (
          <div style={{ padding: '14px 18px', color: C.red, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>
            Analysis failed.
          </div>
        )}

        {narrative && narrative !== 'loading' && narrative !== 'error' && (
          <div>
            <button onClick={() => setAnalysisOpen(o => !o)} style={{
              width: '100%', padding: '12px 18px',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(191,143,255,0.05)', border: 'none', cursor: 'pointer',
              color: C.textDim, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textAlign: 'left', borderBottom: `1px solid ${C.border}`,
            }}>
              <span style={{ color: C.purple }}>📊</span>
              AI Analysis
              {narrative.overallEdge !== 'none' && (
                <span style={{
                  marginLeft: 4, padding: '1px 8px', borderRadius: 99,
                  background: 'rgba(191,143,255,0.15)', color: C.purple,
                  fontSize: 9, fontWeight: 800,
                }}>
                  {narrative.edgeConfidence}% confident
                </span>
              )}
              <span style={{ marginLeft: 'auto', color: C.textFaint, fontSize: 14 }}>{analysisOpen ? '∧' : '›'}</span>
            </button>

            {analysisOpen && (
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                {/* Signals as bullets */}
                {narrative.signals.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    {narrative.signals.slice(0, 3).map((sig, i) => {
                      const sc = sig.severity === 'high' ? C.red : sig.severity === 'medium' ? C.gold : C.textDim
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{
                            width: 3, borderRadius: 3, flexShrink: 0, alignSelf: 'stretch',
                            minHeight: 18, background: sc, marginTop: 2,
                          }} />
                          <div>
                            <span style={{ color: sc, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              {sig.type}
                            </span>
                            <p style={{ color: 'rgba(200,215,255,0.7)', fontSize: 12, lineHeight: 1.5, margin: '2px 0 0' }}>
                              {sig.summary}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{
                  padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(191,143,255,0.07)', border: '1px solid rgba(191,143,255,0.18)',
                }}>
                  <p style={{ color: '#d4b8ff', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{narrative.aiSummary}</p>
                  {narrative.overallEdge !== 'none' && (
                    <div style={{ marginTop: 6, color: C.purple, fontSize: 11, fontWeight: 800 }}>
                      Narrative → {narrative.overallEdge === 'away' ? awayName : homeName} · {narrative.edgeConfidence}% confidence
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '10px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href={s.polyEventUrl} target="_blank" rel="noopener noreferrer" style={{
          color: C.textFaint, fontSize: 10, letterSpacing: '0.06em', textDecoration: 'none',
        }}>
          Polymarket ↗
        </a>
        {hasEdge && !tracked && (
          <button onClick={onTrack} style={{
            padding: '6px 16px', borderRadius: 99,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
            background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)',
            color: C.green, cursor: 'pointer',
          }}>+ Track Call</button>
        )}
      </div>
    </div>
  )
}

// ── Slate Summary Bar ─────────────────────────────────────────────────────────
function SlateSummary({ signals }: { signals: Signal[] }) {
  const edgeSignals = signals.filter(s => s.bestSide !== 'none')
  const bestEdge = edgeSignals.reduce((max, s) => Math.max(max, s.bestEdge), 0)

  if (signals.length === 0) return null

  return (
    <div style={{
      borderRadius: 16, padding: '14px 18px', marginBottom: 16,
      background: edgeSignals.length > 0
        ? 'linear-gradient(135deg, rgba(0,255,136,0.07), rgba(0,240,255,0.03))'
        : C.surface,
      border: `1px solid ${edgeSignals.length > 0 ? 'rgba(0,255,136,0.2)' : C.border}`,
      display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
    }}>
      <span style={{ color: C.textDim, fontSize: 12, fontWeight: 600 }}>
        {signals.length} games analyzed
      </span>
      <span style={{ color: C.textFaint, fontSize: 12 }}>·</span>
      <span style={{ color: edgeSignals.length > 0 ? C.green : C.textFaint, fontSize: 12, fontWeight: 700 }}>
        {edgeSignals.length} edges found
      </span>
      {bestEdge > 0 && (
        <>
          <span style={{ color: C.textFaint, fontSize: 12 }}>·</span>
          <span style={{ color: C.cyan, fontSize: 12, fontWeight: 700 }}>
            Best edge: {edge(bestEdge)}
          </span>
        </>
      )}
      <div style={{ marginLeft: 'auto', color: C.textFaint, fontSize: 10 }}>
        {edgeSignals.length > 0 ? '↓ Sorted by edge' : 'No edges right now'}
      </div>
    </div>
  )
}

// ── Calls Tracker Drawer ──────────────────────────────────────────────────────
function TrackerDrawer({
  calls, onUpdate, onClose,
}: {
  calls: TrackedCall[]
  onUpdate: (calls: TrackedCall[]) => void
  onClose: () => void
}) {
  const [showSettled, setShowSettled] = useState(false)
  const s = useMemo(() => calcStats(calls), [calls])
  const wr = s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) : 0
  const pending = calls.filter(c => c.status === 'pending')
  const settled = calls.filter(c => c.status !== 'pending' && c.status !== 'void')

  const displayed = showSettled ? [...settled].sort((a, b) => b.settledAt!.localeCompare(a.settledAt!)) : pending

  function mark(id: string, status: CallStatus) {
    const call = calls.find(c => c.id === id)
    if (!call) return
    const pnl = calcPnL(status, call.kellySize, call.polymarketPrice)
    onUpdate(updateCallStatus(id, status, status === 'void' ? null : pnl))
  }

  const statusColor: Record<CallStatus, string> = {
    pending: C.gold, won: C.green, lost: C.red, push: C.cyan, void: C.textDim,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex' }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(2,2,15,0.8)', backdropFilter: 'blur(10px)' }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative', zIndex: 1, marginLeft: 'auto',
        width: '100%', maxWidth: 520, height: '100%',
        background: '#06061a', borderLeft: `1px solid ${C.borderMid}`,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ color: C.text, fontWeight: 900, fontSize: 18, margin: 0 }}>📊 Calls Tracker</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {calls.length > 0 && (
                <button onClick={() => { deleteCalls(); onUpdate([]) }} style={{
                  fontSize: 10, padding: '6px 12px', borderRadius: 10,
                  background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.2)',
                  color: C.red, cursor: 'pointer', fontWeight: 700,
                }}>Clear</button>
              )}
              <button onClick={onClose} style={{
                width: 32, height: 32, borderRadius: 10,
                background: C.surface, border: `1px solid ${C.border}`,
                color: C.textDim, cursor: 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>×</button>
            </div>
          </div>

          {s.total > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { label: 'Record', val: `${s.wins}W-${s.losses}L`, color: C.text },
                { label: 'Win %', val: s.settled > 0 ? pct(wr) : '—', color: wr >= 0.55 ? C.green : wr >= 0.44 ? C.gold : s.settled > 0 ? C.red : C.textDim },
                { label: 'P&L', val: s.settled > 0 ? units(s.totalPnL) : '—', color: s.totalPnL >= 0 ? C.green : C.red },
                { label: 'ROI', val: s.settled > 0 ? pct(s.roi) : '—', color: s.roi >= 0 ? C.green : C.red },
              ].map(stat => (
                <div key={stat.label} style={{
                  padding: '10px 8px', borderRadius: 12, textAlign: 'center',
                  background: C.surface, border: `1px solid ${C.border}`,
                }}>
                  <div style={{ color: stat.color, fontWeight: 900, fontSize: 15 }}>{stat.val}</div>
                  <div style={{ color: C.textFaint, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {s.settled >= 2 && (
            <div style={{ marginTop: 10, padding: '8px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}` }}>
              <RoiSpark calls={calls} />
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 6, flexShrink: 0 }}>
          {[false, true].map(show => (
            <button key={String(show)} onClick={() => setShowSettled(show)} style={{
              flex: 1, padding: '8px', borderRadius: 10, fontSize: 11, fontWeight: 800,
              cursor: 'pointer', letterSpacing: '0.06em',
              background: showSettled === show ? 'rgba(0,240,255,0.1)' : 'transparent',
              border: `1px solid ${showSettled === show ? C.borderMid : C.border}`,
              color: showSettled === show ? C.cyan : C.textDim,
            }}>
              {show ? `Settled (${settled.length})` : `Pending (${pending.length})`}
            </button>
          ))}
          <button onClick={() => exportCSV(calls)} style={{
            padding: '8px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800,
            cursor: 'pointer', background: 'transparent', border: `1px solid ${C.border}`,
            color: C.textFaint,
          }}>↓ CSV</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {displayed.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.textFaint, fontSize: 13 }}>
              {showSettled ? 'No settled calls yet.' : 'No pending calls.'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayed.map(c => {
              const sc = statusColor[c.status]
              return (
                <div key={c.id} style={{
                  borderRadius: 16, padding: '14px 16px',
                  background: c.status === 'won' ? 'rgba(0,255,136,0.04)'
                    : c.status === 'lost' ? 'rgba(255,68,102,0.04)'
                    : C.surface,
                  border: `1px solid ${sc}25`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.text, fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>{c.game}</div>
                      <div style={{ color: C.textFaint, fontSize: 10, marginTop: 3 }}>
                        {new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' · '}
                        <span style={{ color: C.cyan }}>Edge {edge(c.edge)}</span>
                        {' · '}
                        <span style={{ color: C.purple }}>Kelly {pct(c.kellySize)}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <Pill label={c.status} color={sc} bg={sc + '18'} />
                      {c.profitLoss !== null && c.status !== 'void' && (
                        <span style={{ color: c.profitLoss >= 0 ? C.green : C.red, fontSize: 13, fontWeight: 900 }}>
                          {units(c.profitLoss)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ color: C.textDim, fontSize: 11, lineHeight: 1.4, marginBottom: c.status === 'pending' ? 10 : 0 }}>
                    {c.recommendation}
                  </div>
                  {c.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['won', 'lost', 'push', 'void'] as CallStatus[]).map(st => (
                        <button key={st} onClick={() => mark(c.id, st)} style={{
                          flex: 1, padding: '6px 4px', borderRadius: 8,
                          fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                          cursor: 'pointer',
                          background: statusColor[st] + '15',
                          border: `1px solid ${statusColor[st]}35`,
                          color: statusColor[st],
                        }}>{st}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── History Drawer ────────────────────────────────────────────────────────────
function HistoryDrawer({
  scans, onDelete, onClose,
}: {
  scans: SavedScan[]
  onDelete: () => void
  onClose: () => void
}) {
  const [active, setActive] = useState<SavedScan | null>(null)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex' }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(2,2,15,0.8)', backdropFilter: 'blur(10px)' }}
        onClick={() => { setActive(null); onClose() }}
      />
      <div style={{
        position: 'relative', zIndex: 1, marginLeft: 'auto',
        width: '100%', maxWidth: 520, height: '100%',
        background: '#06061a', borderLeft: `1px solid ${C.borderMid}`,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {active && (
              <button onClick={() => setActive(null)} style={{
                display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                color: C.textDim, fontSize: 11, cursor: 'pointer', marginBottom: 6, padding: 0,
              }}>← Back</button>
            )}
            <h2 style={{ color: C.text, fontWeight: 900, fontSize: 18, margin: 0 }}>◷ Scan History</h2>
            <p style={{ color: C.textFaint, fontSize: 11, marginTop: 2 }}>{scans.length} saved</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {scans.length > 0 && !active && (
              <button onClick={onDelete} style={{ fontSize: 10, padding: '6px 12px', borderRadius: 10, background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.2)', color: C.red, cursor: 'pointer', fontWeight: 700 }}>Clear</button>
            )}
            <button onClick={() => { setActive(null); onClose() }} style={{ width: 32, height: 32, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, color: C.textDim, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {scans.length === 0 && <p style={{ color: C.textFaint, textAlign: 'center', marginTop: 40 }}>No scans yet.</p>}
          {active ? (
            <ScanReport scan={active} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scans.map(s => {
                const d = new Date(s.scannedAt)
                return (
                  <button key={s.id} onClick={() => setActive(s)} style={{
                    width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 16, cursor: 'pointer',
                    background: C.surface, border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>
                          {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                        <div style={{ color: C.textFaint, fontSize: 11, marginTop: 2 }}>{s.gamesAnalyzed} games · ${s.bankroll} bankroll</div>
                      </div>
                      <span style={{ color: C.purple, fontSize: 20 }}>›</span>
                    </div>
                    <p style={{ color: C.textDim, fontSize: 11, marginTop: 8, lineHeight: 1.4, display: '-webkit-box', overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
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
  )
}

// ── Scan Report ───────────────────────────────────────────────────────────────
function ScanReport({ scan }: { scan: SavedScan }) {
  const d = new Date(scan.scannedAt)
  return (
    <div>
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 12, background: C.surface, border: `1px solid ${C.border}` }}>
        <span style={{ color: C.textFaint, fontSize: 11 }}>
          {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {' at '}{d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          {' · '}{scan.gamesAnalyzed} games · ${scan.bankroll} bankroll
        </span>
      </div>
      {scan.report.split('\n').map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} style={{ height: 6 }} />
        const parts = t.split(/\*\*(.*?)\*\*/g)
        const rendered = parts.map((p, j) =>
          j % 2 === 1
            ? <span key={j} style={{ color: '#e0d0ff', fontWeight: 800 }}>{p}</span>
            : <span key={j}>{p}</span>
        )
        if (t.toLowerCase().includes('top pick') || t.includes('⚡'))
          return <div key={i} style={{ margin: '12px 0 6px', padding: '12px 14px', borderRadius: 12, background: 'rgba(0,240,255,0.07)', border: `1px solid ${C.borderMid}`, color: C.cyan, fontWeight: 800, fontSize: 13 }}>{rendered}</div>
        if (t.includes('STRONG BET'))
          return <p key={i} style={{ color: C.green, fontWeight: 700, marginBottom: 4, fontSize: 13 }}>{rendered}</p>
        if (t.includes('PASS'))
          return <p key={i} style={{ color: C.textDim, marginBottom: 4, fontSize: 13 }}>{rendered}</p>
        if (t.includes('LEAN'))
          return <p key={i} style={{ color: C.gold, fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{rendered}</p>
        return <p key={i} style={{ color: 'rgba(180,210,255,0.75)', marginBottom: 4, fontSize: 13, lineHeight: 1.7 }}>{rendered}</p>
      })}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BotPage() {
  const [data,            setData]            = useState<ScanResult | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState<string | null>(null)
  const [filter,          setFilter]          = useState<'edge' | 'all'>('edge')
  const [narratives,      setNarratives]      = useState<Record<string, NarrativeResult | 'loading' | 'error'>>({})
  const [fullScan,        setFullScan]        = useState<SavedScan | null>(null)
  const [fullScanLoading, setFullScanLoading] = useState(false)
  const [bankroll,        setBankroll]        = useState(200)
  const [savedScans,      setSavedScans]      = useState<SavedScan[]>([])
  const [showHistory,     setShowHistory]     = useState(false)
  const [showTracker,     setShowTracker]     = useState(false)
  const [trackedCalls,    setTrackedCalls]    = useState<TrackedCall[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('poly-scans')
    if (stored) setSavedScans(JSON.parse(stored))
    setTrackedCalls(loadCalls())
  }, [])

  const pendingCount = trackedCalls.filter(c => c.status === 'pending').length

  function persistScan(scan: SavedScan) {
    const stored = localStorage.getItem('poly-scans')
    const existing: SavedScan[] = stored ? JSON.parse(stored) : []
    const updated = [scan, ...existing].slice(0, 50)
    localStorage.setItem('poly-scans', JSON.stringify(updated))
    setSavedScans(updated)
  }

  function autoLog(scanData: ScanResult) {
    for (const s of scanData.signals.filter(s => s.bestSide !== 'none')) {
      const price    = s.bestSide === 'away' ? s.polyAwayPrice : s.polyHomePrice
      const dkImplied = s.bestSide === 'away' ? s.dkAwayImplied : s.dkHomeImplied
      const kelly    = calcKelly(s.bestEdge, price)
      addCall({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        gameId: s.gameId,
        game: s.gameName,
        sport: s.sport || 'NBA',
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
      })
    }
    setTrackedCalls(loadCalls())
  }

  async function runFullScan() {
    setFullScanLoading(true); setFullScan(null)
    try {
      const res  = await fetch(`/api/bot/fullscan?bankroll=${bankroll}`)
      const json = await res.json()
      const scan: SavedScan = { ...json, bankroll, id: crypto.randomUUID() }
      setFullScan(scan); persistScan(scan)
    } catch {
      setFullScan({ report: 'Scan failed.', gamesAnalyzed: 0, scannedAt: new Date().toISOString(), bankroll, id: crypto.randomUUID() })
    } finally { setFullScanLoading(false) }
  }

  async function scan() {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/bot/scan')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json); autoLog(json)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function analyzeGame(s: Signal) {
    setNarratives(prev => ({ ...prev, [s.gameId]: 'loading' }))
    try {
      const res = await fetch('/api/bot/signals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: s.gameName,
          awayTeam: s.gameName.split(' @ ')[0],
          homeTeam: s.gameName.split(' @ ')[1],
          gameTime: new Date(s.gameTime).toLocaleString(),
        }),
      })
      if (!res.ok) throw new Error('failed')
      const result = await res.json()
      setNarratives(prev => ({ ...prev, [s.gameId]: result }))
    } catch (_e) { setNarratives(prev => ({ ...prev, [s.gameId]: 'error' })) }
  }

  function trackSignal(s: Signal) {
    const price = s.bestSide === 'away' ? s.polyAwayPrice : s.polyHomePrice
    addCall({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      gameId: s.gameId,
      game: s.gameName,
      sport: s.sport || 'NBA',
      recommendation: s.recommendation,
      bettingSide: s.bestSide as 'away' | 'home',
      polymarketPrice: price,
      dkImplied: s.bestSide === 'away' ? s.dkAwayImplied : s.dkHomeImplied,
      edge: s.bestEdge,
      kellySize: calcKelly(s.bestEdge, price),
      status: 'pending',
      settledAt: null, profitLoss: null, notes: '',
    })
    setTrackedCalls(loadCalls())
  }

  useEffect(() => { scan() }, [])

  // Sort: edges first (by bestEdge desc), then no-edge games
  const allSignals = data?.signals || []
  const edgeSignals = allSignals.filter(s => s.bestSide !== 'none').sort((a, b) => b.bestEdge - a.bestEdge)
  const noEdgeSignals = allSignals.filter(s => s.bestSide === 'none')
  const sortedSignals = [...edgeSignals, ...noEdgeSignals]
  const displayed = filter === 'edge' ? edgeSignals : sortedSignals

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      position: 'relative',
    }}>
      <style>{`
        @keyframes shimmer { 0% { opacity: 0.3 } 50% { opacity: 0.7 } 100% { opacity: 0.3 } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
      `}</style>

      {/* Background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(rgba(0,240,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.02) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,255,136,0.03) 0%, transparent 60%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '28px 14px 80px' }}>

        {/* ── HEADER ── */}
        <div style={{ marginBottom: 24 }}>
          <a href="/" style={{ color: C.textFaint, fontSize: 10, letterSpacing: '0.15em', textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}>← BACK</a>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', margin: 0, lineHeight: 1 }}>
                <span style={{ color: C.green, textShadow: `0 0 24px ${C.green}44` }}>EDGE</span>
                <span style={{ color: C.text }}> SCANNER</span>
              </h1>
              <p style={{ color: C.textFaint, fontSize: 11, letterSpacing: '0.06em', marginTop: 4 }}>
                Polymarket vs DraftKings · NBA · Paper Trading
              </p>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setShowTracker(true)} style={{
                position: 'relative', padding: '9px 14px', borderRadius: 12,
                fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer',
                background: pendingCount > 0 ? 'rgba(255,215,0,0.1)' : C.surface,
                border: `1px solid ${pendingCount > 0 ? 'rgba(255,215,0,0.3)' : C.border}`,
                color: pendingCount > 0 ? C.gold : C.textDim,
              }}>
                📊 CALLS
                {pendingCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, right: -5,
                    width: 16, height: 16, borderRadius: '50%',
                    background: C.gold, color: C.bg,
                    fontSize: 9, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{pendingCount}</span>
                )}
              </button>
              <button onClick={() => setShowHistory(true)} style={{
                position: 'relative', padding: '9px 14px', borderRadius: 12,
                fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer',
                background: C.surface, border: `1px solid ${C.border}`, color: C.textDim,
              }}>
                ◷ HISTORY
                {savedScans.length > 0 && (
                  <span style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: C.purple, color: '#fff', fontSize: 9, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{savedScans.length}</span>
                )}
              </button>
              <button onClick={scan} disabled={loading} style={{
                padding: '9px 16px', borderRadius: 12,
                fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', cursor: 'pointer',
                background: 'rgba(0,255,136,0.1)', border: `1px solid rgba(0,255,136,0.3)`,
                color: loading ? C.textDim : C.green,
              }}>
                {loading ? '⟳' : '⟳ SCAN'}
              </button>
            </div>
          </div>
        </div>

        {/* ── STATS BAR ── */}
        <StatsBar calls={trackedCalls} />

        {/* ── LIVE SCAN SUMMARY ── */}
        {data && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Games', val: data.gamesScanned },
              { label: 'Poly Matched', val: data.polyMarketsFound },
              { label: 'Edges Found', val: data.edgeSignals, glow: data.edgeSignals > 0 },
            ].map(s => (
              <div key={s.label} style={{
                flex: '1 1 80px', borderRadius: 14, padding: '10px 12px', textAlign: 'center',
                background: s.glow ? 'rgba(0,255,136,0.06)' : C.surface,
                border: `1px solid ${s.glow ? 'rgba(0,255,136,0.22)' : C.border}`,
              }}>
                <div style={{ fontWeight: 900, fontSize: 20, color: s.glow ? C.green : C.text }}>{s.val}</div>
                <div style={{ color: C.textFaint, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
            <div style={{ flex: '0 0 100%', display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ color: C.textFaint, fontSize: 10 }}>Updated {new Date(data.scannedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        )}

        {/* ── AI FULL SCAN ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: '8px 14px',
            }}>
              <span style={{ color: C.textFaint, fontSize: 12 }}>$</span>
              <input
                type="number" value={bankroll}
                onChange={e => setBankroll(Number(e.target.value))}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: C.cyan, fontSize: 15, fontWeight: 800, width: '100%' }}
              />
              <span style={{ color: C.textFaint, fontSize: 10, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>USDC bankroll</span>
            </div>
          </div>

          <button onClick={runFullScan} disabled={fullScanLoading} style={{
            width: '100%', padding: '15px', borderRadius: 16,
            fontSize: 13, fontWeight: 800, letterSpacing: '0.04em',
            cursor: fullScanLoading ? 'not-allowed' : 'pointer',
            background: fullScanLoading
              ? C.surface
              : 'linear-gradient(135deg, rgba(191,143,255,0.18), rgba(0,240,255,0.08))',
            border: `1px solid ${fullScanLoading ? C.border : 'rgba(191,143,255,0.45)'}`,
            color: fullScanLoading ? C.textDim : '#d4b8ff',
            boxShadow: fullScanLoading ? 'none' : '0 0 30px rgba(191,143,255,0.12)',
            transition: 'all 0.2s',
          }}>
            {fullScanLoading
              ? '◈  Analyzing all games with AI — ~30s…'
              : '◈  AI Full Scan  —  What should I bet today?'}
          </button>

          {fullScan && !fullScanLoading && (
            <div style={{
              marginTop: 12, borderRadius: 20, padding: '20px',
              background: 'rgba(191,143,255,0.05)',
              border: '1px solid rgba(191,143,255,0.18)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ color: '#c4b5fd', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em' }}>
                  ◈ AI ANALYSIS · {fullScan.gamesAnalyzed} games
                </span>
                <span style={{ color: C.textFaint, fontSize: 10 }}>{new Date(fullScan.scannedAt).toLocaleTimeString()}</span>
              </div>
              <ScanReport scan={fullScan} />
            </div>
          )}
        </div>

        {/* ── FILTER TABS ── */}
        <div style={{
          display: 'flex', gap: 4, padding: 4, borderRadius: 14,
          background: C.surface, border: `1px solid ${C.border}`, marginBottom: 16,
        }}>
          {([['edge', '🎯  EDGE SIGNALS'], ['all', '◈  ALL GAMES']] as const).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              flex: 1, padding: '9px', borderRadius: 10,
              fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
              cursor: 'pointer', transition: 'all 0.15s',
              background: filter === f ? 'rgba(0,240,255,0.1)' : 'transparent',
              border: `1px solid ${filter === f ? C.borderMid : 'transparent'}`,
              color: filter === f ? C.cyan : C.textDim,
            }}>{label}</button>
          ))}
        </div>

        {/* ── SIGNAL CARDS ── */}
        {error && (
          <div style={{ borderRadius: 16, padding: 16, textAlign: 'center', background: 'rgba(255,68,102,0.07)', border: '1px solid rgba(255,68,102,0.2)' }}>
            <p style={{ color: C.red, fontSize: 13 }}>⚠ {error}</p>
          </div>
        )}

        {/* Skeleton loading */}
        {loading && !data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Slate summary */}
        {!loading && !error && data && (
          <SlateSummary signals={displayed} />
        )}

        {!loading && !error && displayed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🏀</div>
            <p style={{ color: C.textDim, fontSize: 15, fontWeight: 700 }}>
              {filter === 'edge' ? 'No edge signals right now.' : 'No games found — check back closer to tip-off.'}
            </p>
            <p style={{ color: C.textFaint, fontSize: 12, marginTop: 8 }}>
              {filter === 'edge'
                ? 'Switch to "All Games" to browse the full slate.'
                : 'Markets open a few hours before tip-off.'}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {displayed.map(s => (
            <SignalCard
              key={s.gameId}
              s={s}
              trackedCalls={trackedCalls}
              onTrack={() => trackSignal(s)}
              narrative={narratives[s.gameId]}
              onAnalyze={() => analyzeGame(s)}
            />
          ))}
        </div>

      </div>

      {/* ── DRAWERS ── */}
      {showHistory && (
        <HistoryDrawer
          scans={savedScans}
          onDelete={() => { localStorage.removeItem('poly-scans'); setSavedScans([]) }}
          onClose={() => setShowHistory(false)}
        />
      )}
      {showTracker && (
        <TrackerDrawer
          calls={trackedCalls}
          onUpdate={setTrackedCalls}
          onClose={() => setShowTracker(false)}
        />
      )}
    </div>
  )
}
