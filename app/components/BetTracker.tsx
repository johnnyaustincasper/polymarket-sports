'use client'

interface BetLog {
  id: string
  gameId: string
  matchup: string
  betType: string
  betLabel: string
  odds: number
  stake: number
  result: 'pending' | 'win' | 'loss'
  createdAt: string
}

const C = {
  cyan: '#7df6ff',
  green: '#7df6ff',
  red: '#ff3f5f',
  textPrimary: '#f7fff0',
  textSecondary: 'rgba(219,255,191,0.54)',
  border: 'rgba(125,246,255,0.14)',
}

export default function BetTracker({ bets, onUpdate, onClose }: {
  bets: BetLog[]
  onUpdate: (bets: BetLog[]) => void
  onClose: () => void
}) {
  const setResult = (id: string, result: 'win' | 'loss') =>
    onUpdate(bets.map(b => b.id === id ? { ...b, result } : b))
  const remove = (id: string) => onUpdate(bets.filter(b => b.id !== id))

  const pending = bets.filter(b => b.result === 'pending')
  const settled = bets.filter(b => b.result !== 'pending')
  const totalStaked = settled.reduce((s, b) => s + b.stake, 0)
  const totalPnl = settled.reduce((s, b) => b.result === 'win' ? s + (b.stake / b.odds - b.stake) : s - b.stake, 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(2,2,15,0.96)', backdropFilter: 'blur(24px)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(125,246,255,0.015) 2px, rgba(125,246,255,0.015) 4px)' }} />
      <div className="flex-1 overflow-y-auto max-w-lg w-full mx-auto px-5 py-8" style={{ position: 'relative', zIndex: 1 }}>
        <button onClick={onClose} style={{ color: C.textSecondary, fontSize: 12, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>← CLOSE</button>
        <h3 style={{ color: C.cyan, fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', textShadow: `0 0 20px ${C.cyan}55` }}>◈ BET TRACKER</h3>

        {settled.length > 0 && (
          <div className="mt-4 mb-6 rounded-2xl p-4 grid grid-cols-3 text-center" style={{ background: 'rgba(125,246,255,0.04)', border: `1px solid ${C.border}` }}>
            {([['BETS', settled.length, C.textPrimary], ['STAKED', `$${totalStaked.toFixed(0)}`, C.textPrimary], ['P&L', `${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`, totalPnl >= 0 ? C.green : C.red]] as const).map(([label, val, color]) => (
              <div key={String(label)}>
                <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</p>
                <p style={{ color: String(color), fontWeight: 800, fontSize: 20, marginTop: 2 }}>{val}</p>
              </div>
            ))}
          </div>
        )}

        {pending.length > 0 && (
          <>
            <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>Pending</p>
            {pending.map(b => (
              <div key={b.id} className="rounded-2xl p-4 mb-2" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p style={{ color: C.textPrimary, fontWeight: 700, fontSize: 13 }}>{b.betLabel}</p>
                    <p style={{ color: C.textSecondary, fontSize: 11 }}>{b.matchup} · ${b.stake}</p>
                  </div>
                  <button onClick={() => remove(b.id)} style={{ color: C.textSecondary, fontSize: 12 }}>✕</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setResult(b.id, 'win')} className="flex-1 py-2 rounded-xl font-bold transition-all" style={{ background: 'rgba(125,246,255,0.1)', border: '1px solid rgba(125,246,255,0.3)', color: C.green, fontSize: 12 }}>WIN</button>
                  <button onClick={() => setResult(b.id, 'loss')} className="flex-1 py-2 rounded-xl font-bold transition-all" style={{ background: 'rgba(255,68,102,0.1)', border: '1px solid rgba(255,68,102,0.3)', color: C.red, fontSize: 12 }}>LOSS</button>
                </div>
              </div>
            ))}
          </>
        )}

        {settled.length > 0 && (
          <>
            <p style={{ color: C.textSecondary, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10, marginTop: 20 }}>Settled</p>
            {settled.map(b => (
              <div key={b.id} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <p style={{ color: C.textPrimary, fontSize: 12, fontWeight: 600 }}>{b.betLabel}</p>
                  <p style={{ color: C.textSecondary, fontSize: 10 }}>{b.matchup} · ${b.stake}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 12, fontWeight: 700, color: b.result === 'win' ? C.green : C.red }}>
                    {b.result === 'win' ? `+$${(b.stake / b.odds - b.stake).toFixed(2)}` : `-$${b.stake}`}
                  </span>
                  <button onClick={() => remove(b.id)} style={{ color: C.textSecondary, fontSize: 10 }}>✕</button>
                </div>
              </div>
            ))}
          </>
        )}

        {bets.length === 0 && (
          <div className="text-center py-16">
            <p style={{ color: C.textSecondary, fontSize: 14 }}>No bets logged</p>
            <p style={{ color: C.textSecondary, opacity: 0.5, fontSize: 11, marginTop: 6, letterSpacing: '0.05em' }}>Tap any odds chip to log a position</p>
          </div>
        )}
      </div>
    </div>
  )
}
