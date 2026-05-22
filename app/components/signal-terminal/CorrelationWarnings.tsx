'use client'

import { detectCorrelationWarnings } from '../../lib/parlays/correlation'
import type { CorrelationInputItem, CorrelationWarning } from '../../lib/parlays/correlation'

const C = {
  green: '#a6ff3f',
  amber: '#ffd166',
  red: '#ff4d6d',
  cyan: '#8df7ff',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.62)',
  faint: 'rgba(244,255,232,0.36)',
  border: 'rgba(255,255,255,0.10)',
}

export interface CorrelationWarningsProps {
  warnings?: CorrelationWarning[] | null
  items?: CorrelationInputItem[] | null
  title?: string
  compact?: boolean
  emptyLabel?: string
}

function colorFor(severity: CorrelationWarning['severity']) {
  if (severity === 'danger') return C.red
  if (severity === 'watch') return C.amber
  return C.cyan
}

export default function CorrelationWarnings({
  warnings,
  items,
  title = 'Correlation warnings',
  compact = false,
  emptyLabel = 'No duplicate, same-game, same-team, or thin-liquidity conflicts detected.',
}: CorrelationWarningsProps) {
  const derived = warnings ?? (items?.length ? detectCorrelationWarnings(items) : [])
  const rows = derived.slice(0, compact ? 3 : 8)
  const dangerCount = derived.filter((warning) => warning.severity === 'danger').length

  return (
    <div style={{ borderRadius: 14, padding: compact ? 10 : 12, background: 'rgba(0,0,0,0.20)', border: `1px solid ${dangerCount ? 'rgba(255,77,109,0.24)' : C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: rows.length ? 8 : 0 }}>
        <div style={{ color: dangerCount ? C.red : C.cyan, fontSize: compact ? 8 : 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ color: dangerCount ? C.red : rows.length ? C.amber : C.faint, fontSize: 8, fontWeight: 950 }}>{derived.length} warning{derived.length === 1 ? '' : 's'}</div>
      </div>

      {rows.length === 0 ? (
        !compact && <div style={{ marginTop: 8, borderRadius: 10, padding: 9, background: 'rgba(255,255,255,0.025)', border: '1px dashed rgba(255,255,255,0.10)', color: C.faint, fontSize: 10, lineHeight: 1.4 }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {rows.map((warning, index) => {
            const color = colorFor(warning.severity)
            return (
              <div key={`${warning.label}-${index}`} style={{ borderRadius: 11, padding: compact ? '7px 8px' : '8px 9px', background: warning.severity === 'danger' ? 'rgba(255,77,109,0.08)' : warning.severity === 'watch' ? 'rgba(255,209,102,0.07)' : 'rgba(141,247,255,0.055)', border: `1px solid ${warning.severity === 'danger' ? 'rgba(255,77,109,0.22)' : 'rgba(255,255,255,0.09)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <div style={{ color, fontSize: compact ? 9 : 10, fontWeight: 950 }}>{warning.label}</div>
                  <div style={{ color, fontSize: 7, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{warning.severity}</div>
                </div>
                {!compact && <div style={{ color: C.muted, fontSize: 9, lineHeight: 1.38, marginTop: 4 }}>{warning.detail}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
