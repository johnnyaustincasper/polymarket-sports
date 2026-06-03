'use client'

import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { signalCardTapContract } from '../../lib/signals/card-collapse'
import { selectWhyThisPlayerBullets } from '../../lib/signals/why-player'
import { classifySignalDecision } from '../../lib/signals/insight'
import { CARD_EXPORT_ROOT_SELECTOR, cardExportStatusLabel, shareOrDownloadCardImage, type CardExportStatus } from '../../lib/card-image-export'
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
  if (/price|ask|fair|edge|market|c\b/i.test(text)) return 'Do not chase it if the line gets worse before tipoff.'
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
  const judgmentContext = signal.metadata?.judgmentContext as {
    lastGame?: { value?: number; points?: number; minutes?: number; fgMade?: number; fgAttempted?: number; fgPct?: number; threeMade?: number; threeAttempted?: number; threePct?: number; ftMade?: number; ftAttempted?: number; opponent?: string }
    trend?: { last5Avg?: number; last12Avg?: number; median?: number; last5HitRate?: number; last5Games?: number; range?: { min?: number; max?: number } }
    lineCheck?: { line?: number; median?: number; hitRateLabel?: string; verdict?: string; range?: { min?: number; max?: number } }
    roleCheck?: { status?: string; label?: string; details?: string[] }
    consistency?: { grade?: string; label?: string }
    gameEnvironment?: string[]
    sportSpecificNotes?: string[]
    decisionSections?: Array<{ title?: string; rows?: string[] }>
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
  const judgmentNotes = [
    ...(Array.isArray(judgmentContext?.matchupNotes) ? judgmentContext.matchupNotes : []),
    ...(Array.isArray(judgmentContext?.injuryNotes) ? judgmentContext.injuryNotes : []),
    judgmentContext?.playableNumber || '',
  ].map(row => stripJargon(String(row || ''))).filter(Boolean).slice(0, 3)
  const tapHint = selected ? signalCardTapContract.expandedCta : signalCardTapContract.collapsedCta
  const [shareState, setShareState] = useState<CardExportStatus>('idle')

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
      data-signal-glow={compact && onOpen ? 'true' : undefined}
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
        <>
          <style>{`
            @keyframes ${signalCardTapContract.glowAnimationName} {
              0%, 100% {
                opacity: 0.34;
                box-shadow: 0 0 0 1px rgba(125,246,255,0.22), 0 0 10px rgba(125,246,255,0.14);
              }
              50% {
                opacity: 1;
                box-shadow: 0 0 0 1px rgba(125,246,255,0.78), 0 0 24px rgba(125,246,255,0.50), 0 0 44px rgba(125,246,255,0.20);
              }
            }
            @media (prefers-reduced-motion: reduce) {
              [data-signal-glow="true"] [data-signal-blue-glow="true"] {
                animation: none !important;
                opacity: 0.74;
              }
            }
          `}</style>
          <span
            aria-hidden="true"
            data-signal-blue-glow="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 18,
              border: '1px solid rgba(125,246,255,0.68)',
              pointerEvents: 'none',
              animation: `${signalCardTapContract.glowAnimationName} 2.35s ease-in-out infinite`,
              zIndex: 2,
            }}
          />
        </>
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
                <div style={{ color: C.muted, fontSize: 8, fontWeight: 900, marginTop: 3 }}>{idx === 0 ? 'Main look' : idx === 1 ? 'Bigger night' : 'Long shot'}</div>
                <div style={{ color: C.faint, fontSize: 7.5, fontWeight: 900, marginTop: 1 }}>{idx === 0 ? 'Lower bar to clear' : 'Needs more from him'}</div>
              </a>
            ))}
          </div>
        )}

        {formCheckRows.length > 0 && !compact && (
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

        {compact ? (
          <div style={{ marginTop: 9, display: 'grid', gap: 8 }}>
            <div style={{ color: C.muted, fontSize: 9.5, fontWeight: 850, lineHeight: 1.35, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formCheckRows[0] || whyCare[0] || 'Tap for full decision cockpit.'}</div>
            <div style={{ justifySelf: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 176, borderRadius: 999, padding: '8px 14px', background: 'linear-gradient(135deg, rgba(125,246,255,0.22), rgba(125,246,255,0.09))', border: '1px solid rgba(125,246,255,0.45)', boxShadow: '0 0 20px rgba(125,246,255,0.18)', color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.11em', textTransform: 'uppercase' }}>
              <span aria-hidden="true">↯</span>
              <span>{tapHint}</span>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
            <div style={{ color: C.green, fontSize: 8, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Why this player</div>
            {whyCare.slice(0, 3).map((bullet) => (
              <div key={bullet} style={{ color: C.muted, fontSize: 9, lineHeight: 1.4, display: 'grid', gridTemplateColumns: '12px minmax(0,1fr)', gap: 4 }}>
                <span style={{ color: C.green }}>›</span>
                <span>{bullet}</span>
              </div>
            ))}
          </div>
        )}

        {decisionSections.length > 0 && !compact && (
          <div style={{ marginTop: 10, borderRadius: 14, padding: 10, background: 'rgba(255,255,255,0.032)', border: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ color: C.green, fontSize: 8.5, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Decision cockpit</div>
              <div style={{ color: C.faint, fontSize: 8, fontWeight: 900 }}>role · number · risk</div>
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

        {!compact && recentValues.length > 0 && (
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

        {false && !compact && intelRows.length > 0 && (
          <div style={{ marginTop: 10, borderRadius: 12, padding: 9, background: 'rgba(125,246,255,0.045)', border: `1px solid ${C.border}` }}>
            <div style={{ color: C.text, fontSize: 9, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>Intel check</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {intelRows.map(row => <div key={row} style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.38 }}>• {simpleContext(row)}</div>)}
            </div>
          </div>
        )}

        {!compact && killRows.length > 0 && (
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
