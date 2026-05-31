import { slateMainFeatureAnimation } from '../lib/mobile-dock'

export default function SlateMainFeatureAnimationFrame() {
  return (
    <>
      <style>{`
        @keyframes ${slateMainFeatureAnimation.ringAnimationName} {
          0%, 100% { opacity: 0.58; transform: scale(0.96); box-shadow: 0 0 0 0 rgba(125,246,255,0.34), 0 0 18px rgba(125,246,255,0.24); }
          50% { opacity: 1; transform: scale(1.04); box-shadow: 0 0 0 5px rgba(125,246,255,0.10), 0 0 30px rgba(125,246,255,0.48); }
        }
        @keyframes ${slateMainFeatureAnimation.shimmerAnimationName} {
          0% { transform: translateX(-145%) rotate(18deg); opacity: 0; }
          28% { opacity: 0.72; }
          58%, 100% { transform: translateX(145%) rotate(18deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-slate-main-feature="true"] [data-slate-ring="true"],
          [data-slate-main-feature="true"] [data-slate-shimmer="true"] {
            animation: none !important;
          }
        }
      `}</style>
      <span aria-hidden="true" data-slate-ring="true" style={{
        position: 'absolute',
        inset: -3,
        borderRadius: 25,
        border: '1px solid rgba(125,246,255,0.78)',
        pointerEvents: 'none',
        animation: `${slateMainFeatureAnimation.ringAnimationName} 2.4s ease-in-out infinite`,
      }} />
      <span aria-hidden="true" style={{ position: 'absolute', inset: 2, borderRadius: 21, overflow: 'hidden', pointerEvents: 'none' }}>
        <span data-slate-shimmer="true" style={{
          position: 'absolute',
          top: -12,
          bottom: -12,
          left: '42%',
          width: 18,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.38), rgba(125,246,255,0.26), transparent)',
          filter: 'blur(0.5px)',
          animation: `${slateMainFeatureAnimation.shimmerAnimationName} 3.2s ease-in-out infinite`,
        }} />
      </span>
    </>
  )
}
