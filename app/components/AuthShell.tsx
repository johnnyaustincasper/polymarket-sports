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
  boardLabel: string
  boardNote: string
  signals: string[]
  cards: IntelCard[]
}

const SPORTS: Record<SportKey, SportIntel> = {
  NBA: {
    label: 'NBA',
    boardLabel: 'Half-court usage map',
    boardNote: 'Rotation pressure · Usage spike · Pace window',
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
    boardLabel: 'Route tree pressure map',
    boardNote: 'Route share · Coverage shell · Script window',
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
    boardLabel: 'Diamond matchup map',
    boardNote: 'Lineup slot · Handedness · Park context',
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
    boardLabel: 'Ice deployment map',
    boardNote: 'Line shift · Power play · Goalie status',
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
  const boardRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)

  const active = SPORTS[activeSport]
  const tickerRows = [0, 1, 2].map(offset => active.signals[(tickerIndex + offset) % active.signals.length])

  useEffect(() => {
    const interval = window.setInterval(() => setTickerIndex(index => index + 1), 5200)
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

        const board = boardRef.current
        if (board) {
          const rect = board.getBoundingClientRect()
          const x = (event.clientX - rect.left) / rect.width - 0.5
          const y = (event.clientY - rect.top) / rect.height - 0.5
          board.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`)
          board.style.setProperty('--tilt-y', `${(x * 7).toFixed(2)}deg`)
          board.style.setProperty('--shine-x', `${((x + 0.5) * 100).toFixed(1)}%`)
          board.style.setProperty('--shine-y', `${((y + 0.5) * 100).toFixed(1)}%`)
        }
      })
    }

    const resetBoard = () => {
      boardRef.current?.style.setProperty('--tilt-x', '0deg')
      boardRef.current?.style.setProperty('--tilt-y', '0deg')
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerleave', resetBoard)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', resetBoard)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return (
    <main className="auth-shell" data-auth-shell-version="scouting-board-landing-20260612">
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
            radial-gradient(circle at 18% 10%, rgba(34,211,238,0.15), transparent 30%),
            radial-gradient(circle at 82% 22%, rgba(47,255,185,0.12), transparent 28%),
            radial-gradient(circle at 70% 90%, rgba(38,170,255,0.10), transparent 34%),
            linear-gradient(145deg, #030609 0%, #071018 48%, #000203 100%);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        }
        .auth-shell *, .auth-shell *::before, .auth-shell *::after { box-sizing: border-box; }
        .field-grid, .radar-glow, .grain, .scanline { position: fixed; inset: 0; pointer-events: none; }
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
          background: radial-gradient(circle 680px at var(--mx) var(--my), rgba(34,211,238,0.18), rgba(47,255,185,0.065) 32%, transparent 64%);
          opacity: 0.94;
        }
        .grain {
          z-index: -2;
          opacity: 0.22;
          background-image:
            radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18) 0 1px, transparent 1px),
            radial-gradient(circle at 70% 80%, rgba(125,246,255,0.12) 0 1px, transparent 1px);
          background-size: 80px 80px, 130px 130px;
        }
        .scanline { z-index: 5; opacity: 0.11; mix-blend-mode: screen; background: repeating-linear-gradient(180deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 5px); }
        .auth-wrap { position: relative; z-index: 2; width: min(1220px, 100%); margin: 0 auto; min-height: 100dvh; display: grid; gap: 18px; padding: max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom)); }
        .brand-row { display: flex; align-items: center; justify-content: center; padding-top: 2px; }
        .brand-logo { width: min(72vw, 292px); height: auto; object-fit: contain; display: block; filter: none; border: 0; border-radius: 0; background: transparent; }
        .layout { display: grid; gap: 18px; align-items: center; }
        .hero { display: grid; gap: 14px; min-width: 0; }
        .eyebrow { margin: 0; color: #7df6ff; font-size: 10px; font-weight: 950; letter-spacing: 0.24em; text-transform: uppercase; }
        .hero h1 { margin: 0; max-width: 790px; font-size: clamp(42px, 11vw, 104px); line-height: 0.82; letter-spacing: -0.085em; text-transform: uppercase; text-wrap: balance; text-shadow: 0 0 42px rgba(125,246,255,0.12), 0 28px 70px rgba(0,0,0,0.72); }
        .hero-copy { margin: 0; max-width: 640px; color: rgba(226,255,204,0.78); font-size: clamp(14px, 2.4vw, 17px); line-height: 1.5; }
        .scouting-board {
          --tilt-x: 0deg;
          --tilt-y: 0deg;
          --shine-x: 50%;
          --shine-y: 50%;
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          border: 1px solid rgba(125,246,255,0.24);
          background: linear-gradient(145deg, rgba(8,18,24,0.88), rgba(2,6,9,0.92));
          box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset, 0 30px 90px rgba(0,0,0,0.52), 0 0 64px rgba(38,170,255,0.12);
          transform: perspective(1200px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y));
          transform-style: preserve-3d;
          transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
        }
        .scouting-board::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle 360px at var(--shine-x) var(--shine-y), rgba(125,246,255,0.16), transparent 62%);
          pointer-events: none;
        }
        .scouting-board::after {
          content: '';
          position: absolute;
          inset: -80% -40%;
          background: conic-gradient(from 0deg, transparent 0 42%, rgba(125,246,255,0.10), transparent 58% 100%);
          animation: boardSweep 9s linear infinite;
          pointer-events: none;
        }
        .board-head { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 14px 14px 0; }
        .board-kicker { margin: 0 0 4px; color: rgba(125,246,255,0.90); font-size: 9px; font-weight: 950; letter-spacing: 0.20em; text-transform: uppercase; }
        .board-title { margin: 0; color: #f7fff0; font-size: 13px; font-weight: 950; letter-spacing: 0.10em; text-transform: uppercase; }
        .board-chip { white-space: nowrap; border-radius: 999px; border: 1px solid rgba(47,255,185,0.28); background: rgba(47,255,185,0.06); color: rgba(226,255,204,0.80); padding: 8px 10px; font-size: 9px; font-weight: 950; letter-spacing: 0.13em; text-transform: uppercase; }
        .play-svg { position: relative; z-index: 1; display: block; width: 100%; height: clamp(250px, 34vw, 360px); }
        .field-line { stroke: rgba(125,246,255,0.16); stroke-width: 1; fill: none; }
        .field-line-strong { stroke: rgba(125,246,255,0.26); stroke-width: 1.4; fill: none; }
        .route { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 4; stroke-dasharray: 520; stroke-dashoffset: 520; filter: drop-shadow(0 0 8px rgba(125,246,255,0.36)); animation: routeDraw 3.2s cubic-bezier(.16,1,.3,1) infinite; }
        .route.route-a { stroke: #7df6ff; }
        .route.route-b { stroke: #2fffb9; animation-delay: .45s; }
        .route.route-c { stroke: rgba(255,255,255,0.74); stroke-width: 2.2; animation-delay: .9s; opacity: .65; }
        .target-ring { fill: none; stroke: rgba(47,255,185,0.86); stroke-width: 2; transform-origin: center; animation: targetPulse 2.1s ease-in-out infinite; }
        .player-dot { fill: #f7fff0; stroke: rgba(125,246,255,0.86); stroke-width: 2; filter: drop-shadow(0 0 9px rgba(125,246,255,0.48)); }
        .ghost-dot { fill: #2fffb9; filter: drop-shadow(0 0 11px rgba(47,255,185,0.72)); animation: dotPulse 1.6s ease-in-out infinite; }
        .readout { position: absolute; left: 14px; right: 14px; bottom: 14px; z-index: 3; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .readout span { border-radius: 16px; border: 1px solid rgba(125,246,255,0.14); background: rgba(0,3,5,0.54); padding: 10px; color: rgba(247,255,240,0.82); font-size: 10px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; backdrop-filter: blur(12px); }
        .sport-lanes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
        .sport-lane { min-height: 42px; padding: 0 15px; border-radius: 999px; border: 1px solid rgba(125,246,255,0.16); background: rgba(8,18,24,0.72); color: rgba(247,255,240,0.70); font-size: 11px; font-weight: 950; letter-spacing: 0.16em; cursor: pointer; transition: border-color 180ms ease, color 180ms ease, background 180ms ease, box-shadow 180ms ease, transform 180ms ease; }
        .sport-lane:hover, .sport-lane.is-active { color: #f7fff0; border-color: rgba(125,246,255,0.58); background: rgba(16,42,52,0.76); box-shadow: 0 0 28px rgba(125,246,255,0.12); transform: translateY(-1px); }
        .auth-panel { position: relative; overflow: hidden; border-radius: 30px; border: 1px solid rgba(125,246,255,0.26); background: linear-gradient(180deg, rgba(10,17,24,0.90), rgba(2,6,9,0.97)); box-shadow: 0 0 0 1px rgba(255,255,255,0.045) inset, 0 28px 90px rgba(0,0,0,0.72), 0 0 62px rgba(125,246,255,0.12); backdrop-filter: blur(28px) saturate(1.16); padding: 17px; animation: panelGlow 4.8s ease-in-out infinite; }
        .auth-panel::before { content: ''; position: absolute; left: 18px; right: 18px; top: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(125,246,255,0.86), transparent); }
        .auth-head { display: grid; gap: 7px; text-align: center; margin-bottom: 15px; }
        .auth-head p { margin: 0; }
        .auth-kicker { color: #7df6ff; font-size: 10px; font-weight: 950; letter-spacing: 0.22em; text-transform: uppercase; }
        .auth-title { margin: 0; color: #f7fff0; font-size: clamp(28px, 7vw, 42px); line-height: 0.92; letter-spacing: -0.065em; text-transform: uppercase; }
        .auth-subtitle { color: rgba(226,255,204,0.68); font-size: 13px; line-height: 1.42; }
        .auth-body { position: relative; z-index: 1; display: grid; gap: 13px; }
        .auth-foot { margin: 12px 0 0; display: flex; justify-content: center; gap: 7px; color: rgba(226,255,204,0.44); font-size: 10px; font-weight: 900; letter-spacing: 0.10em; text-transform: uppercase; }
        .film-room { display: grid; gap: 12px; }
        .ticker { border-radius: 24px; border: 1px solid rgba(125,246,255,0.15); background: rgba(3,8,12,0.72); box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset; padding: 12px; }
        .ticker-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 9px; color: rgba(125,246,255,0.82); font-size: 9px; font-weight: 950; letter-spacing: 0.18em; text-transform: uppercase; }
        .live-dot { width: 7px; height: 7px; border-radius: 999px; background: #2fffb9; box-shadow: 0 0 18px rgba(47,255,185,0.75); animation: livePulse 1.8s ease-in-out infinite; }
        .ticker-list { display: grid; gap: 7px; }
        .ticker-row { display: grid; grid-template-columns: 18px 1fr; align-items: start; gap: 8px; min-height: 32px; color: rgba(247,255,240,0.82); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 11px; line-height: 1.35; animation: rowIn 520ms ease both; }
        .ticker-row:nth-child(2) { animation-delay: 80ms; }
        .ticker-row:nth-child(3) { animation-delay: 160ms; }
        .ticker-row span:first-child { color: #2fffb9; font-weight: 950; }
        .sample-note { margin: 10px 0 0; color: rgba(226,255,204,0.38); font-size: 10px; line-height: 1.35; }
        .intel-grid { display: grid; gap: 10px; }
        .intel-card { width: 100%; text-align: left; border: 1px solid rgba(125,246,255,0.14); border-radius: 22px; background: rgba(8,18,24,0.66); color: inherit; padding: 13px; cursor: pointer; transition: border-color 180ms ease, background 180ms ease, box-shadow 240ms ease, transform 180ms ease; }
        .intel-card:hover, .intel-card.is-expanded { border-color: rgba(125,246,255,0.50); background: rgba(12,28,36,0.74); box-shadow: 0 0 34px rgba(38,170,255,0.12), 0 0 0 1px rgba(125,246,255,0.06) inset; transform: translateY(-1px); }
        .intel-top { display: grid; grid-template-columns: 1fr 82px; gap: 12px; align-items: center; }
        .intel-card h3 { margin: 0 0 5px; color: #f7fff0; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; }
        .intel-card p { margin: 0; color: rgba(226,255,204,0.66); font-size: 12px; line-height: 1.38; }
        .sparkline { width: 82px; height: 28px; }
        .sparkline polyline { fill: none; stroke: #7df6ff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 130; stroke-dashoffset: 130; animation: sparkDraw 850ms ease forwards; }
        .card-detail { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 220ms ease, margin-top 220ms ease; }
        .card-detail > div { overflow: hidden; }
        .intel-card.is-expanded .card-detail { grid-template-rows: 1fr; margin-top: 10px; }
        .cl-rootBox, .cl-card, .cl-cardBox { width: 100% !important; max-width: 100% !important; }
        .cl-card { padding: 0 !important; }
        .cl-cardBox { box-shadow: none !important; }
        .cl-socialButtonsBlockButton { min-height: 48px !important; border-radius: 16px !important; background: linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.028)) !important; border-color: rgba(125,246,255,0.22) !important; box-shadow: 0 0 0 1px rgba(255,255,255,0.035) inset, 0 14px 30px rgba(0,0,0,0.28) !important; }
        .cl-socialButtonsBlockButton:hover { background: rgba(125,246,255,0.10) !important; transform: translateY(-1px); }
        .cl-formButtonPrimary { min-height: 48px !important; border-radius: 16px !important; background: linear-gradient(135deg, #7df6ff, #26aaff 58%, #2fffb9) !important; box-shadow: 0 18px 38px rgba(38,170,255,0.25), 0 0 28px rgba(125,246,255,0.20) !important; }
        .cl-formFieldInput { border-radius: 16px !important; min-height: 48px !important; border-color: rgba(125,246,255,0.24) !important; box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset !important; }
        .cl-dividerRow { margin: 12px 0 !important; }
        .cl-footer { margin-top: 12px !important; }
        .page-foot { color: rgba(226,255,204,0.34); font-size: 10px; font-weight: 900; letter-spacing: 0.14em; text-align: center; text-transform: uppercase; padding-bottom: 4px; }
        @keyframes fieldDrift { from { background-position: 0 0, 0 0, 0 0, 0 0; } to { background-position: 0 240px, 240px 0, 0 96px, 96px 0; } }
        @keyframes panelGlow { 0%, 100% { border-color: rgba(125,246,255,0.22); box-shadow: 0 0 0 1px rgba(255,255,255,0.045) inset, 0 28px 90px rgba(0,0,0,0.72), 0 0 44px rgba(125,246,255,0.08); } 50% { border-color: rgba(125,246,255,0.38); box-shadow: 0 0 0 1px rgba(255,255,255,0.055) inset, 0 32px 100px rgba(0,0,0,0.76), 0 0 78px rgba(125,246,255,0.15); } }
        @keyframes livePulse { 0%, 100% { transform: scale(1); opacity: .72; } 50% { transform: scale(1.32); opacity: 1; } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sparkDraw { to { stroke-dashoffset: 0; } }
        @keyframes routeDraw { 0% { stroke-dashoffset: 520; opacity: .15; } 42%, 74% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: -520; opacity: .18; } }
        @keyframes targetPulse { 0%, 100% { transform: scale(.92); opacity: .36; } 50% { transform: scale(1.2); opacity: 1; } }
        @keyframes dotPulse { 0%, 100% { opacity: .45; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.18); } }
        @keyframes boardSweep { to { transform: rotate(360deg); } }
        @media (min-width: 920px) {
          .auth-wrap { padding: 30px 28px; align-content: center; }
          .brand-row { justify-content: flex-start; }
          .brand-logo { width: 320px; }
          .layout { grid-template-columns: minmax(0, 1.22fr) minmax(360px, 0.70fr); gap: 30px; }
          .auth-panel { align-self: center; padding: 22px; position: sticky; top: 24px; }
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
          .scouting-board { border-radius: 24px; }
          .play-svg { height: 245px; }
          .board-head { padding: 12px 12px 0; }
          .board-chip { display: none; }
          .readout { grid-template-columns: 1fr; gap: 6px; }
          .readout span { padding: 8px 10px; }
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
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: 0.001ms !important; } }
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

            <div className="scouting-board" ref={boardRef} key={activeSport} aria-label={`${activeSport} animated scouting board`}>
              <div className="board-head">
                <div>
                  <p className="board-kicker">Live Scouting Board · {activeSport}</p>
                  <p className="board-title">{active.boardLabel}</p>
                </div>
                <div className="board-chip">Interactive map</div>
              </div>
              <svg className="play-svg" viewBox="0 0 760 360" role="img" aria-label={`${activeSport} play diagram`}>
                <defs>
                  <radialGradient id="boardGlow" cx="50%" cy="50%" r="60%">
                    <stop offset="0%" stopColor="rgba(125,246,255,0.22)" />
                    <stop offset="100%" stopColor="rgba(125,246,255,0)" />
                  </radialGradient>
                </defs>
                <rect x="20" y="24" width="720" height="260" rx="28" fill="url(#boardGlow)" />
                <rect x="52" y="44" width="656" height="220" rx="22" className="field-line-strong" />
                <line x1="380" y1="44" x2="380" y2="264" className="field-line-strong" />
                <line x1="160" y1="44" x2="160" y2="264" className="field-line" />
                <line x1="600" y1="44" x2="600" y2="264" className="field-line" />
                <circle cx="380" cy="154" r="58" className="field-line" />
                {activeSport === 'MLB' ? (
                  <>
                    <path d="M380 70 L556 176 L380 250 L204 176 Z" className="field-line-strong" />
                    <path className="route route-a" d="M380 250 C386 214 422 186 556 176" />
                    <path className="route route-b" d="M380 250 C330 198 302 122 380 70" />
                    <path className="route route-c" d="M380 250 C418 208 460 196 556 176" />
                    <circle className="target-ring" cx="556" cy="176" r="28" />
                    <circle className="player-dot" cx="380" cy="250" r="10" />
                    <circle className="ghost-dot" cx="508" cy="184" r="7" />
                  </>
                ) : activeSport === 'NFL' ? (
                  <>
                    <path className="route route-a" d="M142 214 C250 164 326 118 500 98 L612 92" />
                    <path className="route route-b" d="M160 160 C288 164 412 178 594 220" />
                    <path className="route route-c" d="M118 112 L228 112 C340 112 470 138 662 154" />
                    <circle className="target-ring" cx="612" cy="92" r="26" />
                    <circle className="player-dot" cx="142" cy="214" r="10" />
                    <circle className="player-dot" cx="160" cy="160" r="10" />
                    <circle className="ghost-dot" cx="514" cy="104" r="7" />
                  </>
                ) : activeSport === 'NHL' ? (
                  <>
                    <path className="route route-a" d="M166 196 C260 120 374 112 522 132 C596 142 632 176 652 214" />
                    <path className="route route-b" d="M210 98 C300 158 396 202 586 206" />
                    <path className="route route-c" d="M120 154 C238 170 506 168 650 154" />
                    <circle className="target-ring" cx="652" cy="214" r="26" />
                    <circle className="player-dot" cx="166" cy="196" r="10" />
                    <circle className="ghost-dot" cx="570" cy="198" r="7" />
                  </>
                ) : (
                  <>
                    <path className="route route-a" d="M150 222 C240 146 330 128 424 142 C520 156 594 104 644 74" />
                    <path className="route route-b" d="M182 118 C260 202 388 242 578 212" />
                    <path className="route route-c" d="M124 184 C270 184 438 172 636 154" />
                    <circle className="target-ring" cx="644" cy="74" r="27" />
                    <circle className="player-dot" cx="150" cy="222" r="10" />
                    <circle className="player-dot" cx="182" cy="118" r="10" />
                    <circle className="ghost-dot" cx="552" cy="112" r="7" />
                  </>
                )}
              </svg>
              <div className="readout" aria-hidden="true">
                {active.boardNote.split(' · ').map(note => <span key={note}>{note}</span>)}
              </div>
            </div>

            <div className="sport-lanes" role="tablist" aria-label="Sport signal lanes">
              {sportKeys.map(sport => (
                <button key={sport} type="button" className={`sport-lane ${activeSport === sport ? 'is-active' : ''}`} onClick={() => setActiveSport(sport)} role="tab" aria-selected={activeSport === sport}>{sport}</button>
              ))}
            </div>

            <section className="film-room" aria-label={`${activeSport} sample intelligence`}>
              <div className="ticker">
                <div className="ticker-head"><span>{activeSport} Film Room Feed</span><span className="live-dot" aria-hidden="true" /></div>
                <div className="ticker-list" key={`${activeSport}-${tickerIndex}`}>
                  {tickerRows.map((row, index) => <div className="ticker-row" key={`${row}-${index}`}><span>{index === 1 ? '●' : '▲'}</span><span>{row}</span></div>)}
                </div>
                <p className="sample-note">Sample signal format · member board uses live slate context after sign-in.</p>
              </div>

              <div className="intel-grid">
                {active.cards.map(card => (
                  <button className={`intel-card ${expandedCard === card.id ? 'is-expanded' : ''}`} key={card.id} type="button" onClick={() => setExpandedCard(expandedCard === card.id ? '' : card.id)} aria-expanded={expandedCard === card.id}>
                    <div className="intel-top">
                      <div><h3>{card.title}</h3><p>{card.body}</p></div>
                      <svg className="sparkline" viewBox="0 0 82 28" aria-hidden="true" focusable="false"><polyline points={card.points} /></svg>
                    </div>
                    <div className="card-detail"><div><p>{card.detail}</p></div></div>
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
