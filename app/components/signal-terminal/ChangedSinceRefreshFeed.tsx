'use client'

import type { SignalDelta } from '../../lib/signals/delta-feed'

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

export interface ChangedSinceRefreshFeedProps {
  changes?: SignalDelta[] | null
  maxItems?: number
  title?: string
  emptyLabel?: string
  onSelectChange?: (id: string) => void
}

function colorFor(type: SignalDelta['type']) {
  if (type === 'new') return C.green
  if (type === 'removed') return C.red
  if (type === 'tier' || type === 'liquidity') return C.cyan
  return C.amber
}

function iconFor(type: SignalDelta['type']) {
  if (type === 'new') return '＋'
  if (type === 'removed') return '−'
  if (type === 'tier') return '▲'
  if (type === 'liquidity') return '◇'
  return '↕'
}

function displayValue(value: SignalDelta['before'] | SignalDelta['after']) {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') {
    const cents = Math.abs(value) <= 1 ? value * 100 : value
    const rounded = Math.round(cents * 10) / 10
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}c`
  }
  return String(value)
}

export default function ChangedSinceRefreshFeed({
  changes,
  maxItems = 8,
  title = 'Changed since refresh',
  emptyLabel = 'No material signal changes since the last refresh.',
  onSelectChange,
}: ChangedSinceRefreshFeedProps) {
  const visible = (changes ?? []).slice(0, maxItems)

  return (
    <div style={{ borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.20)', border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
        <div style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ color: visible.length ? C.amber : C.faint, fontSize: 8, fontWeight: 950 }}>{visible.length} delta{visible.length === 1 ? '' : 's'}</div>
      </div>

      {visible.length === 0 ? (
        <div style={{ borderRadius: 11, padding: 10, color: C.faint, fontSize: 10, lineHeight: 1.4, background: 'rgba(255,255,255,0.025)', border: '1px dashed rgba(255,255,255,0.10)' }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {visible.map((change, index) => {
            const color = colorFor(change.type)
            const clickable = Boolean(onSelectChange)
            return (
              <button
                key={`${change.id}-${change.type}-${index}`}
                type="button"
                onClick={() => onSelectChange?.(change.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: 11,
                  padding: '8px 9px',
                  border: `1px solid ${change.type === 'removed' ? 'rgba(255,77,109,0.20)' : 'rgba(166,255,63,0.14)'}`,
                  background: 'rgba(255,255,255,0.032)',
                  cursor: clickable ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
                  <span style={{ color, fontSize: 12, fontWeight: 950, textAlign: 'center' }}>{iconFor(change.type)}</span>
                  <span style={{ color: C.text, fontSize: 10, fontWeight: 850, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{change.label}</span>
                  <span style={{ color, fontSize: 8, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{change.type}</span>
                </div>
                {(change.before != null || change.after != null || change.magnitude != null) && (
                  <div style={{ marginTop: 5, color: C.muted, fontSize: 8, fontWeight: 800, paddingLeft: 26 }}>
                    {displayValue(change.before)} → {displayValue(change.after)}
                    {typeof change.magnitude === 'number' && <span style={{ color, marginLeft: 6 }}>({change.magnitude > 0 ? '+' : ''}{Math.round(change.magnitude * 1000) / 1000})</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
