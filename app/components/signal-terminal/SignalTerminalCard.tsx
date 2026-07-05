'use client'

import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { signalCardTapContract } from '../../lib/signals/card-collapse'
import { selectWhyThisPlayerBullets } from '../../lib/signals/why-player'
import { classifySignalDecision } from '../../lib/signals/insight'
import { CARD_EXPORT_ROOT_SELECTOR, cardExportStatusLabel, shareOrDownloadCardImage, type CardExportStatus } from '../../lib/card-image-export'
import type { SignalDetailTab, SignalLineOption, SignalTerminalCardProps, SignalTerminalSignal, SignalTier } from './types'

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
    .replace(/\bfair(?: value)?\b/gi, 'expected chance')
    .replace(/\bedge\b/gi, 'matchup gap')
    .replace(/\bladder entry\b/gi, 'safer line')
    .replace(/\bmisprice\b/gi, 'line looks off')
    .replace(/\bcushion\b/gi, 'room before it gets too expensive')
    .replace(/\bmarket\b/gi, 'line')
    .replace(/\bmodel\b/gi, 'read')
    .replace(/\bprojection\b/gi, 'expected stat line')
    .replace(/\bscan(?:ning)?\b/gi, 'check')
    .replace(/\bresistance\b/gi, 'toughness')
    .replace(/\bQ4\b/g, 'the 4th quarter')
    .replace(/\bB2B\b/gi, 'back-to-back')
    .replace(/\b\d+c\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function rowFingerprint(text: string) {
  return stripJargon(text)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanUniqueRows(rows: Array<string | null | undefined>, limit: number) {
  const seen = new Set<string>()
  const clean: string[] = []
  for (const row of rows) {
    const text = stripJargon(String(row || '')).trim()
    const key = rowFingerprint(text)
    if (!text || !key || seen.has(key)) continue
    seen.add(key)
    clean.push(text)
    if (clean.length >= limit) break
  }
  return clean
}

function tooMarketHeavy(text: string) {
  return /\b(ask|fair|edge|misprice|cushion|ladder|underpricing|underpriced|market|entry|price)\b/i.test(text)
}

function simpleRisk(text: string) {
  const clean = stripJargon(text)
  if (/price|ask|fair|edge|market|c\b/i.test(text)) return 'Do not chase it if the line gets worse before game time.'
  if (/blowout|leads? by|lopsided/i.test(text)) return 'A blowout could cut his late-game minutes.'
  if (/minutes?|cap|restriction/i.test(text)) return 'Minutes are the big thing to watch.'
  if (/questionable|scratch|inactive|out\b/i.test(text)) return 'Make sure he is active before the game starts.'
  return clean
}

function simpleContext(text: string) {
  const cleaned = stripJargon(text)
    .replace(/^Lineup:\s*/i, '')
    .replace(/^Injury:\s*/i, '')
    .replace(/^Usage:\s*/i, '')
    .replace(/^X\/social:\s*/i, '')
    .replace(/\bprojected starter\b/gi, 'Expected starter')
    .replace(/\bconfirmed starter\b/gi, 'Starting')
    .replace(/\busage\b/gi, 'touches')
    .replace(/\bdefensive attention\b/gi, 'extra pressure')
    .replace(/\bback-to-back fatigue\b/gi, 'tired legs')
    .replace(/\bB2B\b/gi, 'tired legs')
    .replace(/\brim protection\b/gi, 'defense near the basket')
    .replace(/\bload manages?\b/gi, 'has his minutes limited')
    .replace(/\bsecondary creator\b/gi, 'second scoring option')

  if (/expected starter|starting|starts?/i.test(cleaned)) return 'He should be in his normal starting role.'
  if (/missing|\bout\b|injur/i.test(cleaned)) return 'Injuries in this game should keep his role important.'
  if (/pace|transition|matchup/i.test(cleaned)) return 'The matchup should give him enough chances.'
  if (/tired legs|rest|fatigue/i.test(cleaned)) return 'Minutes are the main thing to watch because tired legs can change rotations.'
  return cleaned
}

function lineOptionKey(option: SignalLineOption, idx: number) {
  return option.id || `${option.label}-${option.ask}-${idx}`
}

function lineThreshold(option: SignalLineOption) {
  if (isFiniteNumber(option.line)) return option.line
  const match = String(option.label || '').match(/(-?\d+(?:\.\d+)?)\s*\+?/)
  return match ? Number(match[1]) : null
}

function lineUnitSuffix(options: SignalLineOption[]) {
  const suffixes = options
    .map(option => String(option.label || '').replace(/^\s*-?\d+(?:\.\d+)?\s*\+?\s*/i, '').trim())
    .filter(Boolean)
  if (!suffixes.length) return ''
  const first = suffixes[0].toLowerCase()
  return suffixes.every(suffix => suffix.toLowerCase() === first) ? suffixes[0] : ''
}

function compactLineOptionLabel(option: SignalLineOption, unit: string) {
  const label = formatLineOption(option)
  return unit ? label.replace(new RegExp(`\\s*${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').trim() || label : label
}

function lineOptionRecord(option: SignalLineOption, recentValues: number[]) {
  const threshold = lineThreshold(option)
  const games = isFiniteNumber(option.games) ? option.games : recentValues.length || null
  const hits = isFiniteNumber(option.hits)
    ? option.hits
    : threshold != null && recentValues.length
      ? recentValues.filter(value => value >= threshold).length
      : null
  const pct = isFiniteNumber(hits) && isFiniteNumber(games) && games > 0 ? (hits / games) * 100 : null
  return { threshold, hits, games, pct }
}

function pctColor(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return C.faint
  if (value >= 75) return C.green
  if (value >= 50) return C.text
  if (value >= 25) return C.muted
  return C.faint
}

function bestFitMatches(option: SignalLineOption, bestFit?: string | null) {
  if (!bestFit) return false
  const haystack = `${option.label || ''} ${option.line ?? ''}`.toLowerCase()
  return haystack.includes(String(bestFit).toLowerCase()) || String(bestFit).toLowerCase().includes(String(option.label || '').toLowerCase())
}

function PropLadder({
  options,
  recentValues,
  bestFit,
  compact = false,
  selectedThreshold,
  onSelectThreshold,
}: {
  options: SignalLineOption[]
  recentValues: number[]
  bestFit?: string | null
  compact?: boolean
  selectedThreshold?: number | null
  onSelectThreshold?: (threshold: number | null) => void
}) {
  if (options.length <= 1) return null
  const unit = lineUnitSuffix(options)
  const visibleOptions = compact ? options.slice(0, 4) : options
  const hiddenCount = Math.max(0, options.length - visibleOptions.length)
  const hasRecent = recentValues.length > 0 || options.some(option => isFiniteNumber(option.hits) && isFiniteNumber(option.games))
  const hasPrice = options.some(option => isFiniteNumber(option.ask) && option.ask > 0)
  const columns = hasRecent && hasPrice
    ? '48px minmax(58px,1fr) 42px 58px'
    : hasRecent
      ? '48px minmax(58px,1fr) 42px'
      : hasPrice
        ? '48px minmax(0,1fr) 58px'
        : '48px minmax(0,1fr)'

  return (
    <div style={{ borderRadius: compact ? 13 : 15, padding: compact ? '8px 9px' : 10, background: compact ? 'rgba(125,246,255,0.055)' : 'rgba(2,5,1,0.42)', border: '1px solid rgba(125,246,255,0.16)', fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ color: C.green, fontSize: compact ? 8 : 8.5, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{unit ? `${unit} ladder` : 'Line ladder'}</div>
        <div style={{ color: C.faint, fontSize: 7.5, fontWeight: 900 }}>{options.length} lines</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: columns, columnGap: 8, alignItems: 'center', color: C.faint, fontSize: 7.2, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.055)' }}>
        <span>Line</span>
        {hasRecent ? <span>L{recentValues.length || '—'}</span> : <span>Read</span>}
        {hasRecent && <span style={{ textAlign: 'right' }}>Hit%</span>}
        {hasPrice && <span style={{ textAlign: 'right' }}>Live</span>}
      </div>
      <div style={{ display: 'grid' }}>
        {visibleOptions.map((option, idx) => {
          const record = lineOptionRecord(option, recentValues)
          const price = formatCents(toCents(option.ask))
          const isBest = bestFitMatches(option, bestFit) || (idx === 0 && !bestFit)
          const selected = selectedThreshold != null && record.threshold === selectedThreshold
          const rowColor = pctColor(record.pct)
          const row = (
            <div
              onClick={(event) => { event.stopPropagation(); onSelectThreshold?.(record.threshold) }}
              style={{
                display: 'grid',
                gridTemplateColumns: columns,
                columnGap: 8,
                alignItems: 'center',
                minHeight: compact ? 25 : 29,
                padding: compact ? '4px 0' : '5px 0',
                borderBottom: idx === visibleOptions.length - 1 && hiddenCount === 0 ? '0' : '1px solid rgba(255,255,255,0.045)',
                borderLeft: isBest || selected ? `2px solid ${isBest ? C.green : C.amber}` : '2px solid transparent',
                paddingLeft: isBest || selected ? 6 : 4,
                background: isBest ? 'rgba(125,246,255,0.055)' : selected ? 'rgba(255,209,102,0.055)' : 'transparent',
                cursor: onSelectThreshold ? 'pointer' : option.url ? 'pointer' : 'default',
              }}
            >
              <span title={option.label} style={{ color: isBest ? C.green : C.text, fontSize: compact ? 10.5 : 11.5, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {compactLineOptionLabel(option, unit)}
              </span>
              {hasRecent ? (
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: C.text, fontSize: compact ? 9.5 : 10.5, fontWeight: 900 }}>{isFiniteNumber(record.hits) && isFiniteNumber(record.games) ? `${formatNumber(record.hits)}/${formatNumber(record.games)}` : '—'}</span>
                  {!compact && isFiniteNumber(record.pct) && (
                    <span style={{ display: 'block', marginTop: 2, height: 3, width: '100%', borderRadius: 999, background: 'rgba(255,255,255,0.055)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.max(4, Math.min(100, record.pct))}%`, borderRadius: 999, background: rowColor }} />
                    </span>
                  )}
                </span>
              ) : (
                <span style={{ color: C.muted, fontSize: 9, fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isBest ? 'Best fit' : 'Available'}</span>
              )}
              {hasRecent && <span style={{ color: rowColor, fontSize: compact ? 9.5 : 10.5, fontWeight: 950, textAlign: 'right' }}>{formatNumber(record.pct, '—')}{isFiniteNumber(record.pct) ? '%' : ''}</span>}
              {hasPrice && (
                <span style={{ display: 'inline-flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, color: C.text, fontSize: compact ? 9 : 10, fontWeight: 900 }}>
                  <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: isFiniteNumber(option.ask) ? C.green : 'transparent', border: `1px solid ${isFiniteNumber(option.ask) ? C.green : C.faint}`, boxShadow: isFiniteNumber(option.ask) ? '0 0 7px rgba(125,246,255,0.62)' : 'none' }} />
                  {price}
                </span>
              )}
            </div>
          )
          return option.url ? (
            <a key={lineOptionKey(option, idx)} href={option.url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} style={{ textDecoration: 'none' }}>
              {row}
            </a>
          ) : <div key={lineOptionKey(option, idx)}>{row}</div>
        })}
        {hiddenCount > 0 && <div style={{ color: C.faint, fontSize: 8.5, fontWeight: 900, paddingTop: 5, textAlign: 'center' }}>+{hiddenCount} more lines</div>}
      </div>
    </div>
  )
}

