'use client'

import type { KeyboardEvent } from 'react'
import { classifySignalDecision } from '../../lib/signals/insight'
import type { SignalLineOption, SignalTerminalCardProps, SignalTerminalSignal, SignalTier } from './types'

const C = {
  green: '#7df6ff',
  amber: '#ffd166',
  red: '#ff4d6d',
  cyan: '#8df7ff',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.66)',
  faint: 'rgba(244,255,232,0.38)',
  border: 'rgba(255,255,255,0.10)',
  borderHot: 'rgba(125,246,255,0.38)',
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

function formatNumber(value: number | null | undefined, fallback = '—') {
  if (!isFiniteNumber(value)) return fallback
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)
}

function formatCents(value: number | null | undefined) {
  if (!isFiniteNumber(value) || value <= 0) return '—'
  return `${Math.round(value)}c`
}

function formatLineOption(option: SignalLineOption) {
  return option.label || (isFiniteNumber(option.line) ? `${formatNumber(option.line)}+` : 'Line')
}

function plainLineLabel(label: string) {
  return label.replace(/\s*points$/i, '').trim() || label
}

function stripJargon(text: string) {
  return text
    .replace(/\bask\b/gi, 'price')
    .replace(/\bfair(?: value)?\b/gi, 'true chance')
    .replace(/\bedge\b/gi, 'value')
    .replace(/\bladder entry\b/gi, 'safer plan')
    .replace(/\bQ4\b/g, 'the 4th quarter')
    .replace(/\bB2B\b/gi, 'back-to-back')
    .replace(/\b\d+c\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function tooMarketHeavy(text: string) {
  return /\b(ask|fair|edge|misprice|cushion|ladder|underpricing|underpriced|market|entry|price)\b/i.test(text)
}

function simpleRisk(text: string) {
  const clean = stripJargon(text)
  if (/price|ask|fair|edge|market|c\b/i.test(text)) return 'Skip it if the bet gets much worse before tipoff.'
  if (/blowout|leads? by|lopsided/i.test(text)) return 'A blowout could cut his late-game minutes.'
  if (/minutes?|cap|restriction/i.test(text)) return 'Minutes are the big thing to watch.'
  if (/questionable|scratch|inactive|out\b/i.test(text)) return 'Make sure he is active before the game starts.'
  return clean
}

function simpleContext(text: string) {
  return stripJargon(text)
    .replace(/^Lineup:\s*/i, '')
    .replace(/^Injury:\s*/i, '')
    .replace(/^Usage:\s*/i, '')
    .replace(/^X\/social:\s*/i, '')
}

function lineOptionKey(option: SignalLineOption, idx: number) {
  return option.id || `${option.label}-${option.ask}-${idx}`
}

function getLineOptions(signal: SignalTerminalSignal): SignalLineOption[] {
  const raw = signal.metadata?.lineOptions
  if (Array.isArray(raw) && raw.length) return raw as SignalLineOption[]
  return []
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
  watched: _watched = false,
  onOpen,
  onToggleWatch: _onToggleWatch,
  onOpenMarket: _onOpenMarket,
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
  const lineOptions = getLineOptions(signal)
  const recentGames = Array.isArray(signal.metadata?.recentGames)
    ? (signal.metadata?.recentGames as Array<{ value?: unknown; opponent?: unknown; date?: unknown }>).filter(game => isFiniteNumber(Number(game.value))).slice(0, 12)
    : []
  const recentValues = recentGames.map(game => Number(game.value))
  const recentAvg = recentValues.length ? recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length : null
  const recentMin = recentValues.length ? Math.min(...recentValues) : null
  const recentMax = recentValues.length ? Math.max(...recentValues) : null
  const todayIntel = signal.metadata?.todayIntel as {
    lineup?: { status?: string; confidence?: string; reason?: string }
    socialContext?: { status?: string; summary?: string; confidence?: string }
    injuryContext?: string[]
    usageContext?: string[]
    riskFactors?: string[]
    whatCouldKillIt?: string[]
    unavailable?: string
  } | undefined
  const intelRows = [
    todayIntel?.lineup?.status ? `Lineup: ${todayIntel.lineup.status}${todayIntel.lineup.reason ? ` — ${todayIntel.lineup.reason}` : ''}` : '',
    ...(Array.isArray(todayIntel?.injuryContext) ? todayIntel.injuryContext.slice(0, 1).map(item => `Injury: ${item}`) : []),
    ...(Array.isArray(todayIntel?.usageContext) ? todayIntel.usageContext.slice(0, 1).map(item => `Usage: ${item}`) : []),
    todayIntel?.socialContext?.summary ? `X/social: ${todayIntel.socialContext.summary}` : '',
  ].map(row => row.trim()).filter(Boolean).slice(0, 3)
  const killRows = [
    ...(Array.isArray(todayIntel?.whatCouldKillIt) ? todayIntel.whatCouldKillIt : []),
    ...(Array.isArray(todayIntel?.riskFactors) ? todayIntel.riskFactors : []),
  ].map(row => simpleRisk(row.trim())).filter(Boolean).slice(0, 2)
  const signalAny = signal as SignalTerminalSignal & { whyCare?: string[] }
  const aiBulletSource = Array.isArray(signalAny.whyCare) && signalAny.whyCare.length ? signalAny.whyCare : signal.reasons
  const plainAiBullets = signal.metadata?.todayIntel && Array.isArray(aiBulletSource)
    ? aiBulletSource.map(reason => stripJargon(String(reason || ''))).filter(reason => reason && !tooMarketHeavy(reason)).slice(0, 2)
    : []
  const primaryLine = lineOptions[0]?.label || signal.label || signal.metric || 'this line'
  const secondaryLine = lineOptions[1]?.label
  const recentLine = isFiniteNumber(signal.line) ? `${formatNumber(signal.line)}+` : plainLineLabel(primaryLine)
  const formBullet = signal.hits && signal.games
    ? `${titleFor(signal)} has cleared ${recentLine} in ${signal.hits} of his last ${signal.games}, averaging ${formatNumber(signal.avg ?? recentAvg)}.`
    : recentAvg != null
      ? `${titleFor(signal)} is averaging ${formatNumber(recentAvg)} over the last ${recentValues.length || 12} games.`
      : `${titleFor(signal)} has the cleanest recent form on this board.`
  const contextBullet = [
    ...(Array.isArray(todayIntel?.usageContext) ? todayIntel.usageContext : []),
    ...(Array.isArray(todayIntel?.injuryContext) ? todayIntel.injuryContext : []),
    todayIntel?.lineup?.reason || '',
  ].map(simpleContext).find(Boolean)
  const planBullet = secondaryLine
    ? `Simple read: ${plainLineLabel(primaryLine)} is the safer look; ${plainLineLabel(secondaryLine)} needs a stronger night.`
    : `Simple read: this is worth watching if his role looks normal before tipoff.`
  const whyCare = [formBullet, contextBullet, ...plainAiBullets, planBullet].filter(Boolean).slice(0, 3) as string[]

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
          ? `linear-gradient(135deg, ${hotColor}, rgba(255,255,255,0.13), rgba(125,246,255,0.15))`
          : `linear-gradient(135deg, ${tierColor(tier)}55, rgba(255,255,255,0.08), rgba(0,0,0,0.12))`,
        boxShadow: selected ? `0 0 34px ${hotColor}22, 0 18px 54px rgba(0,0,0,0.44)` : '0 16px 42px rgba(0,0,0,0.34)',
        cursor: onOpen ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, opacity: selected ? 0.18 : 0.10, background: 'radial-gradient(circle at 20% 0%, rgba(125,246,255,0.36), transparent 34%), radial-gradient(circle at 90% 12%, rgba(141,247,255,0.22), transparent 30%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', borderRadius: 19, padding: compact ? 12 : 14, background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: `1px solid ${selected ? C.borderHot : C.border}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: tierColor(tier), fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tier} signal</span>
            {signal.sport && <span style={{ color: C.faint, fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{signal.sport}</span>}
          </div>
          <div style={{ color: C.text, fontSize: compact ? 14 : 16, fontWeight: 950, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleFor(signal)}</div>
          <div style={{ color: C.muted, fontSize: compact ? 9 : 10, lineHeight: 1.35, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitleFor(signal) || 'No market label supplied'}</div>
        </div>

        {!compact && lineOptions.length > 1 && (
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: `repeat(${Math.min(lineOptions.length, 3)}, minmax(0, 1fr))`, gap: 6 }}>
            {lineOptions.slice(0, 3).map((option, idx) => (
              <a
                key={lineOptionKey(option, idx)}
                href={option.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={event => { if (!option.url) event.preventDefault(); event.stopPropagation() }}
                style={{ textDecoration: 'none', borderRadius: 11, padding: '8px 7px', background: idx === 0 ? 'rgba(125,246,255,0.105)' : 'rgba(255,255,255,0.045)', border: `1px solid ${idx === 0 ? 'rgba(125,246,255,0.26)' : C.border}` }}
              >
                <div style={{ color: idx === 0 ? C.green : C.text, fontSize: 10, fontWeight: 950, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatLineOption(option)}</div>
                <div style={{ color: C.muted, fontSize: 8, fontWeight: 900, marginTop: 3 }}>{idx === 0 ? 'Safer line' : idx === 1 ? 'Bigger night' : 'Longer shot'}</div>
                <div style={{ color: C.faint, fontSize: 7.5, fontWeight: 900, marginTop: 1 }}>{idx === 0 ? 'Best for casual users' : 'Only if you want more risk'}</div>
              </a>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
          {!compact && <div style={{ color: C.green, fontSize: 8, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Why this player</div>}
          {whyCare.slice(0, compact ? 2 : 3).map((bullet) => (
            <div key={bullet} style={{ color: C.muted, fontSize: 9, lineHeight: 1.4, display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: 4 }}>
              <span style={{ color: C.green }}>›</span>
              <span>{bullet}</span>
            </div>
          ))}
        </div>

        {!compact && recentValues.length > 0 && (
          <div style={{ marginTop: 10, borderRadius: 12, padding: 9, background: 'rgba(255,255,255,0.028)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 7 }}>
              <div style={{ color: C.text, fontSize: 9, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Last 12 full stats</div>
              <div style={{ color: C.faint, fontSize: 8, fontWeight: 900 }}>avg {formatNumber(recentAvg)} · range {formatNumber(recentMin)}-{formatNumber(recentMax)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 5 }}>
              {recentGames.map((game, idx) => {
                const value = Number(game.value)
                const hit = isFiniteNumber(signal.line) ? value >= signal.line : false
                return (
                  <div key={`${idx}-${value}-${String(game.opponent || '')}`} title={[game.date, game.opponent].filter(Boolean).join(' · ')} style={{ borderRadius: 8, padding: '5px 3px', textAlign: 'center', background: hit ? 'rgba(125,246,255,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${hit ? 'rgba(125,246,255,0.20)' : 'rgba(255,255,255,0.06)'}` }}>
                    <div style={{ color: hit ? C.green : C.text, fontSize: 10, fontWeight: 950 }}>{formatNumber(value)}</div>
                    <div style={{ color: C.faint, fontSize: 6, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(game.opponent || `G${idx + 1}`).replace(/^vs\s+|^@\s+/i, '')}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!compact && intelRows.length > 0 && (
          <div style={{ marginTop: 10, borderRadius: 12, padding: 9, background: 'rgba(125,246,255,0.045)', border: `1px solid ${C.border}` }}>
            <div style={{ color: C.text, fontSize: 9, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>Intel check</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {intelRows.map(row => <div key={row} style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.38 }}>• {simpleContext(row)}</div>)}
            </div>
          </div>
        )}

        {!compact && killRows.length > 0 && (
          <div style={{ marginTop: 8, borderRadius: 12, padding: 9, background: 'rgba(255,209,102,0.045)', border: '1px solid rgba(255,209,102,0.16)' }}>
            <div style={{ color: C.amber, fontSize: 9, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>What could kill it</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {killRows.map(row => <div key={row} style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.38 }}>• {row}</div>)}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
