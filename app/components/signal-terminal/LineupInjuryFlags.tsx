'use client'

import type { LineupInjuryFlagItem } from './types'

const C = {
  green: '#7df6ff',
  amber: '#ffd166',
  red: '#ff4d6d',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.62)',
  faint: 'rgba(244,255,232,0.36)',
  border: 'rgba(255,255,255,0.10)',
}

export interface LineupInjuryFlagsProps {
  flags?: LineupInjuryFlagItem[] | null
  title?: string
  compact?: boolean
  emptyLabel?: string
}

function colorFor(severity?: string) {
  if (severity === 'danger') return C.red
  if (severity === 'watch') return C.amber
  return C.green
}

function labelFor(flag: LineupInjuryFlagItem) {
  return [flag.player, flag.status || flag.injury].filter(Boolean).join(' · ') || flag.detail || 'Lineup note'
}

export default function LineupInjuryFlags({
  flags,
  title = 'Lineup / injury flags',
  compact = false,
  emptyLabel = 'No lineup or injury red flags attached to this signal.',
}: LineupInjuryFlagsProps) {
  const rows = flags ?? []

  return (
    <div style={{ borderRadius: 14, padding: compact ? 10 : 12, background: 'rgba(0,0,0,0.20)', border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: rows.length ? 8 : 0 }}>
        <div style={{ color: C.green, fontSize: compact ? 8 : 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{title}</div>
        <div style={{ color: rows.some((flag) => flag.severity === 'danger') ? C.red : rows.length ? C.amber : C.faint, fontSize: 8, fontWeight: 950 }}>{rows.length} flag{rows.length === 1 ? '' : 's'}</div>
      </div>

      {rows.length === 0 ? (
        !compact && <div style={{ marginTop: 8, borderRadius: 10, padding: 9, background: 'rgba(255,255,255,0.025)', border: '1px dashed rgba(255,255,255,0.10)', color: C.faint, fontSize: 10, lineHeight: 1.4 }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {rows.slice(0, compact ? 3 : 8).map((flag, index) => {
            const color = colorFor(flag.severity)
            const key = flag.id ?? `${flag.team ?? 'team'}-${flag.player ?? 'flag'}-${index}`
            return (
              <div key={key} style={{ borderRadius: 11, padding: compact ? '7px 8px' : '8px 9px', background: flag.severity === 'danger' ? 'rgba(255,77,109,0.08)' : flag.severity === 'watch' ? 'rgba(255,209,102,0.07)' : 'rgba(125,246,255,0.055)', border: `1px solid ${flag.severity === 'danger' ? 'rgba(255,77,109,0.22)' : 'rgba(125,246,255,0.13)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <div style={{ minWidth: 0, color, fontSize: compact ? 9 : 10, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelFor(flag)}</div>
                  <div style={{ color: C.muted, fontSize: 7, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>{flag.team || flag.impact || 'note'}</div>
                </div>
                {!compact && (flag.detail || flag.expectedMinutes || flag.source) && (
                  <div style={{ color: C.muted, fontSize: 9, lineHeight: 1.38, marginTop: 4 }}>
                    {[flag.detail, flag.expectedMinutes ? `Proj min: ${flag.expectedMinutes}` : '', flag.source ? `Source: ${flag.source}` : ''].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