function PrimaryPropChip({ option, signal, compact = false }: { option?: SignalLineOption; signal: SignalTerminalSignal; compact?: boolean }) {
  const label = option?.label || signal.label || signal.marketTitle || signal.metric || 'Prop line'
  const line = isFiniteNumber(option?.line) ? `${formatNumber(option?.line)}+` : isFiniteNumber(signal.line) ? `${formatNumber(signal.line)}+` : null
  const metric = signal.metric || compactLineOptionLabel(option || { label }, '')
  const hits = isFiniteNumber(option?.hits) && isFiniteNumber(option?.games)
    ? `${formatNumber(option?.hits)}/${formatNumber(option?.games)}`
    : isFiniteNumber(signal.hits) && isFiniteNumber(signal.games)
      ? `${formatNumber(signal.hits)}/${formatNumber(signal.games)}`
      : null
  const ask = toCents(option?.ask ?? signal.ask)
  const content = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: compact ? 13 : 15, padding: compact ? '8px 10px' : '9px 10px', background: 'rgba(125,246,255,0.075)', border: '1px solid rgba(125,246,255,0.22)', boxShadow: '0 0 18px rgba(125,246,255,0.08)' }}>
      <div style={{ minWidth: 0, textAlign: 'left' }}>
        <div style={{ color: C.green, fontSize: compact ? 8 : 8.5, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Prop</div>
        <div style={{ color: C.text, fontSize: compact ? 11 : 12, fontWeight: 950, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line ? `${line} ${metric || label}` : label}</div>
      </div>
      <div style={{ flexShrink: 0, display: 'grid', gap: 2, textAlign: 'right' }}>
        {hits && <span style={{ color: C.text, fontSize: compact ? 9 : 10, fontWeight: 950 }}>{hits}</span>}
        {isFiniteNumber(ask) && <span style={{ color: C.cyan, fontSize: compact ? 8 : 9, fontWeight: 950 }}>Live {formatCents(ask)}</span>}
      </div>
    </div>
  )
  return option?.url ? <a href={option.url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} style={{ textDecoration: 'none' }}>{content}</a> : content
}

function OpponentFitPanel({ title, bullets, compact = false, tone = 'fit' }: { title: string; bullets: string[]; compact?: boolean; tone?: 'fit' | 'warn' | 'risk' }) {
  const cleanBullets = cleanUniqueRows(bullets, compact ? 2 : 4)
  if (!cleanBullets.length) return null
  const color = tone === 'risk' ? C.red : tone === 'warn' ? C.amber : C.green
  if (compact) {
    return (
      <div style={{ marginTop: 9, borderRadius: 12, padding: '7px 9px', background: `${color}10`, border: `1px solid ${color}33`, color: C.text, fontSize: 9, lineHeight: 1.32, fontWeight: 850, textAlign: 'left', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        <span style={{ color, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</span> · {cleanBullets.join(' · ')}
      </div>
    )
  }
  return (
    <div style={{ marginTop: 10, borderRadius: 15, padding: 10, background: `${color}0f`, border: `1px solid ${color}2f`, boxShadow: `0 0 24px ${color}12` }}>
      <div style={{ color, fontSize: 8.5, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 7 }}>{title}</div>
      <div style={{ display: 'grid', gap: 5 }}>
        {cleanBullets.map(row => (
          <div key={row} style={{ color: C.text, fontSize: 9.5, lineHeight: 1.35, fontWeight: 850, display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: 4 }}>
            <span style={{ color }}>›</span>
            <span>{row}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function getLineOptions(signal: SignalTerminalSignal): SignalLineOption[] {
  const raw = signal.metadata?.lineOptions
  if (Array.isArray(raw) && raw.length) return raw as SignalLineOption[]
  if (signal.label || signal.metric || isFiniteNumber(signal.line)) {
    return [{
      id: signal.id,
      label: signal.label || signal.metric || 'Prop line',
      line: isFiniteNumber(signal.line) ? signal.line : undefined,
      ask: signal.ask ?? undefined,
      fairPrice: signal.fairPrice ?? undefined,
      edge: signal.edge ?? undefined,
      maxBuy: signal.maxBuy ?? undefined,
      hits: signal.hits ?? undefined,
      games: signal.games ?? undefined,
      avg: signal.avg ?? undefined,
      url: signal.url ?? undefined,
      ticker: signal.ticker ?? undefined,
    }]
  }
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


function shareTextForSignal(signal: SignalTerminalSignal) {
  const line = signal.label || signal.metric || 'Signal'
  const matchup = signal.matchup ? ` · ${signal.matchup}` : ''
  const gameTime = signal.gameTime ? ` · ${signal.gameTime}` : ''
  const hitRate = signal.hits && signal.games ? `
Hit: ${signal.hits}/${signal.games}` : ''
  return `${titleFor(signal)} — ${line}${matchup}${gameTime}${hitRate}
Athlete Intelligence: ${window.location.origin}`
}

function findCardExportRoot(event: MouseEvent<HTMLButtonElement>) {
  return event.currentTarget.closest(CARD_EXPORT_ROOT_SELECTOR) as HTMLElement | null
}

function ShareGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2.75v9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.55 6.2 10 2.75l3.45 3.45" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.2 8.35H4.15A1.65 1.65 0 0 0 2.5 10v5.35A1.65 1.65 0 0 0 4.15 17h11.7a1.65 1.65 0 0 0 1.65-1.65V10a1.65 1.65 0 0 0-1.65-1.65H14.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function SignalTerminalCard({
  signal,
  selected = false,
  compact = false,
  detailTab,
  watched: _watched = false,
  onOpen,
  onToggleWatch: _onToggleWatch,
  onOpenMarket: _onOpenMarket,
}: SignalTerminalCardProps) {
  const showFor = (tabs: SignalDetailTab[]) => !detailTab || tabs.includes(detailTab)
  const tier = signal.tier ?? 'WATCH'
  const decision = classifySignalDecision({
    sport: signal.sport,
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
  const judgmentContext = signal.metadata?.judgmentContext as {
    lastGame?: { value?: number; points?: number; minutes?: number; fgMade?: number; fgAttempted?: number; fgPct?: number; threeMade?: number; threeAttempted?: number; threePct?: number; ftMade?: number; ftAttempted?: number; opponent?: string }
    trend?: { last5Avg?: number; last12Avg?: number; median?: number; last5HitRate?: number; last5Games?: number; range?: { min?: number; max?: number } }
    overallRatings?: { player?: { score?: number; label?: string; detail?: string }; team?: { score?: number; label?: string; detail?: string }; matchup?: { score?: number; label?: string; detail?: string } }
    lineCheck?: { line?: number; median?: number; hitRateLabel?: string; verdict?: string; range?: { min?: number; max?: number } }
    roleCheck?: { status?: string; label?: string; details?: string[] }
    consistency?: { grade?: string; label?: string }
    gameEnvironment?: string[]
    sportSpecificNotes?: string[]
    decisionSections?: Array<{ title?: string; rows?: string[] }>
    mlbConviction?: { verdict?: string; read?: string; whyLive?: string[]; path?: string; killSwitch?: string[]; numberDiscipline?: string; opponentProof?: string[]; matchupRating?: { ratingTitle?: string; playerLabel?: string; opponentLabel?: string; playerRating?: number; opponentRating?: number; matchupGap?: number; bestFit?: string; propFit?: Record<string, number | undefined>; subRatings?: Array<{ label?: string; score?: number; detail?: string }>; read?: string; rows?: string[]; opponentProof?: string[] }; misreadSignal?: { label?: string; severity?: string; summary?: string; reason?: string; matchupGap?: number; playerRating?: number; opponentRating?: number; ratingTitle?: string; bestFit?: string; subRatings?: Array<{ label?: string; score?: number; detail?: string }>; opponentProof?: string[] } }
    volume?: { shotAttemptsLast5Avg?: number; threesAttemptedLast5Avg?: number; freeThrowsAttemptedLast5Avg?: number }
    minutes?: { lastGame?: number; last5Avg?: number; stable?: boolean }
    matchupNotes?: string[]
    injuryNotes?: string[]
    riskNotes?: string[]
    playableNumber?: string
    summaryBullets?: string[]
    whyPlayerBullets?: string[]
    recentRows?: string[]
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
  const playerSpecificWhy = Array.isArray(judgmentContext?.whyPlayerBullets)
    ? judgmentContext.whyPlayerBullets.map(reason => stripJargon(String(reason || ''))).filter(Boolean)
    : []
  const apiWhyCare = Array.isArray(signalAny.whyCare)
    ? signalAny.whyCare.map(reason => stripJargon(String(reason || ''))).filter(reason => reason && !tooMarketHeavy(reason))
    : []
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
    ? `Simple read: ${plainLineLabel(primaryLine)} is the main look; ${plainLineLabel(secondaryLine)} needs a bigger night.`
    : `Simple read: this works if his role looks normal before tipoff.`
  const formCheckRows = [
    ...(Array.isArray(judgmentContext?.summaryBullets) ? judgmentContext.summaryBullets : []),
    formBullet,
  ].map(row => stripJargon(String(row || ''))).filter(Boolean).slice(0, 2)
  const whyCare = selectWhyThisPlayerBullets({
    playerSpecific: playerSpecificWhy,
    apiWhyCare,
    fallback: [contextBullet, planBullet, ...plainAiBullets],
  })
  const overallRatings = judgmentContext?.overallRatings
  const overallRows = overallRatings ? [
    { title: 'Player', rating: overallRatings.player },
    { title: 'Team', rating: overallRatings.team },
    { title: 'Matchup', rating: overallRatings.matchup },
  ].filter(row => isFiniteNumber(row.rating?.score)) as Array<{ title: string; rating: { score: number; label?: string; detail?: string } }> : []
  const judgmentFacts = judgmentContext ? [
    judgmentContext.lastGame?.fgAttempted ? { label: 'Last game', value: `${formatNumber(judgmentContext.lastGame.points ?? judgmentContext.lastGame.value)} pts`, sub: `${formatNumber(judgmentContext.lastGame.fgMade)}/${formatNumber(judgmentContext.lastGame.fgAttempted)} FG${judgmentContext.lastGame.threeAttempted ? ` · ${formatNumber(judgmentContext.lastGame.threeMade)}/${formatNumber(judgmentContext.lastGame.threeAttempted)} 3PT` : ''}` } : null,
    judgmentContext.volume?.shotAttemptsLast5Avg ? { label: 'Volume', value: `${formatNumber(judgmentContext.volume.shotAttemptsLast5Avg)} FGA`, sub: `${formatNumber(judgmentContext.volume.threesAttemptedLast5Avg)} 3PA · ${formatNumber(judgmentContext.volume.freeThrowsAttemptedLast5Avg)} FTA last 5` } : null,
    judgmentContext.minutes?.last5Avg ? { label: 'Minutes', value: `${formatNumber(judgmentContext.minutes.lastGame)} / ${formatNumber(judgmentContext.minutes.last5Avg)}`, sub: judgmentContext.minutes.stable ? 'last game / last 5 · stable role' : 'last game / last 5 · verify role' } : null,
    judgmentContext.trend?.last5Avg ? { label: 'Trend', value: `${formatNumber(judgmentContext.trend.last5Avg)} avg`, sub: `${judgmentContext.trend.last5HitRate ?? '—'} of ${judgmentContext.trend.last5Games ?? '—'} over line last 5` } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; sub: string }> : []
  const decisionSections = Array.isArray(judgmentContext?.decisionSections)
    ? judgmentContext.decisionSections
      .map(section => ({ title: String(section.title || '').trim(), rows: (Array.isArray(section.rows) ? section.rows : []).map(row => stripJargon(String(row || ''))).filter(Boolean).slice(0, 3) }))
      .filter(section => section.title && section.rows.length)
      .slice(0, 5)
    : []
  const mlbConviction = signal.sport === 'mlb' && judgmentContext?.mlbConviction
    ? {
      verdict: String(judgmentContext.mlbConviction.verdict || 'Small lean'),
      read: stripJargon(String(judgmentContext.mlbConviction.read || '')).trim(),
      whyLive: cleanUniqueRows(Array.isArray(judgmentContext.mlbConviction.whyLive) ? judgmentContext.mlbConviction.whyLive : [], 3),
      path: stripJargon(String(judgmentContext.mlbConviction.path || '')).trim(),
      killSwitch: (Array.isArray(judgmentContext.mlbConviction.killSwitch) ? judgmentContext.mlbConviction.killSwitch : []).map(row => simpleRisk(String(row || ''))).filter(Boolean).slice(0, 2),
      numberDiscipline: stripJargon(String(judgmentContext.mlbConviction.numberDiscipline || '')).trim(),
      opponentProof: cleanUniqueRows(Array.isArray(judgmentContext.mlbConviction.opponentProof) ? judgmentContext.mlbConviction.opponentProof : [], 4),
      misreadSignal: judgmentContext.mlbConviction.misreadSignal ? {
        label: stripJargon(String(judgmentContext.mlbConviction.misreadSignal.label || '')).trim(),
        severity: String(judgmentContext.mlbConviction.misreadSignal.severity || '').trim(),
        summary: stripJargon(String(judgmentContext.mlbConviction.misreadSignal.summary || '')).trim(),
        reason: stripJargon(String(judgmentContext.mlbConviction.misreadSignal.reason || '')).trim(),
        matchupGap: judgmentContext.mlbConviction.misreadSignal.matchupGap,
        playerRating: judgmentContext.mlbConviction.misreadSignal.playerRating,
        opponentRating: judgmentContext.mlbConviction.misreadSignal.opponentRating,
        opponentProof: cleanUniqueRows(Array.isArray(judgmentContext.mlbConviction.misreadSignal.opponentProof) ? judgmentContext.mlbConviction.misreadSignal.opponentProof : [], 4),
      } : undefined,
      matchupRating: judgmentContext.mlbConviction.matchupRating ? {
        ...judgmentContext.mlbConviction.matchupRating,
        read: stripJargon(String(judgmentContext.mlbConviction.matchupRating.read || '')).trim(),
        rows: cleanUniqueRows(Array.isArray(judgmentContext.mlbConviction.matchupRating.rows) ? judgmentContext.mlbConviction.matchupRating.rows : [], 3),
        opponentProof: cleanUniqueRows(Array.isArray(judgmentContext.mlbConviction.matchupRating.opponentProof) ? judgmentContext.mlbConviction.matchupRating.opponentProof : [], 4),
      } : undefined,
    }
    : null
  const opponentFitBullets = mlbConviction
    ? cleanUniqueRows([
      ...(mlbConviction.misreadSignal?.opponentProof?.length ? mlbConviction.misreadSignal.opponentProof : []),
      ...(mlbConviction.opponentProof || []),
      ...(mlbConviction.matchupRating?.opponentProof || []),
      mlbConviction.misreadSignal?.reason || '',
    ], 4)
    : []
  const opponentFitTitle = mlbConviction?.misreadSignal
    ? `Opponent proof${signal.opponent ? ` vs ${signal.opponent}` : ''}`
    : `Why this fits${signal.opponent ? ` vs ${signal.opponent}` : ''}`
  const opponentGap = mlbConviction?.misreadSignal?.matchupGap ?? mlbConviction?.matchupRating?.matchupGap
  const opponentFitTone: 'fit' | 'warn' | 'risk' = !mlbConviction?.misreadSignal
    ? 'fit'
    : isFiniteNumber(opponentGap) && opponentGap < 0
      ? 'risk'
      : isFiniteNumber(opponentGap) && opponentGap < 8
        ? 'warn'
        : 'fit'
  const ladderBestFit = mlbConviction?.matchupRating?.bestFit || null
  const judgmentNotes = [
    ...(Array.isArray(judgmentContext?.matchupNotes) ? judgmentContext.matchupNotes : []),
    ...(Array.isArray(judgmentContext?.injuryNotes) ? judgmentContext.injuryNotes : []),
    judgmentContext?.playableNumber || '',
  ].map(row => stripJargon(String(row || ''))).filter(Boolean).slice(0, 3)
  const mlbReadContent = Boolean(mlbConviction && (mlbConviction.misreadSignal?.summary || mlbConviction.read || mlbConviction.misreadSignal?.reason))
  const mlbNumbersContent = Boolean(mlbConviction?.matchupRating)
  const mlbRiskContent = Boolean(mlbConviction && (mlbConviction.whyLive.length > 0 || mlbConviction.path || mlbConviction.killSwitch.length > 0 || mlbConviction.numberDiscipline))
  const hasReadContent = overallRows.length > 0 || lineOptions.length > 1 || formCheckRows.length > 0 || mlbReadContent || whyCare.length > 0
  const hasNumbersContent = overallRows.length > 0 || mlbNumbersContent
  const hasRiskContent = mlbRiskContent || decisionSections.length > 0 || killRows.length > 0
  const hasStatsContent = recentValues.length > 0
  const activeTabHasContent = !detailTab || (detailTab === 'read' ? hasReadContent : detailTab === 'numbers' ? hasNumbersContent : detailTab === 'risk' ? hasRiskContent : hasStatsContent)
  const showMlbBlock = Boolean(mlbConviction && (!detailTab || (detailTab === 'read' && mlbReadContent) || (detailTab === 'numbers' && mlbNumbersContent) || (detailTab === 'risk' && mlbRiskContent)))
  const tabEmptyText = detailTab === 'numbers'
    ? 'No extra numbers panel for this signal yet. Use READ for the main takeaway.'
    : detailTab === 'risk'
      ? 'No special risk flags surfaced for this signal. Still respect lineup news and line movement.'
      : detailTab === 'stats'
        ? 'No last-12 game log attached to this signal yet.'
        : 'No expanded read is attached to this signal yet.'
  const tapHint = selected ? signalCardTapContract.expandedCta : signalCardTapContract.collapsedCta
  const [shareState, setShareState] = useState<CardExportStatus>('idle')
  const [selectedThreshold, setSelectedThreshold] = useState<number | null>(null)

  async function handleShareCard(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (shareState === 'working') return
    const element = findCardExportRoot(event)
    if (!element) {
      setShareState('error')
      window.setTimeout(() => setShareState('idle'), 1800)
      return
    }
    setShareState('working')
    try {
      await shareOrDownloadCardImage({
        element,
        title: `${titleFor(signal)} · Athlete Intelligence`,
      })
      setShareState('done')
      window.setTimeout(() => setShareState('idle'), 1400)
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        setShareState('idle')
        return
      }
      console.error('Signal card JPEG export failed', error)
      setShareState('error')
      window.setTimeout(() => setShareState('idle'), 1800)
    }
  }

  return (
    <div
      data-card-export-root="true"
      role={onOpen ? 'button' : 'article'}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(signal)}
      onKeyDown={(event) => onCardKeyDown(event, signal, onOpen)}
      style={{
        position: 'relative',
        borderRadius: compact ? 18 : 20,
        padding: compact ? 2 : 1,
        background: selected
          ? `linear-gradient(135deg, ${hotColor}, rgba(255,255,255,0.13), rgba(125,246,255,0.15))`
          : compact
            ? 'linear-gradient(135deg, rgba(125,246,255,0.70), rgba(255,255,255,0.12), rgba(125,246,255,0.26))'
            : `linear-gradient(135deg, ${tierColor(tier)}55, rgba(255,255,255,0.08), rgba(0,0,0,0.12))`,
        boxShadow: selected
          ? `0 0 34px ${hotColor}22, 0 18px 54px rgba(0,0,0,0.44)`
          : compact
            ? '0 0 0 1px rgba(125,246,255,0.12), 0 0 26px rgba(125,246,255,0.18), 0 16px 42px rgba(0,0,0,0.38)'
            : '0 16px 42px rgba(0,0,0,0.34)',
        cursor: onOpen ? 'pointer' : 'default',
        overflow: 'visible',
      }}
    >
      {compact && onOpen && (
        <style>{`
          @keyframes ${signalCardTapContract.glowAnimationName} {
            0% { background-position: 0 0, 0% 50%; }
            100% { background-position: 0 0, 200% 50%; }
          }
          @keyframes signalOpenCtaSheen {
            0% { transform: translateX(-135%) skewX(-18deg); }
            100% { transform: translateX(135%) skewX(-18deg); }
          }
          [data-signal-open-cta="true"] {
            border: 1px solid transparent !important;
            background:
              linear-gradient(135deg, rgba(5,14,22,0.96), rgba(5,24,38,0.90)) padding-box,
              linear-gradient(110deg, rgba(36,160,255,0.65), rgba(154,245,255,0.98), rgba(67,211,255,0.72), rgba(18,105,255,0.74), rgba(154,245,255,0.98)) border-box !important;
            background-size: 100% 100%, 220% 220% !important;
            animation: ${signalCardTapContract.glowAnimationName} 6.8s linear infinite;
            box-shadow: 0 0 0 1px rgba(125,246,255,0.24), 0 0 24px rgba(72,205,255,0.30), 0 12px 28px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.18) !important;
          }
          [data-signal-open-cta="true"]::before {
            content: '';
            position: absolute;
            inset: 1px;
            border-radius: inherit;
            background: linear-gradient(105deg, transparent 18%, rgba(185,250,255,0.26) 45%, transparent 70%);
            pointer-events: none;
            animation: signalOpenCtaSheen 4.8s ease-in-out infinite;
          }
          [data-signal-open-cta="true"] > span {
            position: relative;
            z-index: 1;
          }
          @media (prefers-reduced-motion: reduce) {
            [data-signal-open-cta="true"],
            [data-signal-open-cta="true"]::before {
              animation: none !important;
            }
          }
        `}</style>
      )}
      <div style={{ position: 'absolute', inset: 0, opacity: selected ? 0.18 : 0.10, background: 'radial-gradient(circle at 20% 0%, rgba(125,246,255,0.36), transparent 34%), radial-gradient(circle at 90% 12%, rgba(141,247,255,0.22), transparent 30%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', borderRadius: compact ? 16 : 19, padding: compact ? '10px 11px 11px' : 14, background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: `1px solid ${selected ? C.borderHot : compact ? 'rgba(125,246,255,0.24)' : C.border}` }}>
        {!compact && (
          <button
            type="button"
            aria-label={`Share ${titleFor(signal)} signal`}
            title={cardExportStatusLabel(shareState)}
            onClick={handleShareCard}
            disabled={shareState === 'working'}
            data-card-export-hide="true"
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 4, width: 31, height: 31, borderRadius: 11, border: '1px solid rgba(125,246,255,0.38)', background: 'rgba(2,5,1,0.74)', color: shareState === 'error' ? C.red : C.green, boxShadow: '0 0 18px rgba(125,246,255,0.14)', cursor: shareState === 'working' ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
          >
            {shareState === 'working' ? <span style={{ fontSize: 13, fontWeight: 950 }}>…</span> : shareState === 'done' ? <span style={{ fontSize: 14, fontWeight: 950 }}>✓</span> : <ShareGlyph />}
          </button>
        )}
        <div style={{ minWidth: 0, textAlign: compact ? 'center' : 'left' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start' }}>
            <span style={{ color: tierColor(tier), fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tier} signal</span>
            {signal.sport && <span style={{ color: C.faint, fontSize: 8, fontWeight: 900, textTransform: 'uppercase' }}>{signal.sport}</span>}
          </div>
          <div style={{ color: C.text, fontSize: compact ? 14 : 16, fontWeight: 950, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleFor(signal)}</div>
          <div style={{ color: C.muted, fontSize: compact ? 9 : 10, lineHeight: 1.35, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitleFor(signal) || 'No market label supplied'}</div>
        </div>

        {!compact && showFor(['read', 'numbers']) && overallRows.length > 0 && (
          <div style={{ marginTop: 11, borderRadius: 15, padding: 10, background: 'linear-gradient(135deg, rgba(125,246,255,0.16), rgba(255,209,102,0.045))', border: '1px solid rgba(125,246,255,0.30)', boxShadow: '0 0 24px rgba(125,246,255,0.10)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ color: C.green, fontSize: 8.5, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Overall read</div>
              <div style={{ color: C.faint, fontSize: 8, fontWeight: 900 }}>player · team · matchup</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
              {overallRows.map(row => (
                <div key={row.title} style={{ borderRadius: 12, padding: '8px 6px', background: 'rgba(2,5,1,0.58)', border: '1px solid rgba(125,246,255,0.16)', textAlign: 'center', minWidth: 0 }}>
                  <div style={{ color: C.faint, fontSize: 6.8, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{row.title}</div>
                  <div style={{ color: row.rating.score >= 78 ? C.green : row.rating.score >= 68 ? C.amber : C.red, fontSize: 22, fontWeight: 950, lineHeight: 1, marginTop: 2 }}>{formatNumber(row.rating.score)}</div>
                  <div style={{ color: C.muted, fontSize: 7.2, fontWeight: 900, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.rating.label || 'Rated'}</div>
                </div>
              ))}
            </div>
            {overallRatings?.matchup?.detail && <div style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.35, marginTop: 7, fontWeight: 850 }}>{overallRatings.matchup.detail}</div>}
          </div>
        )}

        {!compact && showFor(['read', 'numbers']) && lineOptions.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {lineOptions.length > 1 ? (
              <PropLadder
                options={lineOptions}
                recentValues={recentValues}
                bestFit={ladderBestFit}
                selectedThreshold={selectedThreshold}
                onSelectThreshold={setSelectedThreshold}
              />
            ) : (
              <PrimaryPropChip option={lineOptions[0]} signal={signal} />
            )}
          </div>
        )}

        {!compact && showFor(['read']) && opponentFitBullets.length > 0 && (
          <OpponentFitPanel title={opponentFitTitle} bullets={opponentFitBullets} tone={opponentFitTone} />
        )}

        {formCheckRows.length > 0 && !compact && showFor(['read']) && (
          <div style={{ marginTop: 11, borderRadius: 14, padding: 10, background: 'linear-gradient(135deg, rgba(125,246,255,0.14), rgba(125,246,255,0.045))', border: '1px solid rgba(125,246,255,0.30)', boxShadow: '0 0 24px rgba(125,246,255,0.10)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 7 }}>
              <div style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Form check · last game + trend</div>
              <div style={{ color: C.text, fontSize: 8, fontWeight: 950, borderRadius: 999, padding: '3px 6px', background: 'rgba(125,246,255,0.12)', border: '1px solid rgba(125,246,255,0.22)' }}>NEW</div>
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              {formCheckRows.map(row => (
                <div key={row} style={{ color: C.text, fontSize: 10, lineHeight: 1.35, fontWeight: 850, display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: 4 }}>
                  <span style={{ color: C.green }}>✓</span>
                  <span>{row}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mlbConviction && showMlbBlock && !compact && showFor(['read', 'numbers', 'risk']) && (
          <div style={{ marginTop: 11, borderRadius: 16, padding: 11, background: 'rgba(255,209,102,0.055)', border: '1px solid rgba(255,209,102,0.20)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 9 }}>
              <div style={{ color: C.amber, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>MLB read</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ color: C.text, fontSize: 9, fontWeight: 900, borderRadius: 999, padding: '4px 8px', background: 'rgba(255,209,102,0.10)', border: '1px solid rgba(255,209,102,0.22)' }}>{mlbConviction.verdict}</span>
                {mlbConviction.misreadSignal?.label && <span style={{ color: C.green, fontSize: 9, fontWeight: 900, borderRadius: 999, padding: '4px 8px', background: 'rgba(125,246,255,0.10)', border: '1px solid rgba(125,246,255,0.20)' }}>{mlbConviction.misreadSignal.label}</span>}
              </div>
            </div>

            {showFor(['read']) && (mlbConviction.misreadSignal?.summary || mlbConviction.read || mlbConviction.misreadSignal?.reason) && (
              <div style={{ color: C.text, fontSize: 11, lineHeight: 1.42, fontWeight: 850, marginBottom: 9, display: 'grid', gap: 5 }}>
                {mlbConviction.misreadSignal?.summary && (
                  <span>{mlbConviction.misreadSignal.summary}{isFiniteNumber(mlbConviction.misreadSignal?.matchupGap) ? ` · Matchup gap ${mlbConviction.misreadSignal.matchupGap > 0 ? '+' : ''}${formatNumber(mlbConviction.misreadSignal.matchupGap)}` : ''}</span>
                )}
                {mlbConviction.read && mlbConviction.read !== mlbConviction.misreadSignal?.summary && <span>{mlbConviction.read}</span>}
                {mlbConviction.misreadSignal?.reason && <span style={{ color: C.muted, fontSize: 9.5, lineHeight: 1.35 }}>{mlbConviction.misreadSignal.reason}</span>}
                {(mlbConviction.misreadSignal?.opponentProof?.length || mlbConviction.opponentProof?.length) ? (
                  <div style={{ marginTop: 3, display: 'grid', gap: 4 }}>
                    <span style={{ color: C.green, fontSize: 8.5, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Why it fits this opponent</span>
                    {(mlbConviction.misreadSignal?.opponentProof?.length ? mlbConviction.misreadSignal.opponentProof : mlbConviction.opponentProof).slice(0, 3).map(row => (
                      <span key={`opponent-proof-${row}`} style={{ color: C.text, fontSize: 9.5, lineHeight: 1.35 }}>• {row}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {showFor(['numbers']) && mlbConviction.matchupRating && (
              <div style={{ marginBottom: 9, borderRadius: 14, padding: 10, background: 'rgba(125,246,255,0.07)', border: '1px solid rgba(125,246,255,0.18)' }}>
                <div style={{ color: C.green, fontSize: 9, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>{mlbConviction.matchupRating.ratingTitle || 'Matchup score'}{mlbConviction.matchupRating.bestFit ? ` · Best fit: ${mlbConviction.matchupRating.bestFit}` : ''}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
                  <div style={{ borderRadius: 11, padding: '8px 6px', background: 'rgba(2,5,1,0.62)', border: '1px solid rgba(125,246,255,0.16)', textAlign: 'center' }}>
                    <div style={{ color: C.faint, fontSize: 8.5, fontWeight: 900, textTransform: 'uppercase' }}>{mlbConviction.matchupRating.playerLabel || 'Player'}</div>
                    <div style={{ color: C.text, fontSize: 22, fontWeight: 950, lineHeight: 1 }}>{formatNumber(mlbConviction.matchupRating.playerRating)}</div>
                  </div>
                  <div style={{ borderRadius: 11, padding: '8px 6px', background: 'rgba(2,5,1,0.62)', border: '1px solid rgba(255,255,255,0.10)', textAlign: 'center' }}>
                    <div style={{ color: C.faint, fontSize: 8.5, fontWeight: 900, textTransform: 'uppercase' }}>{mlbConviction.matchupRating.opponentLabel || 'Opponent'}</div>
                    <div style={{ color: C.text, fontSize: 22, fontWeight: 950, lineHeight: 1 }}>{formatNumber(mlbConviction.matchupRating.opponentRating)}</div>
                  </div>
                  <div style={{ borderRadius: 11, padding: '8px 6px', background: 'rgba(255,209,102,0.08)', border: '1px solid rgba(255,209,102,0.18)', textAlign: 'center' }}>
                    <div style={{ color: C.faint, fontSize: 8.5, fontWeight: 900, textTransform: 'uppercase' }}>Gap</div>
                    <div style={{ color: (mlbConviction.matchupRating.matchupGap || 0) >= 8 ? C.green : (mlbConviction.matchupRating.matchupGap || 0) >= 0 ? C.amber : C.red, fontSize: 22, fontWeight: 950, lineHeight: 1 }}>{(mlbConviction.matchupRating.matchupGap || 0) > 0 ? '+' : ''}{formatNumber(mlbConviction.matchupRating.matchupGap)}</div>
                  </div>
                </div>
                {Array.isArray(mlbConviction.matchupRating.subRatings) && mlbConviction.matchupRating.subRatings.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6, marginTop: 7 }}>
                    {mlbConviction.matchupRating.subRatings.slice(0, 6).map(row => (
                      <div key={`mlb-sub-${row.label}`} style={{ borderRadius: 10, padding: '7px 6px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)', textAlign: 'center' }}>
                        <div style={{ color: C.text, fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{formatNumber(row.score)}</div>
                        <div style={{ color: C.faint, fontSize: 8, fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.label}</div>
                      </div>
                    ))}
                  </div>
                )}
                {mlbConviction.matchupRating.read && <div style={{ color: C.muted, fontSize: 9.5, lineHeight: 1.35, marginTop: 7, fontWeight: 800 }}>{mlbConviction.matchupRating.read}</div>}
              </div>
            )}

            {showFor(['risk']) && (mlbConviction.whyLive.length > 0 || mlbConviction.path || mlbConviction.killSwitch.length > 0 || mlbConviction.numberDiscipline) && (
              <div style={{ borderRadius: 13, padding: 10, background: 'rgba(2,5,1,0.42)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <div style={{ color: C.green, fontSize: 9, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>Why this can hit</div>
                <div style={{ display: 'grid', gap: 4 }}>
                  {[...mlbConviction.whyLive.slice(0, 3), mlbConviction.path ? `Path: ${mlbConviction.path}` : ''].filter(Boolean).map(row => (
                    <div key={`mlb-live-${row}`} style={{ color: C.muted, fontSize: 9.5, lineHeight: 1.35, display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: 4 }}>
                      <span style={{ color: C.green }}>›</span>
                      <span>{row}</span>
                    </div>
                  ))}
                </div>
                {mlbConviction.killSwitch.length > 0 && <div style={{ color: C.red, fontSize: 9, lineHeight: 1.34, marginTop: 7, fontWeight: 850 }}>What can ruin it: {mlbConviction.killSwitch.join(' · ')}</div>}
                {mlbConviction.numberDiscipline && <div style={{ color: C.faint, fontSize: 9, lineHeight: 1.34, marginTop: 6, fontWeight: 800 }}>Line note: {mlbConviction.numberDiscipline}</div>}
              </div>
            )}
          </div>
        )}

        {compact ? (
          <div style={{ marginTop: 9, display: 'grid', gap: 8 }}>
            {opponentFitBullets.length > 0 && (
              <OpponentFitPanel title={opponentFitTitle} bullets={opponentFitBullets} tone={opponentFitTone} compact />
            )}
            {lineOptions.length > 0 && (
              lineOptions.length > 1
                ? <PropLadder options={lineOptions} recentValues={recentValues} bestFit={ladderBestFit} compact />
                : <PrimaryPropChip option={lineOptions[0]} signal={signal} compact />
            )}
            <div style={{ color: C.muted, fontSize: 9.5, fontWeight: 850, lineHeight: 1.35, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mlbConviction?.misreadSignal
                ? `MLB matchup check · ${mlbConviction.misreadSignal.label}: ${mlbConviction.misreadSignal.summary}`
                : overallRatings?.matchup?.score
                  ? `Overall ${formatNumber(overallRatings.matchup.score)} · ${overallRatings.matchup.label || 'rated'}`
                  : formCheckRows[0] || whyCare[0] || 'Tap for full decision cockpit.'}
            </div>
            <div data-signal-open-cta="true" style={{ justifySelf: 'center', position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 196, borderRadius: 999, padding: '10px 17px', background: 'linear-gradient(135deg, rgba(125,246,255,0.30), rgba(25,110,180,0.20), rgba(125,246,255,0.13))', border: '1px solid rgba(125,246,255,0.72)', boxShadow: '0 0 0 1px rgba(125,246,255,0.36), 0 0 22px rgba(125,246,255,0.30), inset 0 1px 0 rgba(255,255,255,0.14)', color: C.green, fontSize: 9.5, fontWeight: 950, letterSpacing: '0.11em', textTransform: 'uppercase', cursor: 'pointer' }}>
              <span aria-hidden="true">↯</span>
              <span>{tapHint}</span>
            </div>
          </div>
        ) : showFor(['read']) ? (
          <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
            <div style={{ color: C.green, fontSize: 8, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Why this player</div>
            {whyCare.slice(0, 3).map((bullet) => (
              <div key={bullet} style={{ color: C.muted, fontSize: 9, lineHeight: 1.4, display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: 4 }}>
                <span style={{ color: C.green }}>›</span>
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        ) : null}

        {decisionSections.length > 0 && !compact && showFor(['risk']) && (
          <div style={{ marginTop: 10, borderRadius: 14, padding: 10, background: 'rgba(255,255,255,0.032)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ color: C.green, fontSize: 8.5, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Quick read</div>
              <div style={{ color: C.faint, fontSize: 8, fontWeight: 900 }}>role · line · risk</div>
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              {decisionSections.map(section => (
                <div key={section.title} style={{ borderRadius: 11, padding: '8px 8px', background: section.title === 'RISK CHECK' ? 'rgba(255,209,102,0.045)' : 'rgba(125,246,255,0.035)', border: `1px solid ${section.title === 'RISK CHECK' ? 'rgba(255,209,102,0.13)' : 'rgba(125,246,255,0.10)'}` }}>
                  <div style={{ color: section.title === 'RISK CHECK' ? C.amber : C.green, fontSize: 7.5, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>{section.title}</div>
                  <div style={{ display: 'grid', gap: 3 }}>
                    {section.rows.slice(0, 3).map(row => (
                      <div key={`${section.title}-${row}`} style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.32, display: 'grid', gridTemplateColumns: '10px minmax(0,1fr)', gap: 4 }}>
                        <span style={{ color: section.title === 'RISK CHECK' ? C.amber : C.green }}>•</span>
                        <span>{row}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {false && judgmentFacts.length > 0 && !compact && (
          <div style={{ marginTop: 10, borderRadius: 12, padding: 9, background: 'rgba(125,246,255,0.04)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 7 }}>
              <div style={{ color: C.green, fontSize: 8, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Judgment check</div>
              <div style={{ color: C.faint, fontSize: 8, fontWeight: 900 }}>volume · minutes · line</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6 }}>
              {judgmentFacts.map(fact => (
                <div key={fact.label} style={{ borderRadius: 10, padding: '7px 6px', background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ color: C.faint, fontSize: 7.5, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{fact.label}</div>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 950, marginTop: 2 }}>{fact.value}</div>
                  <div style={{ color: C.muted, fontSize: 7.5, fontWeight: 800, marginTop: 1, lineHeight: 1.25 }}>{fact.sub}</div>
                </div>
              ))}
            </div>
            {judgmentNotes.length > 0 && <div style={{ marginTop: 7, display: 'grid', gap: 4 }}>
              {judgmentNotes.map(note => <div key={note} style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.35 }}>• {note}</div>)}
            </div>}
          </div>
        )}

        {!compact && showFor(['stats']) && recentValues.length > 0 && (
          <div style={{ marginTop: 10, borderRadius: 12, padding: 9, background: 'rgba(255,255,255,0.028)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 7 }}>
              <div style={{ color: C.text, fontSize: 9, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Last 12 full stats</div>
              <div style={{ color: C.faint, fontSize: 8, fontWeight: 900 }}>avg {formatNumber(recentAvg)} · low-high {formatNumber(recentMin)}-{formatNumber(recentMax)}</div>
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

        {!compact && detailTab && !activeTabHasContent && (
          <div style={{ marginTop: 10, borderRadius: 14, padding: 12, background: 'rgba(125,246,255,0.055)', border: '1px solid rgba(125,246,255,0.18)', color: C.muted, fontSize: 10, lineHeight: 1.4, fontWeight: 850 }}>
            {tabEmptyText}
          </div>
        )}

        {false && !compact && intelRows.length > 0 && (
          <div style={{ marginTop: 10, borderRadius: 12, padding: 9, background: 'rgba(125,246,255,0.045)', border: `1px solid ${C.border}` }}>
            <div style={{ color: C.text, fontSize: 9, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>Intel check</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {intelRows.map(row => <div key={row} style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.38 }}>• {simpleContext(row)}</div>)}
            </div>
          </div>
        )}

        {!compact && showFor(['risk']) && killRows.length > 0 && (
          <div style={{ marginTop: 8, borderRadius: 12, padding: 9, background: 'rgba(255,209,102,0.045)', border: '1px solid rgba(255,209,102,0.16)' }}>
            <div style={{ color: C.amber, fontSize: 9, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>Watch out for</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {killRows.map(row => <div key={row} style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.38 }}>• {row}</div>)}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
