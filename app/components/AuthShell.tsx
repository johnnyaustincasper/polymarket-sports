'use client'

import { useRef, useState } from 'react'

type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

type PortalPhase = 'idle' | 'charging' | 'locked' | 'open'

const signalChips = ['Live player intel', 'Edge detection', 'Members only']

export default function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  const [phase, setPhase] = useState<PortalPhase>('idle')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const chargeStartedAt = useRef(0)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const opened = phase === 'open'

  const clearOpenTimer = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }

  const completeCharge = () => {
    if (phase === 'open' || phase === 'locked') return
    clearOpenTimer()
    setPhase('locked')
    openTimer.current = setTimeout(() => setPhase('open'), 260)
  }

  const startCharge = () => {
    if (phase !== 'idle') return
    chargeStartedAt.current = performance.now()
    setPhase('charging')
  }

  const releaseCharge = () => {
    if (phase !== 'charging') return
    const heldFor = performance.now() - chargeStartedAt.current
    if (heldFor < 260) completeCharge()
  }

  const resetPortal = () => {
    clearOpenTimer()
    buttonRef.current?.style.setProperty('--tx', '0px')
    buttonRef.current?.style.setProperty('--ty', '0px')
    buttonRef.current?.style.setProperty('--rx', '0deg')
    buttonRef.current?.style.setProperty('--ry', '0deg')
    setPhase('idle')
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const button = buttonRef.current
    if (!button || phase === 'open') return
    const rect = button.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    button.style.setProperty('--tx', `${(x * 10).toFixed(2)}px`)
    button.style.setProperty('--ty', `${(y * 10).toFixed(2)}px`)
    button.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`)
    button.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`)
  }

  const handlePointerLeave = () => {
    buttonRef.current?.style.setProperty('--tx', '0px')
    buttonRef.current?.style.setProperty('--ty', '0px')
    buttonRef.current?.style.setProperty('--rx', '0deg')
    buttonRef.current?.style.setProperty('--ry', '0deg')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (phase === 'idle' || phase === 'charging') completeCharge()
    }
  }

  return (
    <main className={`auth-shell is-${phase}`} data-auth-shell-version="signal-lock-landing-20260612">
      <style>{`
        html, body { min-height: 100%; background: #000404; }
        .auth-shell {
          min-height: 100vh;
          min-height: 100svh;
          min-height: 100dvh;
          width: 100%;
          position: relative;
          overflow: hidden;
          isolation: isolate;
          display: grid;
          place-items: center;
          padding: max(22px, env(safe-area-inset-top)) 16px max(22px, env(safe-area-inset-bottom));
          color: #f7fff0;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at 50% 42%, rgba(125,246,255,0.24), transparent 32%),
            radial-gradient(circle at 50% 50%, rgba(47,255,185,0.12), transparent 45%),
            radial-gradient(circle at 16% 18%, rgba(47,255,185,0.12), transparent 25%),
            radial-gradient(circle at 84% 20%, rgba(38,170,255,0.18), transparent 28%),
            radial-gradient(circle at 70% 86%, rgba(125,246,255,0.10), transparent 28%),
            linear-gradient(180deg, #020a0a 0%, #000404 48%, #000 100%);
        }
        .auth-shell *, .auth-shell *::before, .auth-shell *::after { box-sizing: border-box; }
        .star-field,
        .nebula-field,
        .frequency-grid,
        .scan-haze,
        .cosmic-vignette,
        .tracer-lines,
        .signal-seam {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }
        .star-field {
          z-index: -9;
          opacity: 0.64;
          background-image:
            radial-gradient(circle, rgba(247,255,240,0.92) 0 1px, transparent 1.55px),
            radial-gradient(circle, rgba(125,246,255,0.78) 0 1px, transparent 1.75px),
            radial-gradient(circle, rgba(47,255,185,0.66) 0 1px, transparent 1.6px),
            radial-gradient(circle, rgba(255,255,255,0.45) 0 0.7px, transparent 1.2px);
          background-size: 180px 230px, 290px 260px, 360px 310px, 110px 130px;
          background-position: 8% 18%, 84% 20%, 50% 82%, 30% 42%;
          transition: transform 900ms ease, opacity 900ms ease;
          animation: starDrift 22s linear infinite;
        }
        .nebula-field {
          z-index: -8;
          opacity: 0.92;
          background:
            radial-gradient(ellipse at 50% 52%, rgba(125,246,255,0.20), transparent 30%),
            radial-gradient(ellipse at 38% 42%, rgba(47,255,185,0.12), transparent 26%),
            radial-gradient(ellipse at 62% 38%, rgba(38,170,255,0.16), transparent 28%);
          filter: blur(26px) saturate(1.2);
          transition: transform 900ms ease, opacity 900ms ease;
          animation: nebulaBreathe 7.2s ease-in-out infinite;
        }
        .frequency-grid {
          z-index: -7;
          opacity: 0.44;
          background-image:
            linear-gradient(rgba(125,246,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(125,246,255,0.05) 1px, transparent 1px),
            radial-gradient(circle at 50% 50%, transparent 0 21%, rgba(125,246,255,0.09) 21.2% 21.45%, transparent 21.8% 35%, rgba(125,246,255,0.065) 35.2% 35.5%, transparent 35.8% 52%, rgba(47,255,185,0.05) 52.2% 52.5%, transparent 52.8%);
          background-size: 54px 54px, 54px 54px, 900px 900px;
          background-position: center;
          mask-image: radial-gradient(circle at 50% 50%, black 0%, transparent 74%);
          animation: gridPulse 5s ease-in-out infinite, gridDrift 18s linear infinite;
        }
        .tracer-lines {
          z-index: -5;
          opacity: 0.66;
          overflow: hidden;
        }
        .tracer-lines span {
          position: absolute;
          left: -24vw;
          width: 42vw;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(125,246,255,0.78), rgba(47,255,185,0.55), transparent);
          transform: rotate(-22deg) translateX(-40vw);
          filter: none;
          animation: tracerSweep 12s linear infinite;
        }
        .tracer-lines span:nth-child(1) { top: 21%; animation-duration: 12s; }
        .tracer-lines span:nth-child(2) { top: 56%; animation-duration: 17s; animation-delay: -6s; opacity: 0.72; }
        .tracer-lines span:nth-child(3) { top: 78%; animation-duration: 23s; animation-delay: -12s; opacity: 0.55; }
        .scan-haze {
          z-index: 8;
          opacity: 0.22;
          mix-blend-mode: screen;
          background:
            repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 5px),
            linear-gradient(180deg, transparent 0%, rgba(125,246,255,0.07) 47%, transparent 54%);
          background-size: auto, 100% 310px;
          animation: scanFall 5.8s linear infinite;
        }
        .cosmic-vignette {
          z-index: 9;
          background:
            radial-gradient(circle at 50% 50%, transparent 0 31%, rgba(0,0,0,0.32) 72%, rgba(0,0,0,0.82) 100%),
            linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.70));
        }
        .is-open .star-field { transform: scale(1.08); opacity: 0.34; }
        .is-open .nebula-field { transform: scale(1.14); opacity: 0.40; }
        .signal-seam {
          z-index: 13;
          left: 50%;
          right: auto;
          width: 1px;
          transform: translateX(-50%) scaleY(0);
          opacity: 0;
          background: linear-gradient(180deg, transparent, rgba(247,255,240,0.98), rgba(125,246,255,0.98), transparent);
          box-shadow: 0 0 18px rgba(125,246,255,0.98), 0 0 70px rgba(47,255,185,0.44);
        }
        .is-locked .signal-seam,
        .is-open .signal-seam {
          animation: seamFlash 720ms cubic-bezier(.16,1,.3,1) both;
        }
        .orb-stage {
          position: relative;
          z-index: 10;
          width: min(100%, 1120px);
          min-height: min(780px, calc(100dvh - 44px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
          display: grid;
          place-items: center;
        }
        .orb-copy {
          position: absolute;
          z-index: 12;
          left: 50%;
          top: calc(50% + min(31vw, 196px));
          transform: translateX(-50%);
          width: min(92vw, 620px);
          text-align: center;
          display: grid;
          gap: 10px;
          transition: opacity 520ms ease, transform 620ms ease, filter 620ms ease;
        }
        .is-locked .orb-copy,
        .is-open .orb-copy {
          opacity: 0;
          transform: translateX(-50%) translateY(28px) scale(0.94);
          filter: blur(8px);
          pointer-events: none;
        }
        .orb-kicker {
          margin: 0;
          color: rgba(125,246,255,0.94);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.28em;
          text-transform: uppercase;
        }
        .orb-title {
          margin: 0;
          font-size: clamp(34px, 7vw, 78px);
          line-height: 0.82;
          letter-spacing: -0.085em;
          text-transform: uppercase;
          text-wrap: balance;
          text-shadow: 0 0 34px rgba(125,246,255,0.28), 0 26px 60px rgba(0,0,0,0.84);
        }
        .orb-subtitle {
          margin: 0 auto;
          max-width: 500px;
          color: rgba(226,255,204,0.72);
          font-size: 13px;
          line-height: 1.45;
        }
        .orb-chips {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 4px;
        }
        .orb-chip {
          position: relative;
          overflow: hidden;
          padding: 8px 11px;
          border-radius: 999px;
          border: 1px solid rgba(125,246,255,0.20);
          background: rgba(125,246,255,0.058);
          color: rgba(247,255,240,0.86);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          box-shadow: 0 0 26px rgba(125,246,255,0.06) inset;
        }
        .orb-chip::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,0.16), transparent);
          transform: translateX(-120%);
          animation: chipSweep 4.8s ease-in-out infinite;
        }
        .orb-chip:nth-child(2)::after { animation-delay: .55s; }
        .orb-chip:nth-child(3)::after { animation-delay: 1.1s; }
        .liquid-orb-button {
          --tx: 0px;
          --ty: 0px;
          --rx: 0deg;
          --ry: 0deg;
          --morph-speed: 9s;
          --charge-duration: 900ms;
          position: relative;
          z-index: 14;
          width: clamp(250px, 42vw, 450px);
          aspect-ratio: 1;
          border: 0;
          border-radius: 999px;
          padding: 0;
          cursor: pointer;
          color: inherit;
          background: transparent;
          transform: translate3d(var(--tx), calc(var(--ty) - 42px), 0) rotateX(var(--rx)) rotateY(var(--ry)) scale(1);
          transform-style: preserve-3d;
          transition: transform 260ms ease, opacity 560ms ease;
          filter: none;
          touch-action: none;
          -webkit-tap-highlight-color: transparent;
        }
        .liquid-orb-button:hover { transform: translate3d(var(--tx), calc(var(--ty) - 46px), 0) rotateX(var(--rx)) rotateY(var(--ry)) scale(1.025); }
        .liquid-orb-button:active,
        .is-charging .liquid-orb-button { --morph-speed: 1.05s; transform: translate3d(var(--tx), calc(var(--ty) - 42px), 0) rotateX(var(--rx)) rotateY(var(--ry)) scale(0.975); }
        .liquid-orb-button:focus-visible { outline: 2px solid rgba(125,246,255,0.88); outline-offset: 18px; }
        .is-locked .liquid-orb-button {
          transform: translateY(-34px) scaleX(0.045) scaleY(1.42);
          opacity: 0.9;
          transition: transform 300ms cubic-bezier(.16,1,.3,1), opacity 260ms ease;
        }
        .is-open .liquid-orb-button {
          transform: translateY(-28px) scaleX(0.035) scaleY(1.56);
          opacity: 0;
          pointer-events: none;
          transition-duration: 520ms;
        }
        .orb-core {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 50%, rgba(125,246,255,0.18), transparent 66%),
            linear-gradient(135deg, rgba(5,24,30,0.92), rgba(2,9,12,0.96));
          box-shadow:
            0 0 76px rgba(125,246,255,0.36),
            0 0 160px rgba(38,170,255,0.18),
            0 0 0 1px rgba(255,255,255,0.20) inset,
            0 0 48px rgba(125,246,255,0.58) inset,
            -24px -24px 70px rgba(255,255,255,0.12) inset,
            24px 30px 80px rgba(0,0,0,0.52) inset;
          animation: heartBeat 1.42s cubic-bezier(.32,.02,.21,1) infinite;
          transform-origin: 50% 54%;
        }
        .ball-skin,
        .orb-shine {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
        }
        .ball-skin {
          display: block;
          opacity: 0;
          transform: scale(1.025);
          animation-duration: var(--morph-speed);
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          will-change: opacity, transform;
        }
        .ball-skin svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
        }
        .ball-basketball {
          background:
            radial-gradient(circle at 34% 24%, rgba(255,255,255,0.38), transparent 17%),
            radial-gradient(circle at 70% 75%, rgba(92,34,0,0.30), transparent 38%),
            radial-gradient(circle at 50% 50%, rgba(255,149,44,0.94), rgba(206,88,17,0.98) 58%, rgba(104,41,9,0.98) 100%);
          animation-name: basketballMorph;
        }
        .ball-baseball {
          background:
            radial-gradient(circle at 32% 22%, rgba(255,255,255,0.92), transparent 18%),
            radial-gradient(circle at 70% 78%, rgba(165,180,190,0.22), transparent 42%),
            radial-gradient(circle at 50% 50%, #f8fbf7 0%, #d9e1df 60%, #9fb5b8 100%);
          animation-name: baseballMorph;
        }
        .ball-soccer {
          background:
            radial-gradient(circle at 34% 23%, rgba(255,255,255,0.84), transparent 17%),
            radial-gradient(circle at 50% 50%, #f4fbf7 0%, #dde8e6 58%, #80999d 100%);
          animation-name: soccerMorph;
        }
        .orb-shine {
          z-index: 4;
          background:
            radial-gradient(circle at 34% 25%, rgba(255,255,255,0.96) 0 5%, rgba(255,255,255,0.24) 12%, transparent 24%),
            linear-gradient(115deg, transparent 0 24%, rgba(255,255,255,0.16) 35%, transparent 46%),
            radial-gradient(circle at 50% 84%, rgba(0,0,0,0.30), transparent 42%);
          opacity: 0.86;
        }
        .lock-ring {
          position: absolute;
          inset: -17px;
          border-radius: 50%;
          pointer-events: none;
          opacity: 0.70;
        }
        .lock-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); display: block; }
        .lock-ring .ring-track {
          fill: none;
          stroke: rgba(125,246,255,0.14);
          stroke-width: 1.3;
        }
        .lock-ring .ring-progress {
          fill: none;
          stroke: rgba(125,246,255,0.96);
          stroke-width: 2.6;
          stroke-linecap: round;
          stroke-dasharray: 302;
          stroke-dashoffset: 302;
          opacity: 0;
        }
        .is-charging .ring-progress {
          opacity: 1;
          animation: chargeRing var(--charge-duration) linear forwards;
        }
        .is-locked .ring-progress,
        .is-open .ring-progress {
          opacity: 1;
          stroke-dashoffset: 0;
        }
        .orb-label {
          position: absolute;
          z-index: 5;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: grid;
          gap: 7px;
          justify-items: center;
          text-align: center;
          pointer-events: none;
          text-transform: uppercase;
          text-shadow: 0 0 24px rgba(0,0,0,0.86);
        }
        .orb-label strong {
          font-size: clamp(13px, 2.1vw, 19px);
          line-height: 1;
          letter-spacing: 0.24em;
          font-weight: 1000;
        }
        .orb-label span,
        .charge-label {
          color: rgba(255,255,255,0.76);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.18em;
        }
        .charge-label { color: rgba(125,246,255,0.92); }
        .is-locked .charge-label,
        .is-open .charge-label { color: rgba(47,255,185,0.94); }
        .auth-panel {
          position: absolute;
          z-index: 15;
          width: min(100%, 488px);
          max-height: calc(100dvh - 44px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 34px;
          border: 1px solid rgba(125,246,255,0.25);
          background:
            linear-gradient(180deg, rgba(8,24,24,0.88), rgba(1,5,5,0.97)),
            rgba(0,0,0,0.90);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.055) inset,
            0 0 96px rgba(125,246,255,0.20),
            0 36px 120px rgba(0,0,0,0.92);
          padding: 22px;
          backdrop-filter: blur(30px) saturate(1.18);
          opacity: 0;
          transform: translateY(22px) scale(0.98);
          clip-path: inset(0 50% 0 50% round 34px);
          animation: panelOpen 620ms cubic-bezier(.16,1,.3,1) 60ms forwards;
        }
        .auth-panel::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: conic-gradient(from var(--spin, 0deg), transparent, rgba(125,246,255,0.76), transparent 26%, transparent 72%, rgba(47,255,185,0.42), transparent);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          animation: authBorderSpin 6s linear infinite;
        }
        .auth-panel::-webkit-scrollbar { width: 0; height: 0; }
        .auth-head { text-align: center; margin-bottom: 16px; position: relative; }
        .auth-logo-shell {
          position: relative;
          width: min(100%, 214px);
          margin: 0 auto 12px;
          padding: 0;
          border-radius: 0;
          overflow: visible;
          border: 0;
          background: transparent;
          box-shadow: none;
        }
        .auth-logo { position: relative; width: 100%; height: auto; border-radius: 0; margin: 0 auto; overflow: visible; border: 0; background: transparent; box-shadow: none; }
        .auth-logo img { width: 100%; height: auto; object-fit: contain; display: block; filter: none; }
        .auth-eyebrow { color: #7df6ff; font-weight: 950; font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; margin: 0; }
        .auth-title { margin: 8px 0 7px; font-size: clamp(30px, 7vw, 43px); line-height: 0.92; letter-spacing: -0.07em; text-transform: uppercase; text-wrap: balance; }
        .auth-subtitle { margin: 0 auto; max-width: 360px; color: rgba(226,255,204,0.72); font-size: 13px; line-height: 1.45; }
        .auth-body { display: grid; gap: 14px; position: relative; z-index: 1; }
        .auth-access-note {
          margin: 12px 0 0;
          text-align: center;
          color: rgba(226,255,204,0.45);
          font-size: 10px;
          line-height: 1.35;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .auth-reset {
          width: 100%;
          margin: 12px 0 0;
          min-height: 34px;
          border: 1px solid rgba(125,246,255,0.12);
          border-radius: 999px;
          background: rgba(125,246,255,0.035);
          color: rgba(125,246,255,0.72);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .cl-rootBox, .cl-card, .cl-cardBox { width: 100% !important; max-width: 100% !important; }
        .cl-card { padding: 0 !important; }
        .cl-cardBox { box-shadow: none !important; }
        .cl-socialButtonsBlockButton {
          min-height: 50px !important;
          border-radius: 17px !important;
          background: linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.028)) !important;
          border-color: rgba(125,246,255,0.22) !important;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.035) inset, 0 14px 30px rgba(0,0,0,0.28) !important;
          transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease !important;
        }
        .cl-socialButtonsBlockButton:hover {
          background: rgba(125,246,255,0.10) !important;
          transform: translateY(-1px);
          box-shadow: 0 0 0 1px rgba(125,246,255,0.18) inset, 0 18px 38px rgba(125,246,255,0.10) !important;
        }
        .cl-formButtonPrimary {
          min-height: 50px !important;
          border-radius: 17px !important;
          background: linear-gradient(135deg, #7df6ff, #26aaff 58%, #2fffb9) !important;
          box-shadow: 0 18px 38px rgba(38,170,255,0.27), 0 0 28px rgba(125,246,255,0.24) !important;
          transition: transform 160ms ease, filter 160ms ease, box-shadow 160ms ease !important;
        }
        .cl-formButtonPrimary:hover {
          transform: translateY(-1px);
          filter: saturate(1.08) brightness(1.04);
          box-shadow: 0 24px 46px rgba(38,170,255,0.32), 0 0 34px rgba(125,246,255,0.30) !important;
        }
        .cl-formFieldInput {
          border-radius: 17px !important;
          min-height: 50px !important;
          border-color: rgba(125,246,255,0.24) !important;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset !important;
        }
        .cl-formFieldInput:focus {
          box-shadow: 0 0 0 1px rgba(125,246,255,0.40) inset, 0 0 26px rgba(125,246,255,0.10) !important;
        }
        .cl-dividerRow { margin: 13px 0 !important; }
        .cl-footer { margin-top: 12px !important; }

        @property --spin { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
        @keyframes authBorderSpin { to { --spin: 360deg; } }
        @keyframes starDrift { from { background-position: 8% 18%, 84% 20%, 50% 82%, 30% 42%; } to { background-position: 8% -82%, 84% -80%, 50% -18%, 30% -58%; } }
        @keyframes nebulaBreathe { 0%, 100% { transform: scale(1); opacity: 0.72; filter: blur(28px) saturate(1.12); } 48% { transform: scale(1.08); opacity: 1; filter: blur(18px) saturate(1.42); } }
        @keyframes gridPulse { 0%, 100% { transform: scale(1); opacity: 0.25; } 50% { transform: scale(1.05); opacity: 0.50; } }
        @keyframes gridDrift { from { background-position: 0 0, 0 0, center; } to { background-position: 54px 54px, 54px 54px, center; } }
        @keyframes scanFall { from { background-position: 0 0, 0 -310px; } to { background-position: 0 0, 0 310px; } }
        @keyframes tracerSweep { 0% { transform: rotate(-22deg) translateX(-48vw); opacity: 0; } 12%, 54% { opacity: 1; } 100% { transform: rotate(-22deg) translateX(148vw); opacity: 0; } }
        @keyframes chipSweep { 0%, 62% { transform: translateX(-120%); } 82%, 100% { transform: translateX(120%); } }
        @keyframes heartBeat { 0%, 100% { transform: scale(1); } 10% { transform: scale(1.045); } 18% { transform: scale(0.985); } 29% { transform: scale(1.075); } 43% { transform: scale(1); } }
        @keyframes chargeRing { to { stroke-dashoffset: 0; } }
        @keyframes seamFlash { 0% { opacity: 0; transform: translateX(-50%) scaleY(0); } 22% { opacity: 1; transform: translateX(-50%) scaleY(1); } 100% { opacity: 0; transform: translateX(-50%) scaleY(1.08); } }
        @keyframes panelOpen { 0% { opacity: 0; transform: translateY(24px) scale(0.98); clip-path: inset(0 50% 0 50% round 34px); } 100% { opacity: 1; transform: translateY(0) scale(1); clip-path: inset(0 0 0 0 round 34px); } }
        @keyframes basketballMorph {
          0%, 27% { opacity: 1; transform: scale(1); }
          33%, 94% { opacity: 0; transform: scale(1.025); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes baseballMorph {
          0%, 27% { opacity: 0; transform: scale(1.025); }
          33%, 60% { opacity: 1; transform: scale(1); }
          66%, 100% { opacity: 0; transform: scale(1.025); }
        }
        @keyframes soccerMorph {
          0%, 60% { opacity: 0; transform: scale(1.025); }
          66%, 94% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.025); }
        }
        @media (max-width: 560px) {
          .auth-shell { padding: calc(env(safe-area-inset-top) + 10px) 10px calc(env(safe-area-inset-bottom) + 10px); }
          .orb-stage { min-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }
          .liquid-orb-button { width: clamp(236px, 72vw, 318px); transform: translate3d(var(--tx), calc(var(--ty) - 58px), 0) rotateX(var(--rx)) rotateY(var(--ry)); }
          .liquid-orb-button:hover { transform: translate3d(var(--tx), calc(var(--ty) - 58px), 0) rotateX(var(--rx)) rotateY(var(--ry)) scale(1.012); }
          .is-charging .liquid-orb-button { transform: translate3d(var(--tx), calc(var(--ty) - 58px), 0) rotateX(var(--rx)) rotateY(var(--ry)) scale(0.975); }
          .is-locked .liquid-orb-button { transform: translateY(-42px) scaleX(0.045) scaleY(1.42); }
          .is-open .liquid-orb-button { transform: translateY(-38px) scaleX(0.035) scaleY(1.52); }
          .lock-ring { inset: -13px; }
          .orb-copy { top: calc(50% + min(42vw, 176px)); }
          .orb-title { font-size: clamp(34px, 12vw, 48px); }
          .orb-subtitle { font-size: 12px; max-width: 322px; }
          .auth-panel {
            width: 100%;
            max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
            border-radius: 30px;
            padding: 15px;
          }
          .auth-logo-shell { width: 176px; margin-bottom: 10px; }
          .auth-eyebrow { font-size: 8px; letter-spacing: 0.17em; }
          .auth-title { font-size: 30px; margin: 6px 0 5px; }
          .auth-subtitle { font-size: 12px; max-width: 310px; }
          .auth-body { gap: 10px; }
          .auth-panel form { gap: 9px !important; }
          .auth-panel input { padding: 13px 18px !important; font-size: 15px !important; border-radius: 16px !important; line-height: 1.2 !important; }
          .auth-panel button { min-height: 44px; }
          .cl-socialButtonsBlockButton { min-height: 44px !important; }
          .cl-formButtonPrimary { min-height: 44px !important; }
          .cl-formFieldInput { min-height: 44px !important; }
          .cl-footer, .cl-dividerRow { margin-top: 9px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
          .auth-panel, .liquid-orb-button, .orb-copy, .star-field, .nebula-field { transition-duration: 0.001ms !important; }
        }
      `}</style>
      <div className="star-field" />
      <div className="nebula-field" />
      <div className="frequency-grid" />
      <div className="tracer-lines" aria-hidden="true"><span /><span /><span /></div>
      <div className="scan-haze" />
      <div className="signal-seam" />
      <div className="cosmic-vignette" />
      <section className="orb-stage" aria-label="Athlete Intelligence access portal">
        <button
          ref={buttonRef}
          type="button"
          className="liquid-orb-button"
          onPointerDown={startCharge}
          onPointerUp={releaseCharge}
          onPointerCancel={handlePointerLeave}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onKeyDown={handleKeyDown}
          aria-label="Acquire signal and open login screen"
          aria-expanded={opened}
        >
          <span className="lock-ring" aria-hidden="true">
            <svg viewBox="0 0 100 100" focusable="false">
              <circle className="ring-track" cx="50" cy="50" r="48" />
              <circle className="ring-progress" cx="50" cy="50" r="48" onAnimationEnd={completeCharge} />
            </svg>
          </span>
          <span className="orb-core" aria-hidden="true">
            <span className="ball-skin ball-basketball">
              <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                <path d="M50 -6 C44 18 44 82 50 106" fill="none" stroke="rgba(32,18,8,0.78)" strokeWidth="3.4" strokeLinecap="round" />
                <path d="M-6 50 C18 44 82 44 106 50" fill="none" stroke="rgba(32,18,8,0.76)" strokeWidth="3.4" strokeLinecap="round" />
                <path d="M18 2 C34 22 34 78 18 98" fill="none" stroke="rgba(32,18,8,0.72)" strokeWidth="3" strokeLinecap="round" />
                <path d="M82 2 C66 22 66 78 82 98" fill="none" stroke="rgba(32,18,8,0.72)" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
            <span className="ball-skin ball-baseball">
              <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                <path d="M28 -6 C10 22 10 78 28 106" fill="none" stroke="rgba(176,26,39,0.92)" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M72 -6 C90 22 90 78 72 106" fill="none" stroke="rgba(176,26,39,0.92)" strokeWidth="2.6" strokeLinecap="round" />
                {Array.from({ length: 8 }).map((_, index) => {
                  const y = 16 + index * 9.6
                  const leftX = 24 - Math.sin((index / 7) * Math.PI) * 6
                  const rightX = 76 + Math.sin((index / 7) * Math.PI) * 6
                  return (
                    <g key={`stitch-${index}`}>
                      <path d={`M${leftX.toFixed(1)} ${y.toFixed(1)} l-5.8 -3.6`} stroke="rgba(176,26,39,0.86)" strokeWidth="1.7" strokeLinecap="round" />
                      <path d={`M${leftX.toFixed(1)} ${(y + 2.6).toFixed(1)} l-5.8 3.6`} stroke="rgba(176,26,39,0.86)" strokeWidth="1.7" strokeLinecap="round" />
                      <path d={`M${rightX.toFixed(1)} ${y.toFixed(1)} l5.8 -3.6`} stroke="rgba(176,26,39,0.86)" strokeWidth="1.7" strokeLinecap="round" />
                      <path d={`M${rightX.toFixed(1)} ${(y + 2.6).toFixed(1)} l5.8 3.6`} stroke="rgba(176,26,39,0.86)" strokeWidth="1.7" strokeLinecap="round" />
                    </g>
                  )
                })}
              </svg>
            </span>
            <span className="ball-skin ball-soccer">
              <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                <defs>
                  <clipPath id="soccerOrbClip">
                    <circle cx="50" cy="50" r="50" />
                  </clipPath>
                </defs>
                <g clipPath="url(#soccerOrbClip)">
                  <path d="M50 30 L67.1 42.4 L60.6 62.6 L39.4 62.6 L32.9 42.4 Z" fill="rgba(4,7,8,0.96)" stroke="rgba(0,0,0,0.96)" strokeWidth="1.15" strokeLinejoin="round" />
                  <path d="M50 30 L50 7 M67.1 42.4 L90 34.5 M60.6 62.6 L73.8 82.8 M39.4 62.6 L26.2 82.8 M32.9 42.4 L10 34.5" fill="none" stroke="rgba(5,8,9,0.84)" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M39.4 62.6 L26.2 82.8 L45.2 99.5 M60.6 62.6 L73.8 82.8 L54.8 99.5 M32.9 42.4 L10 34.5 L-1 51.5 M67.1 42.4 L90 34.5 L101 51.5" fill="none" stroke="rgba(5,8,9,0.40)" strokeWidth="1.55" strokeLinecap="round" />
                  <polygon points="50,5 64,15.2 58.7,31.7 41.3,31.7 36,15.2" fill="rgba(4,7,8,0.92)" stroke="rgba(0,0,0,0.92)" strokeWidth="0.9" strokeLinejoin="round" />
                  <polygon points="89.5,31 99.5,45 90.2,60.3 72.8,55.6 72.1,38.3" fill="rgba(4,7,8,0.90)" stroke="rgba(0,0,0,0.90)" strokeWidth="0.9" strokeLinejoin="round" />
                  <polygon points="74.5,82.5 68.6,98.9 51.2,99.4 45.4,83 59.2,72.1" fill="rgba(4,7,8,0.88)" stroke="rgba(0,0,0,0.88)" strokeWidth="0.9" strokeLinejoin="round" />
                  <polygon points="25.5,82.5 31.4,98.9 48.8,99.4 54.6,83 40.8,72.1" fill="rgba(4,7,8,0.88)" stroke="rgba(0,0,0,0.88)" strokeWidth="0.9" strokeLinejoin="round" />
                  <polygon points="10.5,31 0.5,45 9.8,60.3 27.2,55.6 27.9,38.3" fill="rgba(4,7,8,0.90)" stroke="rgba(0,0,0,0.90)" strokeWidth="0.9" strokeLinejoin="round" />
                  <path d="M41.3 31.7 L32.9 42.4 L27.9 38.3 M58.7 31.7 L67.1 42.4 L72.1 38.3 M72.8 55.6 L60.6 62.6 L59.2 72.1 M40.8 72.1 L39.4 62.6 L27.2 55.6 M45.4 83 L39.4 62.6 M54.6 83 L60.6 62.6" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1.05" strokeLinecap="round" />
                </g>
              </svg>
            </span>
            <span className="orb-shine" />
          </span>
          <span className="orb-label" aria-hidden="true">
            <strong>{phase === 'locked' || phase === 'open' ? 'Locked' : phase === 'charging' ? 'Hold' : 'Acquire'}</strong>
            <span className="charge-label">{phase === 'locked' || phase === 'open' ? 'Signal locked' : phase === 'charging' ? 'Locking…' : 'Hold to acquire signal'}</span>
          </span>
        </button>

        <div className="orb-copy" aria-hidden={opened}>
          <p className="orb-kicker">AI Athlete Intelligence</p>
          <h1 className="orb-title">Every edge. One signal.</h1>
          <p className="orb-subtitle">A cinematic intelligence room for live player context, movement, rotation shifts, and matchup reads before the board settles.</p>
          <div className="orb-chips">
            {signalChips.map(chip => <span className="orb-chip" key={chip}>{chip}</span>)}
          </div>
        </div>

        {opened && (
          <section className="auth-panel">
            <div className="auth-head">
              <div className="auth-logo-shell">
                <div className="auth-logo">
                  <img src="/brand/ai-athlete-intelligence-logo.png?v=transparent-20260525" alt="AI Athlete Intelligence" />
                </div>
              </div>
              <p className="auth-eyebrow">{eyebrow}</p>
              <h2 className="auth-title">{title}</h2>
              <p className="auth-subtitle">{subtitle}</p>
            </div>
            <div className="auth-body">{children}</div>
            <p className="auth-access-note">Premium access only · secured member entry</p>
            <button className="auth-reset" type="button" onClick={resetPortal}>Return to signal lock</button>
          </section>
        )}
      </section>
    </main>
  )
}
