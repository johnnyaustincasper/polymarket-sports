'use client'

import { useCallback, useState } from 'react'

type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

type StreamTone = 'cyan' | 'blue' | 'mint' | 'amber'
type StreamDirection = 'up' | 'down'
type StreamDepth = 'far' | 'mid' | 'near'

type Stream = {
  left: number
  width: number
  duration: number
  delay: number
  direction: StreamDirection
  tone: StreamTone
  depth: StreamDepth
  tokens: string[]
}

// Layered player-prop streams with binary mixed in. The depth setting
// changes scale/opacity/blur/translateZ so the field feels dimensional.
const PROP_TOKENS = [
  'JOKIC 28.5 PTS', 'CURRY 4.5 3PM', 'TATUM 8.5 REB', 'EDWARDS 27.5 PTS',
  'MAHOMES 287.5 YDS', 'JUDGE 1.5 HR', 'ALLEN 245.5 YDS', 'SGA 30.5 PTS',
  'CHASE 7.5 REC', 'WEMBY 3.5 BLK', 'OHTANI 0.5 HR', 'BURROW 1.5 TD',
  'DONCIC 9.5 AST', 'HENRY 92.5 YDS', 'GIANNIS 11.5 REB', 'KELCE 75.5 YDS',
  'MCDAVID 1.5 PTS', 'COLE 7.5 K', 'HILL 88.5 YDS', 'BOOKER 6.5 AST',
  'ACUNA 2.5 TB', 'BARKLEY 84.5 YDS', 'SKENES 8.5 K', 'JEFFERSON 6.5 REC',
  'MATTHEWS 3.5 SOG', 'BETTS 1.5 H', 'SOTO 2.5 H', 'KUCHEROV 1.5 PTS',
]

const BINARY_TOKENS = ['01101001', '10110010', '11001011', '00111010', '10010110', '11010100', '00101101', '11100110']

const makeTokens = (offset: number) => Array.from({ length: 18 }, (_, i) => (
  i % 3 === 2 ? BINARY_TOKENS[(offset + i) % BINARY_TOKENS.length] : PROP_TOKENS[(offset + i * 2) % PROP_TOKENS.length]
))

const STREAMS: Stream[] = [
  { left: -5, width: 132, duration: 42, delay: -8.0, direction: 'up', tone: 'cyan', depth: 'far', tokens: makeTokens(0) },
  { left: 2, width: 124, duration: 28, delay: -2.5, direction: 'down', tone: 'mint', depth: 'near', tokens: makeTokens(3) },
  { left: 9, width: 118, duration: 36, delay: -12.0, direction: 'up', tone: 'blue', depth: 'mid', tokens: makeTokens(6) },
  { left: 16, width: 136, duration: 48, delay: -6.8, direction: 'down', tone: 'cyan', depth: 'far', tokens: makeTokens(9) },
  { left: 23, width: 126, duration: 25, delay: -14.2, direction: 'up', tone: 'amber', depth: 'near', tokens: makeTokens(12) },
  { left: 30, width: 120, duration: 39, delay: -4.4, direction: 'down', tone: 'mint', depth: 'mid', tokens: makeTokens(15) },
  { left: 37, width: 138, duration: 44, delay: -18.0, direction: 'up', tone: 'blue', depth: 'far', tokens: makeTokens(18) },
  { left: 44, width: 128, duration: 27, delay: -9.5, direction: 'down', tone: 'cyan', depth: 'near', tokens: makeTokens(21) },
  { left: 51, width: 118, duration: 33, delay: -1.2, direction: 'up', tone: 'mint', depth: 'mid', tokens: makeTokens(24) },
  { left: 58, width: 140, duration: 50, delay: -20.0, direction: 'down', tone: 'amber', depth: 'far', tokens: makeTokens(27) },
  { left: 65, width: 126, duration: 24, delay: -5.6, direction: 'up', tone: 'cyan', depth: 'near', tokens: makeTokens(30) },
  { left: 72, width: 122, duration: 37, delay: -16.4, direction: 'down', tone: 'blue', depth: 'mid', tokens: makeTokens(33) },
  { left: 79, width: 134, duration: 46, delay: -11.1, direction: 'up', tone: 'mint', depth: 'far', tokens: makeTokens(36) },
  { left: 86, width: 128, duration: 26, delay: -7.7, direction: 'down', tone: 'cyan', depth: 'near', tokens: makeTokens(39) },
  { left: 93, width: 116, duration: 34, delay: -3.3, direction: 'up', tone: 'amber', depth: 'mid', tokens: makeTokens(42) },
  { left: 100, width: 130, duration: 52, delay: -22.0, direction: 'down', tone: 'blue', depth: 'far', tokens: makeTokens(45) },
]

