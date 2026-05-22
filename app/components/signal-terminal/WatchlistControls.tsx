'use client'

import type { SignalTerminalSignal } from './types'

const C = {
  green: '#a6ff3f',
  amber: '#ffd166',
  red: '#ff4d6d',
  text: '#f4ffe8',
  muted: 'rgba(244,255,232,0.62)',
  faint: 'rgba(244,255,232,0.36)',
  border: 'rgba(255,255,255,0.10)',
  borderHot: 'rgba(166,255,63,0.34)',
}

export interface WatchlistControlsProps {
  signal?: SignalTerminalSignal | null
  watched?: boolean
  alertArmed?: boolean
  muted?: boolean
  disabled?: boolean
  compact?: boolean
  note?: string | null
  onToggleWatch?: (signal?: SignalTerminalSignal | null) => void
  onArmAlert?: (signal?: SignalTerminalSignal | null) => void
  onMute?: (signal?: SignalTerminalSignal | null) => void
  onOpenMarket?: (signal?: SignalTerminalSignal | null) => void
}

function ControlButton({
  children,
  active,
  danger,
  disabled,
  onClick,
}: {
  children: string
  active?: boolean
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const color = danger ? C.red : active ? C.green : C.muted
  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: '8px 10px',
        border: `1px solid ${active ? C.borderHot : danger ? 'rgba(255,77,109,0.30)' : C.border}`,
        background: active ? 'rgba(166,255,63,0.13)' : danger ? 'rgba(255,77,109,0.08)' : 'rgba(255,255,255,0.035)',
        color: disabled ? C.faint : color,
        fontSize: 8,
        fontWeight: 950,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        cursor: disabled || !onClick ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

export default function WatchlistControls({
  signal,
  watched = false,
  alertArmed = false,
  muted = false,
  disabled = false,
  compact = false,
  note,
  onToggleWatch,
  onArmAlert,
  onMute,
  onOpenMarket,
}: WatchlistControlsProps) {
  const canOpenMarket = Boolean(signal?.url || signal?.ticker) && Boolean(onOpenMarket)

  return (
    <div style={{ borderRadius: compact ? 0 : 14, padding: compact ? 0 : 12, background: compact ? 'transparent' : 'rgba(0,0,0,0.18)', border: compact ? 'none' : `1px solid ${C.border}` }}>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
          <div style={{ color: C.green, fontSize: 9, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Watch controls</div>
          <div style={{ color: watched ? C.green : C.faint, fontSize: 8, fontWeight: 950 }}>{watched ? 'watching' : 'not watched'}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <ControlButton active={watched} disabled={disabled} onClick={onToggleWatch ? () => onToggleWatch(signal) : undefined}>
          {watched ? 'Watching' : 'Watch'}
        </ControlButton>
        <ControlButton active={alertArmed} disabled={disabled || !watched} onClick={onArmAlert ? () => onArmAlert(signal) : undefined}>
          {alertArmed ? 'Alert armed' : 'Arm alert'}
        </ControlButton>
        <ControlButton active={muted} danger={muted} disabled={disabled || !watched} onClick={onMute ? () => onMute(signal) : undefined}>
          {muted ? 'Muted' : 'Mute'}
        </ControlButton>
        <ControlButton active={canOpenMarket} disabled={disabled || !canOpenMarket} onClick={onOpenMarket ? () => onOpenMarket(signal) : undefined}>
          Open market
        </ControlButton>
      </div>

      {!compact && (
        <div style={{ color: note ? C.muted : C.faint, fontSize: 9, lineHeight: 1.4, marginTop: 8 }}>
          {note || 'Add to watchlist to track ask, fair value, tier movement, and post-refresh deltas.'}
        </div>
      )}
    </div>
  )
}
