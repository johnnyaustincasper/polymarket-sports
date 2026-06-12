'use client'

import { useEffect, useRef, useState } from 'react'

type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

type SportKey = 'NBA' | 'NFL' | 'MLB' | 'NHL'

type IntelCard = {
  id: string
  title: string
  body: string
  detail: string
  points: string
}

type SportIntel = {
  label: SportKey
  signals: string[]
  cards: IntelCard[]
}

const SPORTS: Record<SportKey, SportIntel> = {
  NBA: {
    label: 'NBA',
    signals: [
      'ROTATION · Starter minutes pressure flagged before public consensus',
      'USAGE · Ball-handler role change elevates assist window',
      'MATCHUP · Pace differential points to cleaner counting-stat context',
      'STATUS · Late injury context moves projection priority',
    ],
    cards: [
      { id: 'signals', title: 'Player Signals', body: 'See the player, role, matchup, and recent form in one clean read.', detail: 'Built to make the best player context obvious before you open the full board.', points: '4,18 16,12 28,15 40,7 52,10 64,5 76,8' },
      { id: 'rotation', title: 'Rotation Intel', body: 'Track minutes, rest, injury context, and lineup pressure without noise.', detail: 'Useful when one scratch or minutes bump changes the whole slate.', points: '4,16 16,14 28,11 40,13 52,8 64,6 76,4' },
      { id: 'context', title: 'Edge Context', body: 'Translate movement, matchup, and player trend into plain-language decisions.', detail: 'No cluttered market terminal — just what matters and what can kill it.', points: '4,20 16,17 28,18 40,12 52,14 64,9 76,6' },
    ],
  },
  NFL: {
    label: 'NFL',
    signals: [
      'ROLE · Route-share shift detected in last two games',
      'MATCHUP · Coverage shell opens underneath volume window',
      'STATUS · Practice report changes receiving tree priority',
      'WEATHER · Stadium conditions checked against pass/run profile',
    ],
    cards: [
      { id: 'volume', title: 'Usage Reads', body: 'Separate real role changes from noisy box-score spikes.', detail: 'Snap share, route share, targets, and matchup context stay connected.', points: '4,19 16,15 28,17 40,13 52,9 64,10 76,6' },
      { id: 'matchup', title: 'Matchup Map', body: 'Surface player-specific paths through defense and game script.', detail: 'Built for the read underneath the headline injury report.', points: '4,18 16,19 28,14 40,10 52,12 64,7 76,9' },
      { id: 'discipline', title: 'Line Discipline', body: 'Keep the context tied to playable numbers and risk checks.', detail: 'If the player context changes, the app tells you why it matters.', points: '4,21 16,16 28,13 40,15 52,11 64,8 76,5' },
    ],
  },
  MLB: {
    label: 'MLB',
    signals: [
      'LINEUP · Batting-order slot confirmed against pitcher hand',
      'FORM · Contact quality trend separates smoke from slump',
      'PARK · Run environment context checked before first pitch',
      'BULLPEN · Late-inning exposure flagged for hitter profile',
    ],
    cards: [
      { id: 'lineup', title: 'Lineup Intel', body: 'Know slot, handedness, park, and weather before the first swing.', detail: 'A cleaner way to understand which player context is real today.', points: '4,17 16,13 28,15 40,11 52,7 64,8 76,4' },
      { id: 'form', title: 'Form Window', body: 'Recent contact, opportunity, and matchup notes without stat-sheet overload.', detail: 'Fast enough for daily slates, calm enough for normal people.', points: '4,20 16,18 28,14 40,16 52,12 64,7 76,9' },
      { id: 'risk', title: 'Risk Checks', body: 'Surface what could break the read before it becomes regret.', detail: 'Weather, rest, bullpen, and role changes stay in the same frame.', points: '4,21 16,16 28,19 40,12 52,10 64,8 76,6' },
    ],
  },
  NHL: {
    label: 'NHL',
    signals: [
      'LINE · Top-six deployment shift logged against matchup pair',
      'ICE · Power-play time pushes shot-volume context higher',
      'GOALIE · Confirmed starter changes scoring environment',
      'PACE · Team shot profile points to cleaner opportunity window',
    ],
    cards: [
      { id: 'line', title: 'Line Movement', body: 'Track deployment, ice time, and special-teams context together.', detail: 'Line and goalie context should be visible before player reads.', points: '4,19 16,17 28,12 40,14 52,9 64,6 76,8' },
      { id: 'shots', title: 'Shot Context', body: 'Separate volume, role, matchup, and recent pace into one read.', detail: 'Designed for the player-specific context that box scores miss.', points: '4,22 16,18 28,15 40,10 52,11 64,7 76,4' },
      { id: 'status', title: 'Status Watch', body: 'Goalie confirmations, scratches, and line changes stay near the decision.', detail: 'The product reads the slate like a live pregame room.', points: '4,16 16,13 28,15 40,9 52,12 64,8 76,5' },
    ],
  },
}

