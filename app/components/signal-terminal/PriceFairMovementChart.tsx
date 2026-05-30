'use client'

import { type CSSProperties, useId } from 'react'
import type { SignalMovementPoint } from './types'

const C = {
  green: '#7df6ff',
  amber: '#ffd166',
  red: '#ff4d6d',
  cyan: '#8df7ff',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.62)',
  faint: 'rgba(244,255,232,0.36)',
  border: 'rgba(255,255,255,0.10)',
  borderHot: 'rgba(125,246,255,0.34)',
}

export interface PriceFairMovementChartProps {
  points?: SignalMovementPoint[] | null
  height?: number
  compact?: boolean
  title?: string
  emptyLabel?: string
  style?: CSSProperties
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function toPercent(value: number | null | undefined): number | null {
  if (!isFiniteNumber(value)) return null
  return Math.abs(value) <= 1 ? value * 100 : value
}

function formatMarketChance(value: number | null | undefined) {
  const pct = toPercent(value)
  if (pct == null) return '—'
  const rounded = Math.round(pct * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

function shortLabel(point: SignalMovementPoint, index: number) {
  if (point.label) return point.label
  const raw = point.time ?? point.timestamp
  if (!raw) return index === 0 ? 'open' : `t${index + 1}`
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) return raw.slice(0, 8)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function pathFor(values: Array<number | null>, min: number, range: number, width: number, height: number, pad: number) {
  const usableWidth = width - pad * 2
  const usableHeight = height - pad * 2
  const lastIndex = Math.max(values.length - 1, 1)
  let path = ''

  values.forEach((value, index) => {
    if (value == null) return
    const x = pad + (index / lastIndex) * usableWidth
    const y = pad + (1 - (value - min) / range) * usableHeight
    path += `${path ? ' L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
  })

  return path
}

export default function PriceFairMovementChart({
  points,
  height = 128,
  compact = false,
  title = 'Market / model movement',
  emptyLabel = 'No movement history yet',
  style,
}: PriceFairMovementChartProps) {
  const instanceId = useId().replace(/:/g, '')
  const askGradientId = `signalAskGlow-${instanceId}`
  const fairGradientId = `signalFairGlow-${instanceId}`
  const normalized = (points ?? []).filter((point) => point && (toPercent(point.ask ?? point.price) != null || toPercent(point.fairPrice) != null))
  const latest = normalized[normalized.length - 1]
  const first = normalized[0]

  const askValues = normalized.map((point) => toPercent(point.ask ?? point.price))
  const fairValues = normalized.map((point) => toPercent(point.fairPrice))
  const allValues = [...askValues, ...fairValues].filter(isFiniteNumber)
  const width = 360
  const pad = compact ? 14 : 18
  const chartHeight = Math.max(height, compact ? 92 : 116)
  const minRaw = allValues.length ? Math.min(...allValues) : 0
  const maxRaw = allValues.length ? Math.max(...allValues) : 100
  const spread = Math.max(maxRaw - minRaw, 4)
  const min = Math.max(0, Math.floor((minRaw - spread * 0.24) / 2) * 2)
  const max = Math.min(100, Math.ceil((maxRaw + spread * 0.24) / 2) * 2)
  const range = Math.max(max - min, 1)
  const askPath = pathFor(askValues, min, range, width, chartHeight, pad)
  const fairPath = pathFor(fairValues, min, range, width, chartHeight, pad)
  const delta = first && latest ? (toPercent(latest.ask ?? latest.price) ?? 0) - (toPercent(first.ask ?? first.price) ?? 0) : null
  const deltaColor = delta == null ? C.muted : delta <= 0 ? C.green : C.amber

  return (
    <div style={{ borderRadius: 14, padding: compact ? 10 : 12, background: 'rgba(0,0,0,0.22)', border: `1px solid ${C.border}`, ...style }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ color: C.green, fontSize: compact ? 8 : 9, fontWeight: 950, letterSpacing: '0.13em', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ color: deltaColor, fontSize: compact ? 8 : 9, fontWeight: 950 }}>
          {delta == null ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta * 10) / 10}%`}
        </div>
      </div>

      {normalized.length < 2 ? (
        <div style={{ height: chartHeight, borderRadius: 12, display: 'grid', placeItems: 'center', color: C.faint, fontSize: 10, fontWeight: 800, background: 'linear-gradient(135deg, rgba(125,246,255,0.045), rgba(255,255,255,0.025))', border: '1px dashed rgba(125,246,255,0.18)' }}>
          {emptyLabel}
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label={title} style={{ width: '100%', height: chartHeight, display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id={askGradientId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="rgba(255,209,102,0.36)" />
              <stop offset="1" stopColor={C.amber} />
            </linearGradient>
            <linearGradient id={fairGradientId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="rgba(125,246,255,0.30)" />
              <stop offset="1" stopColor={C.green} />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((tick) => {
            const y = pad + tick * (chartHeight - pad * 2)
            const value = max - tick * range
            return (
              <g key={tick}>
                <line x1={pad} x2={width - pad} y1={y} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 6" />
                <text x={0} y={y + 3} fill={C.faint} fontSize="8" fontWeight="800">{Math.round(value)}%</text>
              </g>
            )
          })}
          {fairPath && <path d={fairPath} fill="none" stroke={`url(#${fairGradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          {askPath && <path d={askPath} fill="none" stroke={`url(#${askGradientId})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {normalized.map((point, index) => {
            const ask = askValues[index]
            const fair = fairValues[index]
            const x = pad + (index / Math.max(normalized.length - 1, 1)) * (width - pad * 2)
            const askY = ask == null ? null : pad + (1 - (ask - min) / range) * (chartHeight - pad * 2)
            const fairY = fair == null ? null : pad + (1 - (fair - min) / range) * (chartHeight - pad * 2)
            return (
              <g key={`${point.timestamp ?? point.time ?? 'point'}-${index}`}>
                {fairY != null && <circle cx={x} cy={fairY} r="3" fill={C.green} stroke="rgba(0,0,0,0.82)" strokeWidth="1" />}
                {askY != null && <circle cx={x} cy={askY} r="3" fill={C.amber} stroke="rgba(0,0,0,0.82)" strokeWidth="1" />}
              </g>
            )
          })}
        </svg>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, color: C.muted, fontSize: 8, fontWeight: 850 }}>
        <span>{first ? shortLabel(first, 0) : '—'}</span>
        <span style={{ color: C.green }}>model {formatMarketChance(latest?.fairPrice)}</span>
        <span style={{ color: C.amber }}>market {formatMarketChance(latest?.ask ?? latest?.price)}</span>
        <span>{latest ? shortLabel(latest, normalized.length - 1) : '—'}</span>
      </div>
    </div>
  )
}
