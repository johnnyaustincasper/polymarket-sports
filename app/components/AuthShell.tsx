'use client'

import { useCallback, useEffect, useState } from 'react'

type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

type BoardRow = {
  // vertical position inside the glass board, as a percentage
  top: number
  // animated value drift on a delay, opacity/transform only
  delay: number
  // relative widths of the row segments
  label: number
  bar: number
  tag: 'up' | 'down' | 'hold'
}

// Blurred live intel board rows sitting BEHIND the glass partition.
const BOARD_ROWS: BoardRow[] = [
  { top: 8, delay: 0.0, label: 58, bar: 72, tag: 'up' },
  { top: 20, delay: 0.7, label: 44, bar: 54, tag: 'hold' },
  { top: 32, delay: 1.3, label: 66, bar: 81, tag: 'down' },
  { top: 44, delay: 0.4, label: 50, bar: 63, tag: 'up' },
  { top: 56, delay: 1.8, label: 60, bar: 47, tag: 'hold' },
  { top: 68, delay: 1.0, label: 40, bar: 76, tag: 'up' },
  { top: 80, delay: 2.2, label: 54, bar: 58, tag: 'down' },
]

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
      data-auth-shell-version="locked-war-room-20260613"
    >
      <style>{`
        html, body { min-height: 100%; background: #04060a; }
        .war-shell {
          --cyan: #7df6ff;
          --blue: #2f9dff;
          --mint: #2fffb9;
          --amber: #ffcf6b;
          --ink: #04060a;
          --glass-line: rgba(125,246,255,0.14);
          min-height: 100vh;
          min-height: 100svh;
          min-height: 100dvh;
          position: relative;
          overflow: hidden;
          isolation: isolate;
          color: #f2f8ff;
          background:
            radial-gradient(130% 90% at 50% -18%, rgba(47,157,255,0.14), transparent 58%),
            radial-gradient(80% 70% at 92% 120%, rgba(47,255,185,0.07), transparent 55%),
            linear-gradient(168deg, #060b14 0%, #05080f 52%, #03050a 100%);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        }
        .war-shell *, .war-shell *::before, .war-shell *::after { box-sizing: border-box; }

        /* ---- Room depth: perspective hallway lines (inline SVG) ---- */
        .room-depth {
          position: fixed;
          inset: 0;
          z-index: -3;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0.55;
        }

        /* ---- The glass partition with the live board behind it ---- */
        .glass-wall {
          position: fixed;
          inset: 0;
          z-index: -2;
          pointer-events: none;
          overflow: hidden;
        }
        /* The live intel board (blurred, behind glass) */
        .board {
          position: absolute;
          top: 8%;
          left: 50%;
          transform: translateX(-50%);
          width: min(1240px, 132%);
          height: 78%;
          opacity: 0.36;
          transition: opacity 700ms ease;
        }
        .is-armed .board { opacity: 0.48; }
        .board-panel {
          position: absolute;
          border-radius: 16px;
          border: 1px solid rgba(125,246,255,0.16);
          background: linear-gradient(180deg, rgba(12,24,40,0.62), rgba(5,11,20,0.5));
          box-shadow: 0 30px 70px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .panel-a { left: 4%; top: 0; width: 40%; height: 100%; }
        .panel-b { left: 47%; top: 4%; width: 30%; height: 88%; }
        .panel-c { left: 79%; top: 10%; width: 17%; height: 74%; }

        .board-row {
          position: absolute;
          left: 7%;
          right: 7%;
          height: 9%;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: rowDrift 6.5s ease-in-out infinite;
        }
        .row-dot { width: 7px; height: 7px; border-radius: 999px; flex: none; }
        .row-dot.up { background: var(--mint); }
        .row-dot.down { background: var(--amber); }
        .row-dot.hold { background: var(--cyan); }
        .row-label { height: 7px; border-radius: 999px; background: rgba(214,242,255,0.32); }
        .row-bar { height: 9px; border-radius: 999px; margin-left: auto; background: linear-gradient(90deg, rgba(125,246,255,0.5), rgba(47,157,255,0.25)); }

        .board-spark {
          position: absolute;
          left: 8%;
          right: 8%;
          bottom: 10%;
          height: 26%;
          opacity: 0.7;
        }

        /* Glass reflection streaks across the partition */
        .glass-sheen {
          position: fixed;
          inset: 0;
          z-index: -2;
          pointer-events: none;
          background:
            linear-gradient(104deg, transparent 0%, rgba(125,246,255,0.05) 18%, transparent 30%, transparent 60%, rgba(255,255,255,0.04) 72%, transparent 84%);
          mix-blend-mode: screen;
        }
        /* Darkening veil so the foreground terminal reads as "outside the room" */
        .room-veil {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background:
            radial-gradient(78% 64% at 50% 46%, transparent 0%, rgba(4,6,10,0.5) 70%, rgba(4,6,10,0.86) 100%),
            linear-gradient(180deg, rgba(4,6,10,0.42), transparent 24%, transparent 66%, rgba(4,6,10,0.6));
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

        /* ---- Animations: opacity / transform only ---- */
        @keyframes rowDrift {
          0%, 100% { transform: translateX(0); opacity: 0.82; }
          50% { transform: translateX(6px); opacity: 1; }
        }
        @keyframes depthGlow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .depth-haze { animation: depthGlow 7s ease-in-out infinite; }

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
          /* Hide decorative board side panels behind glass on small screens */
          .panel-c { display: none; }
          .board { opacity: 0.4; }
        }

        @media (prefers-reduced-motion: reduce) {
          .board-row, .depth-haze { animation: none !important; }
          .board-row { opacity: 0.92; }
          .status-light { opacity: 0.92 !important; }
        }
      `}</style>

      {/* Perspective room depth — vanishing-point hallway lines */}
      <svg
        className="room-depth"
        viewBox="0 0 1200 820"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(125,246,255,0.02)" />
            <stop offset="50%" stopColor="rgba(125,246,255,0.22)" />
            <stop offset="100%" stopColor="rgba(125,246,255,0.02)" />
          </linearGradient>
          <radialGradient id="depthHaze" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="rgba(47,157,255,0.16)" />
            <stop offset="100%" stopColor="rgba(47,157,255,0)" />
          </radialGradient>
        </defs>

        <rect className="depth-haze" x="0" y="0" width="1200" height="820" fill="url(#depthHaze)" />

        {/* Floor + ceiling perspective lines converging to center vanishing point */}
        <g stroke="url(#lineGrad)" strokeWidth="1.1" fill="none">
          {[0, 120, 240, 360, 480].map((x) => (
            <line key={`fl-${x}`} x1={x} y1="820" x2="600" y2="410" />
          ))}
          {[1200, 1080, 960, 840, 720].map((x) => (
            <line key={`fr-${x}`} x1={x} y1="820" x2="600" y2="410" />
          ))}
          {[0, 120, 240, 360, 480].map((x) => (
            <line key={`cl-${x}`} x1={x} y1="0" x2="600" y2="410" />
          ))}
          {[1200, 1080, 960, 840, 720].map((x) => (
            <line key={`cr-${x}`} x1={x} y1="0" x2="600" y2="410" />
          ))}
        </g>
      </svg>

      {/* Live intel board sitting behind the glass partition */}
      <div className="glass-wall" aria-hidden="true">
        <div className="board">
          <div className="board-panel panel-a">
            {BOARD_ROWS.map((row) => (
              <div
                key={`a-${row.top}`}
                className="board-row"
                style={{ top: `${row.top}%`, animationDelay: `${row.delay}s` }}
              >
                <span className={`row-dot ${row.tag}`} />
                <span className="row-label" style={{ width: `${row.label}px` }} />
                <span className="row-bar" style={{ width: `${row.bar}px` }} />
              </div>
            ))}
          </div>

          <div className="board-panel panel-b">
            {BOARD_ROWS.slice(0, 5).map((row) => (
              <div
                key={`b-${row.top}`}
                className="board-row"
                style={{ top: `${row.top + 4}%`, animationDelay: `${row.delay + 0.5}s` }}
              >
                <span className={`row-dot ${row.tag}`} />
                <span className="row-label" style={{ width: `${row.label * 0.7}px` }} />
                <span className="row-bar" style={{ width: `${row.bar * 0.7}px` }} />
              </div>
            ))}
            <svg className="board-spark" viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points="0,60 30,40 60,52 90,24 120,38 150,18 180,34 210,12 240,28"
                fill="none"
                stroke="rgba(47,255,185,0.55)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="board-panel panel-c">
            {BOARD_ROWS.slice(0, 6).map((row) => (
              <div
                key={`c-${row.top}`}
                className="board-row"
                style={{ top: `${row.top + 2}%`, animationDelay: `${row.delay + 1.1}s` }}
              >
                <span className={`row-dot ${row.tag}`} />
                <span className="row-bar" style={{ width: `${row.bar * 0.5}px`, marginLeft: '0' }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-sheen" aria-hidden="true" />
      <div className="room-veil" aria-hidden="true" />

      <div className="war-content">
        <div className="war-brand">
          <img
            className="brand-logo"
            src="/brand/ai-athlete-intelligence-logo.png?v=transparent-20260525"
            alt="AI Athlete Intelligence"
          />
        </div>

        <div className="war-grid">
          <section className="war-intro" aria-label="Athlete Intelligence — secure room entrance">
            <p className="eyebrow">
              <span className="lock" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="100%" height="100%">
                  <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              MEMBERS ONLY
            </p>
            <h1>The intelligence room is locked.</h1>
            <p className="war-sub">
              Verify access to enter live player context, rotation shifts, and matchup reads before the board settles.
            </p>

            <p className="war-status" aria-live="polite">
              <span className={`status-light${pulse ? ' on' : ''}`} aria-hidden="true" />
              SECURE ROOM · LIVE BOARD BEHIND GLASS
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
              <h2 className="term-title">{title || 'Enter the intelligence room'}</h2>
              <p className="term-subtitle">
                {subtitle || 'Verify access to enter the live player-intelligence board.'}
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
