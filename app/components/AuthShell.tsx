'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

type LaneKey = 'NBA' | 'NFL' | 'MLB' | 'NHL'

type Lane = {
  key: LaneKey
  readout: string
  y: number
  // node x positions along the 0..1200 viewBox
  nodes: number[]
  // path describing the lane (gentle waveform across full width)
  path: string
}

const LANES: Lane[] = [
  {
    key: 'NBA',
    readout: 'NBA Rotation signal',
    y: 196,
    nodes: [120, 318, 506, 690, 868, 1062],
    path: 'M-40 196 C 140 150, 300 240, 506 188 S 760 150, 1062 206 L 1260 196',
  },
  {
    key: 'NFL',
    readout: 'NFL Route signal',
    y: 348,
    nodes: [96, 286, 470, 668, 858, 1044],
    path: 'M-40 348 C 160 396, 320 296, 470 360 S 740 410, 1044 318 L 1260 348',
  },
  {
    key: 'MLB',
    readout: 'MLB Lineup signal',
    y: 500,
    nodes: [132, 322, 512, 700, 880, 1070],
    path: 'M-40 500 C 150 456, 330 548, 512 492 S 770 452, 1070 538 L 1260 500',
  },
  {
    key: 'NHL',
    readout: 'NHL Ice signal',
    y: 652,
    nodes: [104, 296, 484, 676, 866, 1052],
    path: 'M-40 652 C 170 700, 320 604, 484 664 S 750 712, 1052 612 L 1260 652',
  },
]

