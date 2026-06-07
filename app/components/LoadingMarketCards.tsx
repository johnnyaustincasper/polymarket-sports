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
  const phases = [
    'Fetching slate',
    'Matching markets',
    'Building board',
  ]

  return (
    <section aria-busy="true" aria-live="polite" aria-label={`Loading ${label}`} style={{ display: 'grid', gap: 14 }}>
      <div role="status" style={{
        borderRadius: 24,
        padding: 1,
        background: 'linear-gradient(135deg, rgba(125,246,255,0.72), rgba(168,240,255,0.28), rgba(255,255,255,0.10))',
        boxShadow: '0 0 44px rgba(125,246,255,0.28), 0 14px 48px rgba(0,0,0,0.42)',
        animation: 'liveBorderPulse 1.05s ease-in-out infinite',
      }}>
        <div style={{
          borderRadius: 23,
          padding: 16,
          background: 'linear-gradient(145deg, rgba(8,13,6,0.98), rgba(2,5,1,0.97))',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'grid',
          gap: 13,
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, transparent 0%, rgba(125,246,255,0.08) 42%, rgba(184,251,255,0.14) 50%, rgba(125,246,255,0.08) 58%, transparent 100%)', animation: 'aiAnalyzeSweep 1.45s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13 }}>
            <span aria-hidden="true" style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: '3px solid rgba(125,246,255,0.20)',
              borderTopColor: GREEN,
              borderRightColor: 'rgba(184,251,255,0.94)',
              boxShadow: '0 0 20px rgba(125,246,255,0.34)',
              animation: 'aiAnalyzeOrbit 720ms linear infinite',
              flexShrink: 0,
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: GREEN, fontSize: 11, fontWeight: 950, letterSpacing: '0.20em', textTransform: 'uppercase' }}>Loading {label}</div>
              <div style={{ color: 'rgba(247,255,240,0.98)', fontSize: 19, fontWeight: 950, letterSpacing: '-0.04em', marginTop: 3 }}>Board is still loading…</div>
              <div style={{ color: 'rgba(168,240,255,0.78)', fontSize: 11, lineHeight: 1.4, marginTop: 4 }}>{detail}</div>
            </div>
          </div>
          <div style={{ position: 'relative', height: 9, borderRadius: 999, overflow: 'hidden', background: 'rgba(125,246,255,0.09)', border: '1px solid rgba(125,246,255,0.20)' }}>
            <div aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '58%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(125,246,255,0.18), rgba(125,246,255,0.92), rgba(184,251,255,0.68))', boxShadow: '0 0 18px rgba(125,246,255,0.46)', animation: 'aiAnalyzeSweep 1.2s ease-in-out infinite' }} />
          </div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))`, gap: 7 }}>
            {phases.map((phase, i) => (
              <div key={phase} style={{ borderRadius: 999, padding: '7px 8px', background: 'rgba(125,246,255,0.075)', border: '1px solid rgba(125,246,255,0.20)', color: i === 2 ? GREEN : 'rgba(247,255,240,0.88)', fontSize: 9, fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center', animation: 'aiAnalyzePulse 1.35s ease-in-out infinite', animationDelay: `${i * 140}ms` }}>
                {phase}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{
            height: 250, borderRadius: 24, padding: 1,
            background: 'linear-gradient(135deg, rgba(125,246,255,0.44), rgba(255,255,255,0.12), rgba(125,246,255,0.12))',
            boxShadow: '0 0 34px rgba(125,246,255,0.14), 0 14px 48px rgba(0,0,0,0.42)',
            animation: `scanCardGlow ${1.05 + (i % 3) * 0.16}s ease-in-out infinite`,
            overflow: 'hidden', position: 'relative',
          }}>
            <div style={{ position: 'absolute', inset: 1, borderRadius: 23, background: 'linear-gradient(145deg, rgba(10,16,7,0.96), rgba(3,5,0,0.96))' }} />
            <div aria-hidden="true" style={{ position: 'absolute', inset: 1, borderRadius: 23, background: 'linear-gradient(100deg, transparent 0%, rgba(125,246,255,0.06) 42%, rgba(184,251,255,0.16) 50%, rgba(125,246,255,0.06) 58%, transparent 100%)', animation: `aiAnalyzeSweep ${1.4 + (i % 2) * 0.2}s ease-in-out infinite`, animationDelay: `${i * 90}ms` }} />
            <div style={{ position: 'relative', padding: 18, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div style={{ width: 86, height: 10, borderRadius: 999, background: 'rgba(125,246,255,0.26)' }} />
                  <div style={{ width: 36, height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.10)' }} />
                </div>
                <div style={{ height: 24, borderRadius: 10, background: 'rgba(247,255,240,0.12)', marginBottom: 10, width: '76%' }} />
                <div style={{ height: 14, borderRadius: 8, background: 'rgba(125,246,255,0.14)', width: '54%' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[0, 1, 2].map(n => <div key={n} style={{ height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(125,246,255,0.13)' }} />)}
              </div>
              <div style={{ color: GREEN, fontSize: 10, fontWeight: 950, letterSpacing: '0.18em', textTransform: 'uppercase', textAlign: 'center' }}>Still loading — hang tight…</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
