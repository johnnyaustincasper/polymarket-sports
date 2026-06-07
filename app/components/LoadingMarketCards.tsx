const GREEN = '#7df6ff'

export default function LoadingMarketCards({
  cols = 3,
  count = 6,
  label = 'Slate',
  detail = 'Loading games, markets, and playable prices…',
}: {
  cols?: number
  count?: number
  label?: string
  detail?: string
}) {
  return (
    <section aria-busy="true" aria-live="polite" aria-label={`Loading ${label}`} style={{ display: 'grid', gap: 14 }}>
      <div role="status" style={{
        borderRadius: 24,
        padding: 1,
        background: 'linear-gradient(135deg, rgba(125,246,255,0.56), rgba(168,240,255,0.18), rgba(255,255,255,0.08))',
        boxShadow: '0 0 34px rgba(125,246,255,0.18), 0 14px 48px rgba(0,0,0,0.42)',
        animation: 'liveBorderPulse 1.35s ease-in-out infinite',
      }}>
        <div style={{
          borderRadius: 23,
          padding: 16,
          background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span aria-hidden="true" style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            border: '2px solid rgba(125,246,255,0.24)',
            borderTopColor: GREEN,
            borderRightColor: 'rgba(125,246,255,0.84)',
            boxShadow: '0 0 16px rgba(125,246,255,0.26)',
            animation: 'aiAnalyzeOrbit 850ms linear infinite',
            flexShrink: 0,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: GREEN, fontSize: 10, fontWeight: 950, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Loading {label}</div>
            <div style={{ color: 'rgba(247,255,240,0.94)', fontSize: 15, fontWeight: 950, letterSpacing: '-0.03em', marginTop: 3 }}>Building your board now…</div>
            <div style={{ color: 'rgba(168,240,255,0.72)', fontSize: 11, lineHeight: 1.4, marginTop: 4 }}>{detail}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{
            height: 250, borderRadius: 24, padding: 1,
            background: 'linear-gradient(135deg, rgba(125,246,255,0.36), rgba(255,255,255,0.10), rgba(125,246,255,0.08))',
            boxShadow: '0 0 34px rgba(125,246,255,0.10), 0 14px 48px rgba(0,0,0,0.42)',
            animation: `scanCardGlow ${1.15 + (i % 3) * 0.18}s ease-in-out infinite`,
            overflow: 'hidden', position: 'relative',
          }}>
            <div style={{ position: 'absolute', inset: 1, borderRadius: 23, background: 'linear-gradient(145deg, rgba(10,16,7,0.96), rgba(3,5,0,0.96))' }} />
            <div style={{ position: 'relative', padding: 18, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div style={{ width: 86, height: 10, borderRadius: 999, background: 'rgba(125,246,255,0.22)' }} />
                  <div style={{ width: 36, height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} />
                </div>
                <div style={{ height: 24, borderRadius: 10, background: 'rgba(247,255,240,0.10)', marginBottom: 10, width: '76%' }} />
                <div style={{ height: 14, borderRadius: 8, background: 'rgba(125,246,255,0.10)', width: '54%' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[0, 1, 2].map(n => <div key={n} style={{ height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(125,246,255,0.10)' }} />)}
              </div>
              <div style={{ color: GREEN, fontSize: 10, fontWeight: 950, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center' }}>Still loading — hang tight…</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