export default function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  const [armed, setArmed] = useState(false)
  const [sweepNonce, setSweepNonce] = useState(0)
  const [activeLane, setActiveLane] = useState<LaneKey>('NBA')
  const sweepTimer = useRef<number | null>(null)

  const arm = useCallback(() => setArmed(true), [])

  const triggerSweep = useCallback(() => {
    setArmed(true)
    setSweepNonce(n => n + 1)
    if (sweepTimer.current) window.clearTimeout(sweepTimer.current)
    // sweep visual lifetime; does not block Clerk in any way
    sweepTimer.current = window.setTimeout(() => {
      sweepTimer.current = null
    }, 1500)
  }, [])

  useEffect(() => {
    return () => {
      if (sweepTimer.current) window.clearTimeout(sweepTimer.current)
    }
  }, [])

  // Cycle the active lane readout subtly for a "live wire" feel.
  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveLane(prev => {
        const idx = LANES.findIndex(l => l.key === prev)
        return LANES[(idx + 1) % LANES.length].key
      })
    }, 4200)
    return () => window.clearInterval(id)
  }, [])

  const active = LANES.find(l => l.key === activeLane) ?? LANES[0]

  return (
    <main
      className={`wire-shell${armed ? ' is-armed' : ''}`}
      data-auth-shell-version="live-intel-wire-20260613"
    >
      <style>{`
        html, body { min-height: 100%; background: #03070d; }
        .wire-shell {
          --cyan: #7df6ff;
          --blue: #2f9dff;
          --mint: #2fffb9;
          --ink: #03070d;
          min-height: 100vh;
          min-height: 100svh;
          min-height: 100dvh;
          position: relative;
          overflow: hidden;
          isolation: isolate;
          color: #f5fbff;
          background:
            radial-gradient(120% 90% at 50% -10%, rgba(47,157,255,0.16), transparent 60%),
            radial-gradient(90% 80% at 85% 110%, rgba(47,255,185,0.10), transparent 55%),
            linear-gradient(160deg, #04080f 0%, #060d16 46%, #02050a 100%);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        }
        .wire-shell *, .wire-shell *::before, .wire-shell *::after { box-sizing: border-box; }

        /* Full-bleed inline-SVG signal field */
        .wire-field {
          position: fixed;
          inset: 0;
          z-index: -2;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .wire-veil {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(80% 60% at 50% 42%, transparent 0%, rgba(3,7,13,0.42) 78%, rgba(3,7,13,0.82) 100%),
            linear-gradient(180deg, rgba(3,7,13,0.30), transparent 28%, transparent 70%, rgba(3,7,13,0.55));
        }

        .lane-line { fill: none; stroke-linecap: round; stroke: rgba(125,246,255,0.14); stroke-width: 1.4; transition: stroke 600ms ease, stroke-width 600ms ease; }
        .is-armed .lane-line { stroke: rgba(125,246,255,0.30); stroke-width: 1.7; }
        .lane-line.is-active { stroke: rgba(125,246,255,0.46); stroke-width: 2; }

        .lane-node {
          fill: rgba(125,246,255,0.30);
          stroke: rgba(125,246,255,0.5);
          stroke-width: 1;
          opacity: 0.5;
          transform-box: fill-box;
          transform-origin: center;
          animation: nodePulse 3.6s ease-in-out infinite;
        }
        .is-armed .lane-node { fill: rgba(125,246,255,0.62); opacity: 0.92; }
        .lane-node.is-active { fill: var(--mint); stroke: rgba(47,255,185,0.85); }

        .scan-edge { opacity: 0; }
        .is-sweeping .scan-edge {
          opacity: 1;
          animation: scanSweep 1.35s cubic-bezier(.22,.61,.36,1) 1 both;
        }

        .wire-content {
          position: relative;
          z-index: 2;
          min-height: 100dvh;
          width: min(1180px, 100%);
          margin: 0 auto;
          display: grid;
          gap: 20px;
          align-content: center;
          padding: max(20px, env(safe-area-inset-top)) 18px max(22px, env(safe-area-inset-bottom));
        }

        .wire-brand { display: flex; justify-content: center; }
        .brand-logo { width: min(70vw, 280px); height: auto; display: block; filter: none; border: 0; border-radius: 0; background: transparent; }

        .wire-grid { display: grid; gap: 22px; align-items: center; }

        .wire-intro { display: grid; gap: 14px; min-width: 0; text-align: center; }
        .eyebrow {
          margin: 0; justify-self: center;
          display: inline-flex; align-items: center; gap: 8px;
          color: var(--cyan); font-size: 10px; font-weight: 950; letter-spacing: 0.30em; text-transform: uppercase;
        }
        .eyebrow .pip { width: 7px; height: 7px; border-radius: 999px; background: var(--mint); box-shadow: 0 0 14px rgba(47,255,185,0.8); animation: livePip 1.9s ease-in-out infinite; }
        .wire-intro h1 {
          margin: 0; justify-self: center; max-width: 14ch;
          font-size: clamp(38px, 9vw, 78px); line-height: 0.92; letter-spacing: -0.045em;
          text-wrap: balance; text-shadow: 0 0 46px rgba(125,246,255,0.14), 0 22px 60px rgba(0,0,0,0.7);
        }
        .wire-sub { margin: 0; justify-self: center; max-width: 52ch; color: rgba(214,242,255,0.74); font-size: clamp(14px, 2.4vw, 16px); line-height: 1.5; }

        .wire-status {
          justify-self: center;
          display: inline-flex; align-items: center; gap: 10px;
          border-radius: 999px;
          border: 1px solid rgba(125,246,255,0.20);
          background: rgba(8,16,26,0.5);
          backdrop-filter: blur(10px);
          padding: 8px 14px;
          font-size: 10px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase;
          color: rgba(214,242,255,0.82);
          transition: border-color 400ms ease, color 400ms ease, box-shadow 400ms ease;
        }
        .is-armed .wire-status { border-color: rgba(47,255,185,0.42); color: #eafff6; box-shadow: 0 0 30px rgba(47,255,185,0.14); }
        .wire-status .dot { width: 8px; height: 8px; border-radius: 999px; background: rgba(125,246,255,0.7); box-shadow: 0 0 14px rgba(125,246,255,0.7); transition: background 400ms ease, box-shadow 400ms ease; }
        .is-armed .wire-status .dot { background: var(--mint); box-shadow: 0 0 18px rgba(47,255,185,0.9); }

        .lane-readout {
          justify-self: center;
          display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
          margin: 0; padding: 0; list-style: none;
        }
        .lane-readout button {
          appearance: none; cursor: pointer;
          display: inline-flex; align-items: center; gap: 7px;
          min-height: 38px; padding: 0 13px;
          border-radius: 999px;
          border: 1px solid rgba(125,246,255,0.16);
          background: rgba(8,16,26,0.55);
          color: rgba(214,242,255,0.7);
          font-size: 10px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase;
          transition: border-color 200ms ease, color 200ms ease, background 200ms ease, box-shadow 200ms ease;
        }
        .lane-readout button .tick { width: 6px; height: 6px; border-radius: 999px; background: rgba(125,246,255,0.4); transition: background 200ms ease, box-shadow 200ms ease; }
        .lane-readout button:hover { color: #f5fbff; border-color: rgba(125,246,255,0.4); }
        .lane-readout button.is-active { color: #eafff6; border-color: rgba(47,255,185,0.5); background: rgba(12,28,30,0.7); box-shadow: 0 0 26px rgba(47,255,185,0.12); }
        .lane-readout button.is-active .tick { background: var(--mint); box-shadow: 0 0 12px rgba(47,255,185,0.85); }

        /* Frosted embedded auth slab */
        .auth-slab {
          position: relative;
          justify-self: center;
          width: min(440px, 100%);
          border-radius: 26px;
          padding: 20px;
          background: linear-gradient(180deg, rgba(10,18,30,0.66), rgba(4,9,16,0.74));
          backdrop-filter: blur(26px) saturate(1.2);
          -webkit-backdrop-filter: blur(26px) saturate(1.2);
          border: 1px solid rgba(125,246,255,0.22);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 30px 80px rgba(0,0,0,0.6);
          transition: border-color 500ms ease, box-shadow 500ms ease;
        }
        /* border glow fade only */
        .auth-slab::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: linear-gradient(135deg, rgba(125,246,255,0.5), rgba(47,157,255,0.2) 50%, rgba(47,255,185,0.4));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          opacity: 0.35;
          pointer-events: none;
          animation: borderFade 5.5s ease-in-out infinite;
        }
        .is-armed .auth-slab { border-color: rgba(125,246,255,0.36); box-shadow: 0 0 0 1px rgba(255,255,255,0.05) inset, 0 30px 90px rgba(0,0,0,0.66), 0 0 60px rgba(47,157,255,0.16); }
        .is-armed .auth-slab::before { opacity: 0.6; }

        .auth-head { display: grid; gap: 7px; text-align: center; margin-bottom: 15px; }
        .auth-head p { margin: 0; }
        .auth-kicker { color: var(--cyan); font-size: 10px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
        .auth-title { margin: 0; color: #f5fbff; font-size: clamp(22px, 5.5vw, 30px); line-height: 1; letter-spacing: -0.03em; }
        .auth-subtitle { color: rgba(214,242,255,0.66); font-size: 13px; line-height: 1.45; }
        .auth-body { position: relative; z-index: 1; display: grid; gap: 12px; }
        .auth-foot { margin: 14px 0 0; display: flex; justify-content: center; gap: 7px; color: rgba(214,242,255,0.42); font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }

        .wire-foot { text-align: center; color: rgba(214,242,255,0.36); font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; padding-bottom: 4px; }

        /* Clerk surface — concise, working */
        .cl-rootBox, .cl-card, .cl-cardBox { width: 100% !important; max-width: 100% !important; }
        .cl-card { padding: 0 !important; background: transparent !important; box-shadow: none !important; }
        .cl-cardBox { box-shadow: none !important; }
        .cl-socialButtonsBlockButton { min-height: 48px !important; border-radius: 14px !important; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025)) !important; border-color: rgba(125,246,255,0.22) !important; }
        .cl-socialButtonsBlockButton:hover { background: rgba(125,246,255,0.1) !important; }
        .cl-formButtonPrimary { min-height: 48px !important; border-radius: 14px !important; background: linear-gradient(135deg, #7df6ff, #2f9dff 58%, #2fffb9) !important; box-shadow: 0 16px 34px rgba(47,157,255,0.24), 0 0 26px rgba(125,246,255,0.18) !important; }
        .cl-formFieldInput { border-radius: 14px !important; min-height: 48px !important; border-color: rgba(125,246,255,0.24) !important; }
        .cl-dividerRow { margin: 12px 0 !important; }
        .cl-footer { margin-top: 12px !important; }

        @keyframes nodePulse { 0%, 100% { opacity: var(--node-base, 0.5); transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.18); } }
        @keyframes livePip { 0%, 100% { opacity: 0.55; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
        @keyframes borderFade { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
        @keyframes scanSweep { from { transform: translateX(-120px); } to { transform: translateX(1320px); } }

        @media (min-width: 920px) {
          .wire-content { padding: 36px 32px; gap: 26px; }
          .wire-grid { grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.78fr); gap: 40px; align-items: center; }
          .wire-intro { text-align: left; }
          .eyebrow, .wire-intro h1, .wire-sub, .wire-status, .lane-readout { justify-self: start; }
          .wire-intro h1 { max-width: 16ch; }
          .lane-readout { justify-content: flex-start; }
          .auth-slab { justify-self: end; padding: 26px; }
          .wire-brand { justify-content: flex-start; }
        }

        @media (max-width: 560px) {
          .wire-content { gap: 11px; align-content: start; padding: calc(env(safe-area-inset-top) + 10px) 13px calc(env(safe-area-inset-bottom) + 12px); }
          .brand-logo { width: min(62vw, 184px); }
          .wire-grid { gap: 9px; }
          .wire-intro { gap: 6px; }
          .eyebrow { font-size: 8.5px; letter-spacing: 0.20em; }
          .wire-intro h1 { font-size: clamp(28px, 8.7vw, 36px); max-width: 13ch; }
          .wire-sub { font-size: 11.5px; line-height: 1.32; max-width: 36ch; }
          .wire-status { padding: 5px 10px; font-size: 8.5px; }
          .lane-readout { display: none; }
          .auth-slab { width: 100%; padding: 13px; border-radius: 22px; }
          .auth-head { gap: 4px; margin-bottom: 8px; }
          .auth-kicker { font-size: 8.5px; }
          .auth-title { font-size: 20px; }
          .auth-subtitle { display: none; }
          .auth-foot { margin-top: 8px; font-size: 8.5px; }
          .auth-body form { gap: 8px !important; }
          .auth-body input { padding: 12px 15px !important; font-size: 15px !important; border-radius: 14px !important; line-height: 1.2 !important; }
          .cl-socialButtonsBlockButton, .cl-formButtonPrimary, .cl-formFieldInput { min-height: 44px !important; }
          .cl-dividerRow { margin: 8px 0 !important; }
          .cl-footer { margin-top: 8px !important; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lane-node, .eyebrow .pip, .auth-slab::before { animation: none !important; }
          .scan-edge { display: none !important; }
          .lane-node { opacity: 0.85; }
          .is-armed .lane-line { stroke: rgba(125,246,255,0.34); }
        }
      `}</style>

      <svg
        className="wire-field"
        viewBox="0 0 1200 820"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter id="wireGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="scanGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(125,246,255,0)" />
            <stop offset="55%" stopColor="rgba(125,246,255,0.35)" />
            <stop offset="100%" stopColor="rgba(47,255,185,0.9)" />
          </linearGradient>
        </defs>

        <g filter="url(#wireGlow)">
          {LANES.map(lane => {
            const isActive = lane.key === activeLane
            return (
              <g key={lane.key}>
                <path className={`lane-line${isActive ? ' is-active' : ''}`} d={lane.path} />
                {lane.nodes.map((nx, i) => (
                  <circle
                    key={`${lane.key}-${nx}`}
                    className={`lane-node${isActive ? ' is-active' : ''}`}
                    cx={nx}
                    cy={lane.y}
                    r={isActive ? 4.4 : 3.4}
                    style={{ animationDelay: `${(nx / 1200) * 1.8 + i * 0.06}s` }}
                  />
                ))}
              </g>
            )
          })}
        </g>

        {/* Scan edge — restart via key=sweepNonce so the animation re-fires */}
        <g key={sweepNonce} className={sweepNonce > 0 ? 'is-sweeping' : ''}>
          <rect className="scan-edge" x="-120" y="0" width="120" height="820" fill="url(#scanGrad)" />
        </g>
      </svg>

      <div className="wire-veil" />

      <div className="wire-content">
        <div className="wire-brand">
          <img
            className="brand-logo"
            src="/brand/ai-athlete-intelligence-logo.png?v=transparent-20260525"
            alt="AI Athlete Intelligence"
          />
        </div>

        <div className="wire-grid">
          <section className="wire-intro" aria-label="Athlete Intelligence platform entrance">
            <p className="eyebrow"><span className="pip" aria-hidden="true" />MEMBERS ONLY</p>
            <h1>Live athlete intelligence.</h1>
            <p className="wire-sub">Signals, matchup reads, and player context — the moment they move.</p>

            <p className="wire-status" aria-live="polite">
              <span className="dot" aria-hidden="true" />
              {armed ? 'WIRE ARMED' : 'SYSTEM LIVE'}
            </p>

            <ul className="lane-readout" aria-label="Live signal lanes">
              {LANES.map(lane => (
                <li key={lane.key}>
                  <button
                    type="button"
                    className={lane.key === activeLane ? 'is-active' : ''}
                    onClick={() => { setActiveLane(lane.key); arm() }}
                    onMouseEnter={arm}
                    aria-pressed={lane.key === activeLane}
                  >
                    <span className="tick" aria-hidden="true" />
                    {lane.readout}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <aside
            className="auth-slab"
            aria-label="Member access"
            onPointerEnter={arm}
            onTouchStart={arm}
            onFocusCapture={triggerSweep}
            onSubmitCapture={triggerSweep}
          >
            <div className="auth-head">
              <p className="auth-kicker">{eyebrow || 'Member access'}</p>
              <h2 className="auth-title">{title || 'Member access'}</h2>
              <p className="auth-subtitle">{subtitle || `${active.readout} is live for members. Sign in to enter the wire.`}</p>
            </div>
            <div className="auth-body">{children}</div>
            <p className="auth-foot"><span aria-hidden="true">◆</span><span>Encrypted · Clerk-secured access</span></p>
          </aside>
        </div>

        <footer className="wire-foot">Athlete Intelligence · Intelligence, not advice.</footer>
      </div>
    </main>
  )
}
