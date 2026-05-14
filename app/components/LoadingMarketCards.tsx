const GREEN = '#a6ff3f'

export default function LoadingMarketCards({ cols = 3, count = 6 }: { cols?: number; count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 250, borderRadius: 24, padding: 1,
          background: 'linear-gradient(135deg, rgba(166,255,63,0.36), rgba(255,255,255,0.10), rgba(166,255,63,0.08))',
          boxShadow: '0 0 34px rgba(166,255,63,0.10), 0 14px 48px rgba(0,0,0,0.42)',
          animation: `scanCardGlow ${1.15 + (i % 3) * 0.18}s ease-in-out infinite`,
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{ position: 'absolute', inset: 1, borderRadius: 23, background: 'linear-gradient(145deg, rgba(10,16,7,0.96), rgba(3,5,0,0.96))' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(166,255,63,0.95), transparent)', animation: `scanCardSweep ${1 + (i % 2) * 0.2}s linear infinite` }} />
          <div style={{ position: 'relative', padding: 18, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div style={{ width: 86, height: 10, borderRadius: 999, background: 'rgba(166,255,63,0.22)' }} />
                <div style={{ width: 36, height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} />
              </div>
              <div style={{ height: 24, borderRadius: 10, background: 'rgba(247,255,240,0.10)', marginBottom: 10, width: '76%' }} />
              <div style={{ height: 14, borderRadius: 8, background: 'rgba(166,255,63,0.10)', width: '54%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[0, 1, 2].map(n => <div key={n} style={{ height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(166,255,63,0.10)' }} />)}
            </div>
            <div style={{ color: GREEN, fontSize: 10, fontWeight: 950, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center' }}>Scanning card slate…</div>
          </div>
        </div>
      ))}
    </div>
  )
}