const sportKeys = Object.keys(SPORTS) as SportKey[]

export default function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  const [activeSport, setActiveSport] = useState<SportKey>('NBA')
  const [tickerIndex, setTickerIndex] = useState(0)
  const [expandedCard, setExpandedCard] = useState<string>('signals')
  const glowRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)

  const active = SPORTS[activeSport]
  const tickerRows = [0, 1, 2].map(offset => active.signals[(tickerIndex + offset) % active.signals.length])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTickerIndex(index => index + 1)
    }, 5200)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    setTickerIndex(0)
    setExpandedCard(active.cards[0].id)
  }, [activeSport, active.cards])

  useEffect(() => {
    const canHover = window.matchMedia('(hover: hover)').matches
    if (!canHover) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      if (frameRef.current) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        glowRef.current?.style.setProperty('--mx', `${event.clientX}px`)
        glowRef.current?.style.setProperty('--my', `${event.clientY}px`)
      })
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <main className="auth-shell" data-auth-shell-version="film-room-landing-20260612">
      <style>{`
        html, body { min-height: 100%; background: #030609; }
        .auth-shell {
          min-height: 100vh;
          min-height: 100svh;
          min-height: 100dvh;
          position: relative;
          overflow: hidden;
          isolation: isolate;
          color: #f7fff0;
          background:
            radial-gradient(circle at 18% 10%, rgba(34,211,238,0.13), transparent 30%),
            radial-gradient(circle at 82% 22%, rgba(47,255,185,0.10), transparent 28%),
            radial-gradient(circle at 70% 90%, rgba(38,170,255,0.09), transparent 34%),
            linear-gradient(145deg, #030609 0%, #071018 48%, #000203 100%);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        }
        .auth-shell *, .auth-shell *::before, .auth-shell *::after { box-sizing: border-box; }
        .field-grid,
        .radar-glow,
        .grain,
        .scanline {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }
        .field-grid {
          z-index: -4;
          opacity: 0.72;
          background-image:
            linear-gradient(rgba(125,246,255,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(125,246,255,0.045) 1px, transparent 1px),
            linear-gradient(rgba(125,246,255,0.085) 1px, transparent 1px),
            linear-gradient(90deg, rgba(125,246,255,0.075) 1px, transparent 1px);
          background-size: 24px 24px, 24px 24px, 96px 96px, 96px 96px;
          mask-image: radial-gradient(circle at 50% 45%, black 0%, transparent 78%);
          animation: fieldDrift 62s linear infinite;
        }
        .radar-glow {
          --mx: 74vw;
          --my: 32vh;
          z-index: -3;
          background: radial-gradient(circle 620px at var(--mx) var(--my), rgba(34,211,238,0.15), rgba(47,255,185,0.055) 32%, transparent 64%);
          opacity: 0.92;
          transition: opacity 280ms ease;
        }
        .grain {
          z-index: -2;
          opacity: 0.22;
          background-image:
            radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18) 0 1px, transparent 1px),
            radial-gradient(circle at 70% 80%, rgba(125,246,255,0.12) 0 1px, transparent 1px);
          background-size: 80px 80px, 130px 130px;
        }
        .scanline {
          z-index: 5;
          opacity: 0.12;
          mix-blend-mode: screen;
          background: repeating-linear-gradient(180deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 5px);
        }
        .auth-wrap {
          position: relative;
          z-index: 2;
          width: min(1180px, 100%);
          margin: 0 auto;
          min-height: 100dvh;
          display: grid;
          gap: 22px;
          padding: max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom));
        }
        .brand-row {
          display: flex;
          align-items: center;
          justify-content: center;
          padding-top: 2px;
        }
        .brand-logo {
          width: min(72vw, 292px);
          height: auto;
          object-fit: contain;
          display: block;
          filter: none;
          border: 0;
          border-radius: 0;
          background: transparent;
        }
        .layout {
          display: grid;
          gap: 18px;
          align-items: center;
        }
        .hero {
          display: grid;
          gap: 16px;
          min-width: 0;
        }
        .eyebrow {
          margin: 0;
          color: #7df6ff;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.24em;
          text-transform: uppercase;
        }
        .hero h1 {
          margin: 0;
          max-width: 760px;
          font-size: clamp(42px, 12vw, 104px);
          line-height: 0.82;
          letter-spacing: -0.085em;
          text-transform: uppercase;
          text-wrap: balance;
          text-shadow: 0 0 42px rgba(125,246,255,0.12), 0 28px 70px rgba(0,0,0,0.72);
        }
        .hero-copy {
          margin: 0;
          max-width: 620px;
          color: rgba(226,255,204,0.76);
          font-size: clamp(14px, 2.4vw, 17px);
          line-height: 1.5;
        }
        .sport-lanes {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 2px;
        }
        .sport-lane {
          min-height: 42px;
          padding: 0 15px;
          border-radius: 999px;
          border: 1px solid rgba(125,246,255,0.16);
          background: rgba(8,18,24,0.72);
          color: rgba(247,255,240,0.70);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.16em;
          cursor: pointer;
          transition: border-color 180ms ease, color 180ms ease, background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
        }
        .sport-lane:hover,
        .sport-lane.is-active {
          color: #f7fff0;
          border-color: rgba(125,246,255,0.52);
          background: rgba(16,42,52,0.74);
          box-shadow: 0 0 28px rgba(125,246,255,0.10);
          transform: translateY(-1px);
        }
        .auth-panel {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          border: 1px solid rgba(125,246,255,0.24);
          background: linear-gradient(180deg, rgba(10,17,24,0.88), rgba(2,6,9,0.96));
          box-shadow: 0 0 0 1px rgba(255,255,255,0.045) inset, 0 28px 90px rgba(0,0,0,0.72), 0 0 54px rgba(125,246,255,0.10);
          backdrop-filter: blur(28px) saturate(1.16);
          padding: 17px;
          animation: panelGlow 4.8s ease-in-out infinite;
        }
        .auth-panel::before {
          content: '';
          position: absolute;
          left: 18px;
          right: 18px;
          top: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(125,246,255,0.86), transparent);
        }
        .auth-head {
          display: grid;
          gap: 7px;
          text-align: center;
          margin-bottom: 15px;
        }
        .auth-head p { margin: 0; }
        .auth-kicker {
          color: #7df6ff;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }
        .auth-title {
          margin: 0;
          color: #f7fff0;
          font-size: clamp(28px, 7vw, 42px);
          line-height: 0.92;
          letter-spacing: -0.065em;
          text-transform: uppercase;
        }
        .auth-subtitle {
          color: rgba(226,255,204,0.68);
          font-size: 13px;
          line-height: 1.42;
        }
        .auth-body { position: relative; z-index: 1; display: grid; gap: 13px; }
        .auth-foot {
          margin: 12px 0 0;
          display: flex;
          justify-content: center;
          gap: 7px;
          color: rgba(226,255,204,0.44);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.10em;
          text-transform: uppercase;
        }
        .film-room {
          display: grid;
          gap: 12px;
        }
        .ticker {
          border-radius: 24px;
          border: 1px solid rgba(125,246,255,0.15);
          background: rgba(3,8,12,0.72);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset;
          padding: 12px;
        }
        .ticker-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 9px;
          color: rgba(125,246,255,0.82);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #2fffb9;
          box-shadow: 0 0 18px rgba(47,255,185,0.75);
          animation: livePulse 1.8s ease-in-out infinite;
        }
        .ticker-list {
          display: grid;
          gap: 7px;
        }
        .ticker-row {
          display: grid;
          grid-template-columns: 18px 1fr;
          align-items: start;
          gap: 8px;
          min-height: 32px;
          color: rgba(247,255,240,0.82);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          font-size: 11px;
          line-height: 1.35;
          animation: rowIn 520ms ease both;
        }
        .ticker-row:nth-child(2) { animation-delay: 80ms; }
        .ticker-row:nth-child(3) { animation-delay: 160ms; }
        .ticker-row span:first-child { color: #2fffb9; font-weight: 950; }
        .sample-note {
          margin: 10px 0 0;
          color: rgba(226,255,204,0.38);
          font-size: 10px;
          line-height: 1.35;
        }
        .intel-grid {
          display: grid;
          gap: 10px;
        }
        .intel-card {
          width: 100%;
          text-align: left;
          border: 1px solid rgba(125,246,255,0.14);
          border-radius: 22px;
          background: rgba(8,18,24,0.66);
          color: inherit;
          padding: 13px;
          cursor: pointer;
          transition: border-color 180ms ease, background 180ms ease, box-shadow 240ms ease, transform 180ms ease;
        }
        .intel-card:hover,
        .intel-card.is-expanded {
          border-color: rgba(125,246,255,0.50);
          background: rgba(12,28,36,0.74);
          box-shadow: 0 0 34px rgba(38,170,255,0.12), 0 0 0 1px rgba(125,246,255,0.06) inset;
          transform: translateY(-1px);
        }
        .intel-top {
          display: grid;
          grid-template-columns: 1fr 82px;
          gap: 12px;
          align-items: center;
        }
        .intel-card h3 {
          margin: 0 0 5px;
          color: #f7fff0;
          font-size: 13px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .intel-card p {
          margin: 0;
          color: rgba(226,255,204,0.66);
          font-size: 12px;
          line-height: 1.38;
        }
        .sparkline {
          width: 82px;
          height: 28px;
        }
        .sparkline polyline {
          fill: none;
          stroke: #7df6ff;
          stroke-width: 2.6;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 130;
          stroke-dashoffset: 130;
          animation: sparkDraw 850ms ease forwards;
        }
        .card-detail {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 220ms ease, margin-top 220ms ease;
        }
        .card-detail > div { overflow: hidden; }
        .intel-card.is-expanded .card-detail { grid-template-rows: 1fr; margin-top: 10px; }
        .cl-rootBox, .cl-card, .cl-cardBox { width: 100% !important; max-width: 100% !important; }
        .cl-card { padding: 0 !important; }
        .cl-cardBox { box-shadow: none !important; }
        .cl-socialButtonsBlockButton {
          min-height: 48px !important;
          border-radius: 16px !important;
          background: linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.028)) !important;
          border-color: rgba(125,246,255,0.22) !important;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.035) inset, 0 14px 30px rgba(0,0,0,0.28) !important;
        }
        .cl-socialButtonsBlockButton:hover {
          background: rgba(125,246,255,0.10) !important;
          transform: translateY(-1px);
        }
        .cl-formButtonPrimary {
          min-height: 48px !important;
          border-radius: 16px !important;
          background: linear-gradient(135deg, #7df6ff, #26aaff 58%, #2fffb9) !important;
          box-shadow: 0 18px 38px rgba(38,170,255,0.25), 0 0 28px rgba(125,246,255,0.20) !important;
        }
        .cl-formFieldInput {
          border-radius: 16px !important;
          min-height: 48px !important;
          border-color: rgba(125,246,255,0.24) !important;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset !important;
        }
        .cl-dividerRow { margin: 12px 0 !important; }
        .cl-footer { margin-top: 12px !important; }
        .page-foot {
          color: rgba(226,255,204,0.34);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-align: center;
          text-transform: uppercase;
          padding-bottom: 4px;
        }
        @keyframes fieldDrift { from { background-position: 0 0, 0 0, 0 0, 0 0; } to { background-position: 0 240px, 240px 0, 0 96px, 96px 0; } }
        @keyframes panelGlow { 0%, 100% { border-color: rgba(125,246,255,0.20); box-shadow: 0 0 0 1px rgba(255,255,255,0.045) inset, 0 28px 90px rgba(0,0,0,0.72), 0 0 44px rgba(125,246,255,0.08); } 50% { border-color: rgba(125,246,255,0.34); box-shadow: 0 0 0 1px rgba(255,255,255,0.055) inset, 0 32px 100px rgba(0,0,0,0.76), 0 0 70px rgba(125,246,255,0.14); } }
        @keyframes livePulse { 0%, 100% { transform: scale(1); opacity: .72; } 50% { transform: scale(1.32); opacity: 1; } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sparkDraw { to { stroke-dashoffset: 0; } }
        @media (min-width: 920px) {
          .auth-wrap { padding: 30px 28px; align-content: center; }
          .brand-row { justify-content: flex-start; }
          .brand-logo { width: 320px; }
          .layout { grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.72fr); gap: 30px; }
          .auth-panel { align-self: center; padding: 22px; position: sticky; top: 24px; }
          .film-room { grid-template-columns: 1fr; }
          .intel-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .intel-top { grid-template-columns: 1fr; }
          .sparkline { width: 100%; }
        }
        @media (max-width: 560px) {
          .auth-wrap { gap: 15px; padding: calc(env(safe-area-inset-top) + 14px) 12px calc(env(safe-area-inset-bottom) + 14px); }
          .brand-logo { width: min(84vw, 260px); }
          .hero { gap: 12px; }
          .eyebrow { font-size: 9px; letter-spacing: 0.18em; text-align: center; }
          .hero h1 { text-align: center; font-size: clamp(38px, 13vw, 54px); }
          .hero-copy { text-align: center; font-size: 13px; }
          .sport-lanes { justify-content: center; }
          .sport-lane { min-height: 39px; padding: 0 13px; }
          .auth-panel { order: -1; border-radius: 26px; padding: 14px; }
          .auth-title { font-size: 30px; }
          .ticker-row { font-size: 10px; }
          .auth-panel form { gap: 9px !important; }
          .auth-panel input { padding: 13px 18px !important; font-size: 15px !important; border-radius: 16px !important; line-height: 1.2 !important; }
          .auth-panel button { min-height: 44px; }
          .cl-socialButtonsBlockButton { min-height: 44px !important; }
          .cl-formButtonPrimary { min-height: 44px !important; }
          .cl-formFieldInput { min-height: 44px !important; }
          .cl-footer, .cl-dividerRow { margin-top: 9px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: 0.001ms !important; }
        }
      `}</style>
      <div className="field-grid" />
      <div className="radar-glow" ref={glowRef} />
      <div className="grain" />
      <div className="scanline" />

      <div className="auth-wrap">
        <div className="brand-row">
          <img className="brand-logo" src="/brand/ai-athlete-intelligence-logo.png?v=transparent-20260525" alt="AI Athlete Intelligence" />
        </div>

        <div className="layout">
          <section className="hero" aria-label="Athlete Intelligence platform entrance">
            <p className="eyebrow">Athlete Intelligence Platform</p>
            <h1>Know the player before the market does.</h1>
            <p className="hero-copy">Real-time athlete signals, rotation intel, and matchup context — engineered for people who make decisions on players, not headlines.</p>

            <div className="sport-lanes" role="tablist" aria-label="Sport signal lanes">
              {sportKeys.map(sport => (
                <button
                  key={sport}
                  type="button"
                  className={`sport-lane ${activeSport === sport ? 'is-active' : ''}`}
                  onClick={() => setActiveSport(sport)}
                  role="tab"
                  aria-selected={activeSport === sport}
                >
                  {sport}
                </button>
              ))}
            </div>

            <section className="film-room" aria-label={`${activeSport} sample intelligence`}>
              <div className="ticker">
                <div className="ticker-head">
                  <span>{activeSport} Film Room Feed</span>
                  <span className="live-dot" aria-hidden="true" />
                </div>
                <div className="ticker-list" key={`${activeSport}-${tickerIndex}`}>
                  {tickerRows.map((row, index) => (
                    <div className="ticker-row" key={`${row}-${index}`}>
                      <span>{index === 1 ? '●' : '▲'}</span>
                      <span>{row}</span>
                    </div>
                  ))}
                </div>
                <p className="sample-note">Sample signal format · member board uses live slate context after sign-in.</p>
              </div>

              <div className="intel-grid">
                {active.cards.map(card => (
                  <button
                    className={`intel-card ${expandedCard === card.id ? 'is-expanded' : ''}`}
                    key={card.id}
                    type="button"
                    onClick={() => setExpandedCard(expandedCard === card.id ? '' : card.id)}
                    aria-expanded={expandedCard === card.id}
                  >
                    <div className="intel-top">
                      <div>
                        <h3>{card.title}</h3>
                        <p>{card.body}</p>
                      </div>
                      <svg className="sparkline" viewBox="0 0 82 28" aria-hidden="true" focusable="false">
                        <polyline points={card.points} />
                      </svg>
                    </div>
                    <div className="card-detail">
                      <div><p>{card.detail}</p></div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </section>

          <aside className="auth-panel" aria-label="Member Access">
            <div className="auth-head">
              <p className="auth-kicker">{eyebrow || 'Member Access'}</p>
              <h2 className="auth-title">{title || 'Member Access'}</h2>
              <p className="auth-subtitle">{subtitle || 'Athlete Intelligence is a paid platform. Sign in or activate your membership to enter.'}</p>
            </div>
            <div className="auth-body">{children}</div>
            <p className="auth-foot"><span aria-hidden="true">◆</span><span>Encrypted · Clerk-secured authentication</span></p>
          </aside>
        </div>

        <footer className="page-foot">© Athlete Intelligence · Premium access only</footer>
      </div>
    </main>
  )
}
