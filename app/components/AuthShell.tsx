'use client'

import { useCallback, useEffect, useState } from 'react'

type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

type StreamTone = 'cyan' | 'blue' | 'mint' | 'amber'
type StreamDirection = 'up' | 'down'

type Stream = {
  left: number
  width: number
  duration: number
  delay: number
  direction: StreamDirection
  tone: StreamTone
  tokens: string[]
}

// Transparent columns of player props mixed with binary, drifting up/down
// behind the foreground terminal. No bordered panels — pure text streams.
const STREAMS: Stream[] = [
  {
    left: 2, width: 116, duration: 30, delay: 0.0, direction: 'up', tone: 'cyan',
    tokens: ['JOKIC 28.5 PTS', '01101001', 'CURRY 4.5 3PM', '10110010', 'TATUM 8.5 REB', '11001011', 'EDWARDS 27.5 PTS', '00111010', 'MAHOMES 287.5 YDS', '10010110', 'JUDGE 1.5 HR', '11010100'],
  },
  {
    left: 12, width: 128, duration: 38, delay: 1.6, direction: 'down', tone: 'mint',
    tokens: ['ALLEN 245.5 YDS', '00101101', 'SGA 30.5 PTS', '11100110', 'CHASE 7.5 REC', '01010011', 'WEMBY 3.5 BLK', '10001110', 'OHTANI 0.5 HR', '11011001', 'BURROW 1.5 TD', '00110101'],
  },
  {
    left: 22, width: 112, duration: 24, delay: 0.7, direction: 'up', tone: 'blue',
    tokens: ['DONCIC 9.5 AST', '01110011', 'HENRY 92.5 YDS', '01101001', 'GIANNIS 11.5 REB', '10110010', 'KELCE 75.5 YDS', '11001011', 'MCDAVID 1.5 PTS', '00111010', 'COLE 7.5 K', '10010110'],
  },
  {
    left: 32, width: 132, duration: 34, delay: 2.3, direction: 'down', tone: 'amber',
    tokens: ['HILL 88.5 YDS', '11010100', 'BOOKER 6.5 AST', '00101101', 'ACUNA 2.5 TB', '11100110', 'BARKLEY 84.5 YDS', '01010011', 'SKENES 8.5 K', '10001110', 'TATUM 8.5 REB', '11011001'],
  },
  {
    left: 44, width: 116, duration: 32, delay: 0.4, direction: 'up', tone: 'cyan',
    tokens: ['JEFFERSON 6.5 REC', '00110101', 'MATTHEWS 3.5 SOG', '01110011', 'JOKIC 28.5 PTS', '01101001', 'BETTS 1.5 H', '10110010', 'CURRY 4.5 3PM', '11001011', 'SGA 30.5 PTS', '00111010'],
  },
  {
    left: 56, width: 124, duration: 26, delay: 1.1, direction: 'down', tone: 'mint',
    tokens: ['MAHOMES 287.5 YDS', '10010110', 'SOTO 2.5 H', '11010100', 'EDWARDS 27.5 PTS', '00101101', 'KUCHEROV 1.5 PTS', '11100110', 'BURROW 1.5 TD', '01010011', 'HENRY 92.5 YDS', '10001110'],
  },
  {
    left: 68, width: 116, duration: 36, delay: 2.0, direction: 'up', tone: 'blue',
    tokens: ['DONCIC 9.5 AST', '11011001', 'OHTANI 0.5 HR', '00110101', 'ALLEN 245.5 YDS', '01110011', 'WEMBY 3.5 BLK', '01101001', 'CHASE 7.5 REC', '10110010', 'COLE 7.5 K', '11001011'],
  },
  {
    left: 78, width: 132, duration: 22, delay: 0.9, direction: 'down', tone: 'cyan',
    tokens: ['JUDGE 1.5 HR', '00111010', 'KELCE 75.5 YDS', '10010110', 'MCDAVID 1.5 PTS', '11010100', 'GIANNIS 11.5 REB', '00101101', 'HILL 88.5 YDS', '11100110', 'ACUNA 2.5 TB', '01010011'],
  },
  {
    left: 88, width: 116, duration: 30, delay: 1.4, direction: 'up', tone: 'amber',
    tokens: ['JOKIC 28.5 PTS', '10001110', 'SKENES 8.5 K', '11011001', 'BARKLEY 84.5 YDS', '00110101', 'MATTHEWS 3.5 SOG', '01110011', 'TATUM 8.5 REB', '01101001', 'SGA 30.5 PTS', '10110010'],
  },
]

