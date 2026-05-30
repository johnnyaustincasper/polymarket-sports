'use client'

import CorrelationWarnings from './CorrelationWarnings'
import LineupInjuryFlags from './LineupInjuryFlags'
import PriceFairMovementChart from './PriceFairMovementChart'
import SignalDetailDrawer from './SignalDetailDrawer'
import SportsbookConsensusPanel from './SportsbookConsensusPanel'
import type { PropDetailDrawerProps } from './types'

const C = {
  green: '#7df6ff',
  amber: '#ffd166',
  cyan: '#8df7ff',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.66)',
  faint: 'rgba(244,255,232,0.38)',
  border: 'rgba(255,255,255,0.10)',
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatValue(value: number | null | undefined, suffix = '') {
  if (!isFiniteNumber(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`
}

function formatMarketChance(value: number | null | undefined) {
  if (!isFiniteNumber(value)) return '—'
  const pct = Math.abs(value) <= 1 ? value * 100 : value
  return formatValue(pct, '%')
}

export default function PropDetailDrawer(props: PropDetailDrawerProps) {
  const { signal, open = true, title = 'Prop detail' } = props
  if (!open || !signal) return null

  const consensus = signal.consensus ?? signal.sportsbookConsensus ?? null
  const side = signal.side ? String(signal.side).toUpperCase() : 'YES'
  const line = signal.line ?? signal.bookLine

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ borderRadius: 18, padding: 1, background: 'linear-gradient(135deg, rgba(141,247,255,0.36), rgba(125,246,255,0.24), rgba(255,255,255,0.08))' }}>
        <div style={{ borderRadius: 17, padding: 13, background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))', border: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.cyan, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{title}</div>
              <div style={{ color: C.text, fontSize: 18, fontWeight: 950, marginTop: 4 }}>{signal.player || signal.label || 'Player prop'}</div>
              <div style={{ color: C.muted, fontSize: 10, lineHeight: 1.38, marginTop: 3 }}>{[signal.metric, line != null ? `line ${formatValue(line)}` : '', side, signal.matchup].filter(Boolean).join(' · ') || 'Prop metadata pending'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(62px,1fr))', gap: 7 }}>
              {[
                ['Market', formatMarketChance(signal.ask), C.amber],
                ['Model', formatMarketChance(signal.fairPrice), C.green],
                ['Avg', formatValue(signal.avg), C.text],
              ].map(([label, value, color]) => (
                <div key={label} style={{ borderRadius: 10, padding: '7px 6px', background: 'rgba(255,255,255,0.036)', border: `1px solid ${C.border}`, textAlign: 'center' }}>
                  <div style={{ color, fontSize: 12, fontWeight: 950 }}>{value}</div>
                  <div style={{ color: C.muted, fontSize: 7, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 9, marginTop: 12 }}>
            <PriceFairMovementChart points={signal.movement} compact title="Prop movement" />
            <LineupInjuryFlags flags={signal.lineupFlags} compact={false} />
            <CorrelationWarnings warnings={signal.correlationWarnings} items={signal.correlationItems} compact={false} />
          </div>

          <div style={{ marginTop: 12 }}>
            <SportsbookConsensusPanel consensus={consensus} />
          </div>
        </div>
      </div>

      <SignalDetailDrawer
        signal={props.signal}
        open={props.open}
        watched={props.watched}
        onClose={props.onClose}
        onToggleWatch={props.onToggleWatch}
        onOpenMarket={props.onOpenMarket}
        deltas={props.deltas}
      />
    </div>
  )
}
