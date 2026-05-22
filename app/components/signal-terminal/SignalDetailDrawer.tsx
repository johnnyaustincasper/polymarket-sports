'use client'

import { buildWhyCare, classifySignalDecision } from '../../lib/signals/insight'
import ChangedSinceRefreshFeed from './ChangedSinceRefreshFeed'
import CorrelationWarnings from './CorrelationWarnings'
import LineupInjuryFlags from './LineupInjuryFlags'
import PriceFairMovementChart from './PriceFairMovementChart'
import SportsbookConsensusPanel from './SportsbookConsensusPanel'
import WatchlistControls from './WatchlistControls'
import type { SignalDrawerProps, SignalTerminalSignal, SignalTier } from './types'

const C = {
  green: '#a6ff3f',
  amber: '#ffd166',
  red: '#ff4d6d',
  cyan: '#8df7ff',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.66)',
  faint: 'rgba(244,255,232,0.38)',
  border: 'rgba(255,255,255,0.10)',
  borderHot: 'rgba(166,255,63,0.36)',
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toProbability(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return undefined
  return Math.abs(value) <= 1 ? value : value / 100
}

function toCents(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return null
  return Math.abs(value) <= 1 ? value * 100 : value
}

function formatCents(value: number | null | undefined, fallback = '—') {
  const cents = toCents(value)
  if (cents == null) return fallback
  const rounded = Math.round(cents * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}c`
}

function formatSignedCents(value: number | null | undefined, fallback = '—') {
  const cents = toCents(value)
  if (cents == null) return fallback
  const rounded = Math.round(cents * 10) / 10
  const display = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
  return `${rounded > 0 ? '+' : ''}${display}c`
}

function formatPercent(value: number | null | undefined, fallback = '—') {
  if (!isFiniteNumber(value)) return fallback
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  const rounded = Math.round(pct * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

function formatNumber(value: number | null | undefined, fallback = '—') {
  if (!isFiniteNumber(value)) return fallback
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

function safeTier(tier: SignalTier | null | undefined): 'A' | 'B' | 'WATCH' | 'KILL' | undefined {
  return tier === 'A' || tier === 'B' || tier === 'WATCH' || tier === 'KILL' ? tier : undefined
}

function tierColor(tier: SignalTier | null | undefined) {
  if (tier === 'A') return C.green
  if (tier === 'B') return C.cyan
  if (tier === 'KILL') return C.red
  return C.amber
}

function decisionColor(decision: string) {
  if (decision === 'actionable') return C.green
  if (decision === 'trap' || decision === 'stale' || decision === 'pass') return C.red
  if (decision === 'thin') return C.amber
  return C.cyan
}

function titleFor(signal: SignalTerminalSignal) {
  return signal.player || signal.marketTitle || signal.label || signal.ticker || 'Signal detail'
}

function subtitleFor(signal: SignalTerminalSignal) {
  return [signal.label && signal.label !== signal.player ? signal.label : '', signal.matchup, signal.gameTime].filter(Boolean).join(' · ')
}

function SectionTitle({ children }: { children: string }) {
  return <div style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>{children}</div>
}

export default function SignalDetailDrawer({
  signal,
  open = true,
  watched = false,
  onClose,
  onToggleWatch,
  onOpenMarket,
  deltas,
}: SignalDrawerProps) {
  if (!open || !signal) return null

  const tier = signal.tier ?? 'WATCH'
  const consensus = signal.consensus ?? signal.sportsbookConsensus ?? null
  const decision = classifySignalDecision({
    tier: safeTier(tier),
    edge: toProbability(signal.edge),
    ask: toProbability(signal.ask),
    maxBuy: toProbability(signal.maxBuy),
    liquidityGrade: signal.liquidityGrade ?? undefined,
    flags: signal.flags,
    generatedAt: signal.generatedAt ?? signal.createdAt,
  })
  const hotColor = decisionColor(decision.decision)
  const whyCare = buildWhyCare({
    player: titleFor(signal),
    label: signal.label || signal.metric || 'market signal',
    edge: toProbability(signal.edge),
    fairPrice: toProbability(signal.fairPrice),
    ask: toProbability(signal.ask),
    hitRate: toProbability(signal.hitRate ?? signal.projectedHitPct),
    hits: signal.hits ?? undefined,
    games: signal.games ?? undefined,
    reasons: signal.reasons,
    flags: signal.flags,
  })

  return (
    <aside style={{ borderRadius: 22, padding: 1, background: `linear-gradient(135deg, ${hotColor}88, rgba(141,247,255,0.18), rgba(255,255,255,0.08))`, boxShadow: `0 18px 60px rgba(0,0,0,0.44), 0 0 34px ${hotColor}18` }}>
      <div style={{ borderRadius: 21, padding: 15, background: 'linear-gradient(145deg, rgba(8,13,6,0.985), rgba(2,5,1,0.98))', border: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ color: tierColor(tier), fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tier} signal</span>
              <span style={{ color: hotColor, fontSize: 8, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 7px', background: `${hotColor}16`, border: `1px solid ${hotColor}55` }}>{decision.label}</span>
            </div>
            <div style={{ color: C.text, fontSize: 20, fontWeight: 950, marginTop: 6, lineHeight: 1.1 }}>{titleFor(signal)}</div>
            <div style={{ color: C.muted, fontSize: 11, lineHeight: 1.35, marginTop: 4 }}>{subtitleFor(signal) || 'No matchup metadata supplied'}</div>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close signal detail" style={{ border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.035)', color: C.muted, borderRadius: 999, width: 30, height: 30, cursor: 'pointer', fontSize: 16, lineHeight: '28px' }}>×</button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 7, marginBottom: 12 }}>
          {[
            ['Edge', formatSignedCents(signal.edge), hotColor],
            ['Ask', formatCents(signal.ask), C.amber],
            ['Fair', formatCents(signal.fairPrice), C.green],
            ['Max buy', formatCents(signal.maxBuy), C.text],
            ['Hit', signal.hits != null && signal.games != null ? `${formatNumber(signal.hits)}/${formatNumber(signal.games)}` : formatPercent(signal.hitRate ?? signal.projectedHitPct), C.cyan],
            ['Conf', formatPercent(signal.confidence), C.text],
          ].map(([label, value, color]) => (
            <div key={label} style={{ minWidth: 0, borderRadius: 11, padding: '8px 6px', background: 'rgba(255,255,255,0.036)', border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ color, fontSize: 12, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
              <div style={{ color: C.muted, fontSize: 7, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(260px,0.85fr)', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <PriceFairMovementChart points={signal.movement} />
            <div style={{ borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.20)', border: `1px solid ${C.border}` }}>
              <SectionTitle>Why care</SectionTitle>
              <div style={{ display: 'grid', gap: 7 }}>
                {whyCare.map((bullet) => (
                  <div key={bullet} style={{ color: C.muted, fontSize: 10, lineHeight: 1.42, display: 'grid', gridTemplateColumns: '14px minmax(0,1fr)', gap: 5 }}>
                    <span style={{ color: C.green }}>›</span>
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 9, color: C.faint, fontSize: 9, lineHeight: 1.4 }}>{decision.reason}</div>
            </div>
            <SportsbookConsensusPanel consensus={consensus} />
          </div>

          <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
            <WatchlistControls
              signal={signal}
              watched={watched}
              onToggleWatch={onToggleWatch ? (next) => { if (next) onToggleWatch(next) } : undefined}
              onOpenMarket={onOpenMarket ? (next) => { if (next) onOpenMarket(next) } : undefined}
              note={signal.ticker ? `Tracking ${signal.ticker}.` : undefined}
            />
            <ChangedSinceRefreshFeed changes={deltas?.filter((delta) => delta.id === signal.id)} />
            <LineupInjuryFlags flags={signal.lineupFlags} />
            <CorrelationWarnings warnings={signal.correlationWarnings} items={signal.correlationItems} />
            <div style={{ borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.18)', border: `1px solid ${C.border}` }}>
              <SectionTitle>Execution notes</SectionTitle>
              <div style={{ display: 'grid', gap: 6, color: C.muted, fontSize: 9, lineHeight: 1.4 }}>
                <div>Liquidity: {signal.liquidityLabel || signal.liquidityGrade || formatNumber(signal.liquidity)}</div>
                <div>Ask size: {formatNumber(signal.askSize)} · Bid size: {formatNumber(signal.bidSize)}</div>
                <div>Risk: {signal.risk || 'No explicit risk note supplied.'}</div>
                <div>Ticker: {signal.ticker || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
