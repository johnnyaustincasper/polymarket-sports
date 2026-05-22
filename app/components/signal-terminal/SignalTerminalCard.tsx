'use client'

import type { KeyboardEvent } from 'react'
import { buildWhyCare, classifySignalDecision } from '../../lib/signals/insight'
import CorrelationWarnings from './CorrelationWarnings'
import LineupInjuryFlags from './LineupInjuryFlags'
import PriceFairMovementChart from './PriceFairMovementChart'
import WatchlistControls from './WatchlistControls'
import type { SignalTerminalCardProps, SignalTerminalSignal, SignalTier } from './types'

const C = {
  green: '#a6ff3f',
  amber: '#ffd166',
  red: '#ff4d6d',
  cyan: '#8df7ff',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.66)',
  faint: 'rgba(244,255,232,0.38)',
  border: 'rgba(255,255,255,0.10)',
  borderHot: 'rgba(166,255,63,0.38)',
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
  return signal.player || signal.marketTitle || signal.label || signal.ticker || 'Signal'
}

function subtitleFor(signal: SignalTerminalSignal) {
  return [signal.label && signal.label !== signal.player ? signal.label : '', signal.matchup, signal.gameTime].filter(Boolean).join(' · ')
}

function onCardKeyDown(event: KeyboardEvent<HTMLDivElement>, signal: SignalTerminalSignal, onOpen?: (signal: SignalTerminalSignal) => void) {
  if (!onOpen) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onOpen(signal)
  }
}

export default function SignalTerminalCard({
  signal,
  selected = false,
  compact = false,
  watched = false,
  onOpen,
  onToggleWatch,
  onOpenMarket,
}: SignalTerminalCardProps) {
  const tier = signal.tier ?? 'WATCH'
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
  const hasWarnings = Boolean(signal.lineupFlags?.length || signal.correlationWarnings?.length || signal.correlationItems?.length)

  return (
    <div
      role={onOpen ? 'button' : 'article'}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(signal)}
      onKeyDown={(event) => onCardKeyDown(event, signal, onOpen)}
      style={{
        position: 'relative',
        borderRadius: 20,
        padding: 1,
        background: selected
          ? `linear-gradient(135deg, ${hotColor}, rgba(255,255,255,0.13), rgba(166,255,63,0.15))`
          : `linear-gradient(135deg, ${tierColor(tier)}55, rgba(255,255,255,0.08), rgba(0,0,0,0.12))`,
        boxShadow: selected ? `0 0 34px ${hotColor}22, 0 18px 54px rgba(0,0,0,0.44)` : '0 16px 42px rgba(0,0,0,0.34)',
        cursor: onOpen ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: selected ? 0.18 : 0.10, background: 'radial-gradient(circle at 20% 0%, rgba(166,255,63,0.36), transparent 34%), radial-gradient(circle at 90% 12%, rgba(141,247,255,0.22), transparent 30%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', borderRadius: 19, padding: compact ? 12 : 14, background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: `1px solid ${selected ? C.borderHot : C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: tierColor(tier), fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tier} signal</span>
              <span style={{ color: hotColor, fontSize: 8, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', borderRadius: 999, padding: '3px 6px', border: `1px solid ${hotColor}55`, background: `${hotColor}16` }}>{decision.label}</span>
              {signal.sport && <span style={{ color: C.faint, fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{signal.sport}</span>}
            </div>
            <div style={{ color: C.text, fontSize: compact ? 14 : 16, fontWeight: 950, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleFor(signal)}</div>
            <div style={{ color: C.muted, fontSize: compact ? 9 : 10, lineHeight: 1.35, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitleFor(signal) || 'No market label supplied'}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ color: hotColor, fontSize: compact ? 15 : 18, fontWeight: 950, lineHeight: 1 }}>{formatSignedCents(signal.edge)}</div>
            <div style={{ color: C.muted, fontSize: 8, fontWeight: 900, marginTop: 4 }}>{formatCents(signal.ask)} ask</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6, marginTop: 11 }}>
          {[
            ['Fair', formatCents(signal.fairPrice), C.green],
            ['Max buy', formatCents(signal.maxBuy), C.amber],
            ['Hit', signal.hits != null && signal.games != null ? `${formatNumber(signal.hits)}/${formatNumber(signal.games)}` : formatPercent(signal.hitRate ?? signal.projectedHitPct), C.text],
            ['Conf', formatPercent(signal.confidence), C.cyan],
          ].map(([label, value, color]) => (
            <div key={label} style={{ minWidth: 0, borderRadius: 11, padding: '7px 6px', background: 'rgba(255,255,255,0.036)', border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ color, fontSize: 11, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
              <div style={{ color: C.muted, fontSize: 7, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>

        {!compact && signal.movement?.length ? <PriceFairMovementChart points={signal.movement} compact style={{ marginTop: 10 }} /> : null}

        <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
          {whyCare.slice(0, compact ? 2 : 4).map((bullet) => (
            <div key={bullet} style={{ color: C.muted, fontSize: 9, lineHeight: 1.35, display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: 4 }}>
              <span style={{ color: C.green }}>›</span>
              <span>{bullet}</span>
            </div>
          ))}
        </div>

        {signal.flags?.length ? (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
            {signal.flags.slice(0, compact ? 3 : 6).map((flag) => (
              <span key={flag} style={{ borderRadius: 999, padding: '4px 7px', background: 'rgba(255,209,102,0.09)', border: '1px solid rgba(255,209,102,0.22)', color: C.amber, fontSize: 7, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{flag.replace(/[_-]+/g, ' ')}</span>
            ))}
          </div>
        ) : null}

        {!compact && hasWarnings && (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <LineupInjuryFlags flags={signal.lineupFlags} compact />
            <CorrelationWarnings warnings={signal.correlationWarnings} items={signal.correlationItems} compact />
          </div>
        )}

        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} style={{ marginTop: 11, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <WatchlistControls
            signal={signal}
            watched={watched}
            onToggleWatch={onToggleWatch ? (next) => { if (next) onToggleWatch(next) } : undefined}
            onOpenMarket={onOpenMarket ? (next) => { if (next) onOpenMarket(next) } : undefined}
            compact
          />
          <div style={{ color: C.faint, fontSize: 8, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{signal.ticker || signal.liquidityLabel || signal.liquidityGrade || decision.reason}</div>
        </div>
      </div>
    </div>
  )
}