const isBinary = (token: string) => /^[01]+$/.test(token)

export default function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  const [armed, setArmed] = useState(false)

  const arm = useCallback(() => setArmed(true), [])

  // Subtle "board is live" heartbeat for the status light; opacity-only.
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setPulse(p => !p), 2600)
    return () => window.clearInterval(id)
  }, [])

  return (
    <main
      className={`war-shell${armed ? ' is-armed' : ''}`}
      data-auth-shell-version="matrix-stream-20260613"
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

        /* ---- Transparent vertical streams: player props + binary ---- */
        .matrix-streams {
          position: fixed;
          inset: 0;
          z-index: -2;
          pointer-events: none;
          overflow: hidden;
        }
        .matrix-col {
          position: absolute;
          top: 0;
          height: 200vh;
          display: flex;
          flex-direction: column;
          gap: 14px;
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-align: center;
          white-space: nowrap;
          opacity: 0.62;
          will-change: transform;
          transition: opacity 700ms ease;
        }
        .is-armed .matrix-col { opacity: 0.78; }
        .matrix-col.up { animation: streamUp linear infinite; }
        .matrix-col.down { animation: streamDown linear infinite; }
        .matrix-col span { display: block; line-height: 1.05; }
        .matrix-col .bin { color: rgba(125,246,255,0.30); font-weight: 600; }
        .matrix-col .prop { color: rgba(214,242,255,0.7); }
        .matrix-col.tone-cyan .prop { color: var(--cyan); text-shadow: 0 0 10px rgba(125,246,255,0.4); }
        .matrix-col.tone-blue .prop { color: var(--blue); text-shadow: 0 0 10px rgba(47,157,255,0.35); }
        .matrix-col.tone-mint .prop { color: var(--mint); text-shadow: 0 0 10px rgba(47,255,185,0.35); }
        .matrix-col.tone-amber .prop { color: var(--amber); text-shadow: 0 0 10px rgba(255,207,107,0.30); }

        @keyframes streamUp {
          from { transform: translateY(0); }
          to { transform: translateY(-50%); }
        }
        @keyframes streamDown {
          from { transform: translateY(-50%); }
          to { transform: translateY(0); }
        }

        /* Soft top/bottom fade for legibility — no center vignette / orb */
        .matrix-veil {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            linear-gradient(180deg,
              rgba(4,6,10,0.78) 0%,
              rgba(4,6,10,0.22) 18%,
              rgba(4,6,10,0.18) 50%,
              rgba(4,6,10,0.28) 78%,
              rgba(4,6,10,0.82) 100%);
        }

        /* ---- Foreground content ---- */
        .war-content {
          position: relative;
          z-index: 2;
          min-height: 100dvh;
          width: min(1140px, 100%);
          margin: 0 auto;
          display: grid;
          gap: 18px;
          align-content: center;
          padding: max(20px, env(safe-area-inset-top)) 18px max(22px, env(safe-area-inset-bottom));
        }

        .war-brand { display: flex; justify-content: center; }
        .brand-logo { width: min(70vw, 268px); height: auto; display: block; filter: none; border: 0; border-radius: 0; background: transparent; }

        .war-grid { display: grid; gap: 20px; align-items: center; }

        .war-intro { display: grid; gap: 13px; min-width: 0; text-align: center; }
        .eyebrow {
          margin: 0; justify-self: center;
          display: inline-flex; align-items: center; gap: 9px;
          color: var(--cyan); font-size: 10px; font-weight: 950; letter-spacing: 0.32em; text-transform: uppercase;
        }
        .eyebrow .lock {
          display: inline-flex; width: 13px; height: 13px;
          color: var(--cyan);
          filter: drop-shadow(0 0 8px rgba(125,246,255,0.55));
        }
        .war-intro h1 {
          margin: 0; justify-self: center; max-width: 15ch;
          font-size: clamp(34px, 8.4vw, 70px); line-height: 0.96; letter-spacing: -0.04em;
          text-wrap: balance; text-shadow: 0 0 44px rgba(125,246,255,0.12), 0 22px 60px rgba(0,0,0,0.7);
        }
        .war-sub { margin: 0; justify-self: center; max-width: 50ch; color: rgba(214,242,255,0.72); font-size: clamp(13.5px, 2.3vw, 16px); line-height: 1.5; }

        .war-status {
          justify-self: center;
          display: inline-flex; align-items: center; gap: 10px;
          border-radius: 999px;
          border: 1px solid rgba(125,246,255,0.20);
          background: rgba(8,14,24,0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 8px 14px;
          font-size: 9.5px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase;
          color: rgba(214,242,255,0.82);
          transition: border-color 400ms ease, color 400ms ease, box-shadow 400ms ease;
        }
        .is-armed .war-status { border-color: rgba(47,255,185,0.4); color: #eafff6; box-shadow: 0 0 26px rgba(47,255,185,0.12); }
        .status-light { width: 8px; height: 8px; border-radius: 999px; background: var(--mint); box-shadow: 0 0 12px rgba(47,255,185,0.8); opacity: 0.7; transition: opacity 600ms ease; }
        .status-light.on { opacity: 1; }

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

        /* ---- Desktop split ---- */
        @media (min-width: 920px) {
          .war-content { padding: 36px 32px; gap: 24px; }
          .war-grid { grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.8fr); gap: 44px; align-items: center; }
          .war-intro { text-align: left; }
          .eyebrow, .war-intro h1, .war-sub, .war-status { justify-self: start; }
          .war-intro h1 { max-width: 16ch; }
          .terminal { justify-self: end; padding: 26px; }
          .war-brand { justify-content: flex-start; }
        }

        /* ---- iPhone-safe (390x844 and smaller): prioritize logo + hero + controls ---- */
        @media (max-width: 560px) {
          .war-content { gap: 10px; align-content: start; padding: calc(env(safe-area-inset-top) + 10px) 13px calc(env(safe-area-inset-bottom) + 12px); }
          .brand-logo { width: min(56vw, 160px); }
          .war-grid { gap: 8px; }
          .war-intro { gap: 5px; }
          .eyebrow { font-size: 8px; letter-spacing: 0.20em; }
          .war-intro h1 { font-size: clamp(24px, 7.6vw, 31px); max-width: 14ch; }
          .war-sub { display: none; }
          .war-status { padding: 4px 9px; font-size: 7.5px; }
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
          /* Quiet the matrix behind the terminal on small screens */
          .matrix-col { font-size: 10px; opacity: 0.48; }
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
          .status-light { opacity: 0.92 !important; }
        }
      `}</style>

      {/* Vertical streams: player props + binary, drifting up/down */}
      <div className="matrix-streams" aria-hidden="true">
        {STREAMS.map((stream, idx) => (
          <div
            key={idx}
            className={`matrix-col ${stream.direction} tone-${stream.tone}`}
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
          <section className="war-intro" aria-label="Athlete Intelligence — secure access">
            <p className="eyebrow">
              <span className="lock" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
                  <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              MEMBERS ONLY
            </p>
            <h1>The intelligence stream is live.</h1>
            <p className="war-sub">
              Verify access to step inside live player props, rotation shifts, and matchup reads as the feed runs.
            </p>

            <p className="war-status" aria-live="polite">
              <span className={`status-light${pulse ? ' on' : ''}`} aria-hidden="true" />
              LIVE PROP STREAM · ENCRYPTED FEED
            </p>
          </section>

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