const isBinary = (token: string) => /^[01]+$/.test(token)

export default function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  const [armed, setArmed] = useState(false)

  const arm = useCallback(() => setArmed(true), [])


  return (
    <main
      className={`war-shell${armed ? ' is-armed' : ''}`}
      data-auth-shell-version="matrix-depth-20260613"
    >
      <style>{`
        html, body { min-height: 100%; background: #04060a; }
        .war-shell {
          --cyan: #7df6ff;
          --blue: #2f9dff;
          --mint: #2fffb9;
          --amber: #ffcf6b;
          --ink: #04060a;
          min-height: 100vh;
          min-height: 100svh;
          min-height: 100dvh;
          position: relative;
          overflow: hidden;
          isolation: isolate;
          color: #f2f8ff;
          background:
            linear-gradient(180deg, #060b14 0%, #05080f 52%, #03050a 100%);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        }
        .war-shell *, .war-shell *::before, .war-shell *::after { box-sizing: border-box; }

        /* ---- 3D player-prop matrix field ---- */
        .matrix-streams {
          position: fixed;
          inset: -10vh -8vw;
          z-index: -2;
          pointer-events: none;
          overflow: hidden;
          perspective: 820px;
          perspective-origin: 50% 42%;
          transform-style: preserve-3d;
        }
        .matrix-streams::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, transparent 0%, rgba(125,246,255,0.04) 48%, transparent 100%),
            radial-gradient(90% 60% at 50% 40%, rgba(47,157,255,0.10), transparent 62%);
          opacity: 0.85;
        }
        .matrix-col {
          position: absolute;
          top: -54vh;
          height: 280vh;
          display: flex;
          flex-direction: column;
          gap: var(--gap, 13px);
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: var(--size, 11px);
          font-weight: 760;
          letter-spacing: 0.055em;
          text-align: center;
          white-space: nowrap;
          opacity: var(--alpha, 0.62);
          filter: blur(var(--blur, 0px));
          will-change: transform, opacity;
          transform-style: preserve-3d;
          transition: opacity 700ms ease;
        }
        .is-armed .matrix-col { opacity: calc(var(--alpha, 0.62) + 0.08); }
        .matrix-col.up { animation: streamUp linear infinite; }
        .matrix-col.down { animation: streamDown linear infinite; }
        .matrix-col span { display: block; line-height: 1.04; }
        .matrix-col .bin { color: rgba(125,246,255,0.24); font-weight: 620; }
        .matrix-col .prop { color: rgba(214,242,255,0.72); }
        .matrix-col.depth-far { --z: -360px; --scale: 0.58; --alpha: 0.32; --blur: 0.75px; --size: 8px; --gap: 9px; }
        .matrix-col.depth-mid { --z: -80px; --scale: 0.92; --alpha: 0.58; --blur: 0.12px; --size: 11px; --gap: 12px; }
        .matrix-col.depth-near { --z: 140px; --scale: 1.28; --alpha: 0.82; --blur: 0px; --size: 13px; --gap: 15px; }
        .matrix-col.depth-far .prop { opacity: 0.68; }
        .matrix-col.depth-mid .prop { opacity: 0.86; }
        .matrix-col.depth-near .prop { opacity: 1; font-weight: 860; }
        .matrix-col.tone-cyan .prop { color: var(--cyan); text-shadow: 0 0 10px rgba(125,246,255,0.42); }
        .matrix-col.tone-blue .prop { color: var(--blue); text-shadow: 0 0 10px rgba(47,157,255,0.36); }
        .matrix-col.tone-mint .prop { color: var(--mint); text-shadow: 0 0 10px rgba(47,255,185,0.34); }
        .matrix-col.tone-amber .prop { color: var(--amber); text-shadow: 0 0 10px rgba(255,207,107,0.28); }

        @keyframes streamUp {
          from { transform: translate3d(0, 0, var(--z, 0px)) scale(var(--scale, 1)) rotateX(18deg) rotateZ(-2deg); }
          to { transform: translate3d(0, -50%, var(--z, 0px)) scale(var(--scale, 1)) rotateX(18deg) rotateZ(-2deg); }
        }
        @keyframes streamDown {
          from { transform: translate3d(0, -50%, var(--z, 0px)) scale(var(--scale, 1)) rotateX(18deg) rotateZ(2deg); }
          to { transform: translate3d(0, 0, var(--z, 0px)) scale(var(--scale, 1)) rotateX(18deg) rotateZ(2deg); }
        }

        /* Legibility veil: keeps auth crisp while preserving the 3D field */
        .matrix-veil {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            linear-gradient(180deg,
              rgba(4,6,10,0.50) 0%,
              rgba(4,6,10,0.10) 18%,
              rgba(4,6,10,0.12) 50%,
              rgba(4,6,10,0.20) 78%,
              rgba(4,6,10,0.68) 100%);
        }

        /* ---- Foreground content ---- */
        .war-content {
          position: relative;
          z-index: 2;
          min-height: 100dvh;
          width: min(760px, 100%);
          margin: 0 auto;
          display: grid;
          gap: 18px;
          align-content: center;
          padding: max(20px, env(safe-area-inset-top)) 18px max(22px, env(safe-area-inset-bottom));
        }

        .war-brand { display: flex; justify-content: center; }
        .brand-logo { width: min(70vw, 268px); height: auto; display: block; filter: none; border: 0; border-radius: 0; background: transparent; }

        .war-grid { display: grid; gap: 20px; align-items: center; justify-items: center; }

        /* ---- The secure access terminal (foreground) ---- */
        .terminal {
          position: relative;
          justify-self: center;
          width: min(444px, 100%);
          border-radius: 24px;
          padding: 22px;
          background: linear-gradient(180deg, rgba(11,20,34,0.82), rgba(5,10,18,0.88));
          backdrop-filter: blur(22px) saturate(1.18);
          -webkit-backdrop-filter: blur(22px) saturate(1.18);
          border: 1px solid rgba(125,246,255,0.24);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 34px 90px rgba(0,0,0,0.62);
          transition: border-color 450ms ease, box-shadow 450ms ease, transform 450ms ease;
        }
        .is-armed .terminal {
          border-color: rgba(125,246,255,0.4);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.06) inset,
            0 34px 100px rgba(0,0,0,0.66),
            0 0 56px rgba(47,157,255,0.16);
        }

        /* Terminal header bar: status lights + clearance label */
        .terminal-bar {
          display: flex; align-items: center; gap: 8px;
          padding-bottom: 12px; margin-bottom: 14px;
          border-bottom: 1px solid rgba(125,246,255,0.12);
        }
        .bar-lights { display: inline-flex; gap: 5px; }
        .bar-lights i { width: 7px; height: 7px; border-radius: 999px; display: inline-block; opacity: 0.85; }
        .bar-lights i:nth-child(1) { background: var(--mint); }
        .bar-lights i:nth-child(2) { background: var(--cyan); }
        .bar-lights i:nth-child(3) { background: rgba(214,242,255,0.4); }
        .bar-label { margin-left: auto; font-size: 9px; font-weight: 900; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(214,242,255,0.5); display: inline-flex; align-items: center; gap: 6px; }
        .bar-label .lock { width: 11px; height: 11px; color: var(--cyan); }

        .terminal-head { display: grid; gap: 6px; text-align: center; margin-bottom: 14px; }
        .terminal-head p { margin: 0; }
        .term-kicker { color: var(--cyan); font-size: 9.5px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
        .term-title { margin: 0; color: #f2f8ff; font-size: clamp(21px, 5.2vw, 28px); line-height: 1.02; letter-spacing: -0.03em; }
        .term-subtitle { color: rgba(214,242,255,0.64); font-size: 12.5px; line-height: 1.45; }

        .terminal-body { position: relative; z-index: 1; display: grid; gap: 12px; }
        .terminal-foot { margin: 14px 0 0; display: flex; justify-content: center; align-items: center; gap: 7px; color: rgba(214,242,255,0.42); font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
        .terminal-foot .lock { width: 11px; height: 11px; color: rgba(214,242,255,0.5); }

        .war-foot { text-align: center; color: rgba(214,242,255,0.36); font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; padding-bottom: 4px; }

        /* ---- Clerk surface — concise, working ---- */
        .cl-rootBox, .cl-card, .cl-cardBox { width: 100% !important; max-width: 100% !important; }
        .cl-card { padding: 0 !important; background: transparent !important; box-shadow: none !important; }
        .cl-cardBox { box-shadow: none !important; }
        .cl-socialButtonsBlockButton { min-height: 48px !important; border-radius: 13px !important; background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.025)) !important; border-color: rgba(125,246,255,0.22) !important; }
        .cl-socialButtonsBlockButton:hover { background: rgba(125,246,255,0.1) !important; }
        .cl-formButtonPrimary { min-height: 48px !important; border-radius: 13px !important; background: linear-gradient(135deg, #7df6ff, #2f9dff 58%, #2fffb9) !important; box-shadow: 0 16px 34px rgba(47,157,255,0.24), 0 0 24px rgba(125,246,255,0.18) !important; }
        .cl-formFieldInput { border-radius: 13px !important; min-height: 48px !important; border-color: rgba(125,246,255,0.24) !important; }
        .cl-dividerRow { margin: 12px 0 !important; }
        .cl-footer { margin-top: 12px !important; }

        /* ---- Desktop ---- */
        @media (min-width: 920px) {
          .war-content { padding: 36px 32px; gap: 24px; }
          .terminal { padding: 26px; }
        }

        /* ---- iPhone-safe (390x844 and smaller): prioritize logo + auth controls ---- */
        @media (max-width: 560px) {
          .war-content { gap: 9px; align-content: start; padding: calc(env(safe-area-inset-top) + 10px) 13px calc(env(safe-area-inset-bottom) + 12px); }
          .brand-logo { width: min(54vw, 154px); }
          .war-grid { gap: 8px; }
          .terminal { width: 100%; padding: 12px; border-radius: 20px; }
          .terminal-bar { padding-bottom: 7px; margin-bottom: 8px; }
          .terminal-head { gap: 3px; margin-bottom: 7px; }
          .term-kicker { font-size: 8.5px; }
          .term-title { font-size: 19px; }
          .term-subtitle { display: none; }
          .terminal-foot { margin-top: 9px; font-size: 8.5px; }
          .terminal-body form { gap: 8px !important; }
          .terminal-body input { padding: 12px 15px !important; font-size: 16px !important; border-radius: 13px !important; line-height: 1.2 !important; }
          .cl-socialButtonsBlockButton, .cl-formButtonPrimary, .cl-formFieldInput { min-height: 46px !important; }
          .cl-dividerRow { margin: 8px 0 !important; }
          .cl-footer { margin-top: 8px !important; }
          /* Keep the field dense but readable behind the terminal on small screens */
          .matrix-streams { inset: -8vh -20vw; perspective: 640px; }
          .matrix-col.depth-far { --alpha: 0.36; --size: 7.5px; --scale: 0.54; }
          .matrix-col.depth-mid { --alpha: 0.66; --size: 10.5px; --scale: 0.94; }
          .matrix-col.depth-near { --alpha: 0.88; --size: 12.5px; --scale: 1.34; }
          .matrix-veil {
            background:
              linear-gradient(180deg,
                rgba(4,6,10,0.88) 0%,
                rgba(4,6,10,0.42) 16%,
                rgba(4,6,10,0.36) 50%,
                rgba(4,6,10,0.46) 80%,
                rgba(4,6,10,0.9) 100%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .matrix-col { animation: none !important; opacity: 0.42; }
        }
      `}</style>

      {/* Layered 3D streams: player props + binary, drifting up/down */}
      <div className="matrix-streams" aria-hidden="true">
        {STREAMS.map((stream, idx) => (
          <div
            key={idx}
            className={`matrix-col ${stream.direction} tone-${stream.tone} depth-${stream.depth}`}
            style={{
              left: `${stream.left}%`,
              width: `${stream.width}px`,
              animationDuration: `${stream.duration}s`,
              animationDelay: `${stream.delay}s`,
            }}
          >
            {stream.tokens.map((token, i) => (
              <span key={`a-${i}`} className={isBinary(token) ? 'bin' : 'prop'}>
                {token}
              </span>
            ))}
            {stream.tokens.map((token, i) => (
              <span key={`b-${i}`} className={isBinary(token) ? 'bin' : 'prop'}>
                {token}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="matrix-veil" aria-hidden="true" />

      <div className="war-content">
        <div className="war-brand">
          <img
            className="brand-logo"
            src="/brand/ai-athlete-intelligence-logo.png?v=transparent-20260525"
            alt="AI Athlete Intelligence"
          />
        </div>

        <div className="war-grid">
          <aside
            className="terminal"
            aria-label="Secure access terminal"
            onPointerEnter={arm}
            onTouchStart={arm}
            onFocusCapture={arm}
          >
            <div className="terminal-bar">
              <span className="bar-lights" aria-hidden="true">
                <i /><i /><i />
              </span>
              <span className="bar-label">
                <span className="lock" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
                    <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                Access terminal
              </span>
            </div>

            <div className="terminal-head">
              <p className="term-kicker">{eyebrow || 'Verify access'}</p>
              <h2 className="term-title">{title || 'Enter the intelligence stream'}</h2>
              <p className="term-subtitle">
                {subtitle || 'Verify access to enter the live player-intelligence feed.'}
              </p>
            </div>

            <div className="terminal-body">{children}</div>

            <p className="terminal-foot">
              <span className="lock" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
                  <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span>Encrypted · Clerk-secured clearance</span>
            </p>
          </aside>
        </div>

        <footer className="war-foot">Athlete Intelligence · Intelligence, not advice.</footer>
      </div>
    </main>
  )
}
