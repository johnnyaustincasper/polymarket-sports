'use client'

import { useState } from 'react'

type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

const signalChips = ['Premium access', 'Live reads', 'Player edge']

export default function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  const [opened, setOpened] = useState(false)

  return (
    <main className={`auth-shell ${opened ? 'auth-opened' : ''}`}>
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
            radial-gradient(circle at 50% 45%, rgba(125,246,255,0.12), transparent 31%),
            radial-gradient(circle at 16% 18%, rgba(47,255,185,0.10), transparent 26%),
            radial-gradient(circle at 82% 22%, rgba(38,170,255,0.14), transparent 30%),
            radial-gradient(circle at 70% 84%, rgba(125,246,255,0.08), transparent 28%),
            linear-gradient(180deg, #020a0a 0%, #000404 48%, #000 100%);
        }
        .auth-shell *, .auth-shell *::before, .auth-shell *::after { box-sizing: border-box; }
        .space-layer,
        .star-field,
        .nebula-field,
        .frequency-grid,
        .scan-haze,
        .cosmic-vignette {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }
        .star-field {
          z-index: -8;
          opacity: 0.62;
          background-image:
            radial-gradient(circle, rgba(247,255,240,0.92) 0 1px, transparent 1.55px),
            radial-gradient(circle, rgba(125,246,255,0.78) 0 1px, transparent 1.75px),
            radial-gradient(circle, rgba(47,255,185,0.66) 0 1px, transparent 1.6px),
            radial-gradient(circle, rgba(255,255,255,0.45) 0 0.7px, transparent 1.2px);
          background-size: 180px 230px, 290px 260px, 360px 310px, 110px 130px;
          background-position: 8% 18%, 84% 20%, 50% 82%, 30% 42%;
          animation: starDrift 22s linear infinite;
        }
        .nebula-field {
          z-index: -7;
          opacity: 0.88;
          background:
            radial-gradient(ellipse at 50% 52%, rgba(125,246,255,0.20), transparent 30%),
            radial-gradient(ellipse at 38% 42%, rgba(47,255,185,0.12), transparent 26%),
            radial-gradient(ellipse at 62% 38%, rgba(38,170,255,0.16), transparent 28%);
          filter: blur(26px) saturate(1.2);
          animation: nebulaBreathe 7.2s ease-in-out infinite;
        }
        .frequency-grid {
          z-index: -6;
          opacity: 0.40;
          background-image:
            linear-gradient(rgba(125,246,255,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(125,246,255,0.045) 1px, transparent 1px),
            radial-gradient(circle at 50% 50%, transparent 0 21%, rgba(125,246,255,0.07) 21.2% 21.5%, transparent 21.8% 35%, rgba(125,246,255,0.05) 35.2% 35.5%, transparent 35.8% 52%, rgba(47,255,185,0.04) 52.2% 52.5%, transparent 52.8%);
          background-size: 54px 54px, 54px 54px, 900px 900px;
          background-position: center;
          mask-image: radial-gradient(circle at 50% 50%, black 0%, transparent 74%);
          animation: gridPulse 5s ease-in-out infinite;
        }
        .scan-haze {
          z-index: 8;
          opacity: 0.25;
          mix-blend-mode: screen;
          background:
            repeating-linear-gradient(180deg, rgba(255,255,255,0.038) 0 1px, transparent 1px 5px),
            linear-gradient(180deg, transparent 0%, rgba(125,246,255,0.07) 47%, transparent 54%);
          background-size: auto, 100% 310px;
          animation: scanFall 5.8s linear infinite;
        }
        .cosmic-vignette {
          z-index: 9;
          background:
            radial-gradient(circle at 50% 50%, transparent 0 32%, rgba(0,0,0,0.36) 72%, rgba(0,0,0,0.82) 100%),
            linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.66));
        }
        .orb-stage {
          position: relative;
          z-index: 10;
          width: min(100%, 980px);
          min-height: min(740px, calc(100dvh - 44px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
          display: grid;
          place-items: center;
        }
        .orb-copy {
          position: absolute;
          z-index: 12;
          left: 50%;
          top: calc(50% + min(31vw, 190px));
          transform: translateX(-50%);
          width: min(92vw, 520px);
          text-align: center;
          display: grid;
          gap: 10px;
          transition: opacity 520ms ease, transform 620ms ease, filter 620ms ease;
        }
        .auth-opened .orb-copy {
          opacity: 0;
          transform: translateX(-50%) translateY(28px) scale(0.94);
          filter: blur(8px);
          pointer-events: none;
        }
        .orb-kicker {
          margin: 0;
          color: rgba(125,246,255,0.92);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.24em;
          text-transform: uppercase;
        }
        .orb-title {
          margin: 0;
          font-size: clamp(28px, 5.6vw, 58px);
          line-height: 0.88;
          letter-spacing: -0.075em;
          text-transform: uppercase;
          text-wrap: balance;
          text-shadow: 0 0 34px rgba(125,246,255,0.24), 0 22px 54px rgba(0,0,0,0.76);
        }
        .orb-subtitle {
          margin: 0 auto;
          max-width: 430px;
          color: rgba(226,255,204,0.68);
          font-size: 13px;
          line-height: 1.45;
        }
        .orb-chips {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 2px;
        }
        .orb-chip {
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(125,246,255,0.18);
          background: rgba(125,246,255,0.055);
          color: rgba(247,255,240,0.82);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          box-shadow: 0 0 26px rgba(125,246,255,0.06) inset;
        }
        .liquid-orb-button {
          position: relative;
          z-index: 14;
          width: clamp(245px, 42vw, 438px);
          aspect-ratio: 1;
          border: 0;
          border-radius: 999px;
          padding: 0;
          cursor: pointer;
          color: inherit;
          background: transparent;
          transform: translateY(-38px) scale(1);
          transition: transform 900ms cubic-bezier(.15,.88,.2,1), opacity 560ms ease, filter 740ms ease;
          filter: none;
          -webkit-tap-highlight-color: transparent;
        }
        .liquid-orb-button:hover { transform: translateY(-42px) scale(1.025); }
        .liquid-orb-button:focus-visible { outline: 2px solid rgba(125,246,255,0.88); outline-offset: 18px; }
        .auth-opened .liquid-orb-button {
          transform: translateY(-20px) scale(4.25);
          opacity: 0;
          filter: blur(18px);
          pointer-events: none;
          transition-duration: 1050ms;
        }
        .orb-rings,
        .orb-rings::before,
        .orb-rings::after {
          position: absolute;
          inset: -18%;
          border-radius: 999px;
          border: 1px solid rgba(125,246,255,0.18);
          box-shadow: 0 0 42px rgba(125,246,255,0.12) inset, 0 0 46px rgba(47,255,185,0.08);
          animation: soundRing 1.72s ease-out infinite;
        }
        .orb-rings::before,
        .orb-rings::after { content: ''; inset: -12%; }
        .orb-rings::before { animation-delay: 0.38s; }
        .orb-rings::after { animation-delay: 0.78s; }
        .orb-aura {
          position: absolute;
          inset: -46%;
          border-radius: 999px;
          background:
            radial-gradient(circle at 50% 50%, rgba(125,246,255,0.38), rgba(38,170,255,0.18) 28%, rgba(47,255,185,0.10) 43%, transparent 68%),
            radial-gradient(circle at 50% 50%, rgba(125,246,255,0.18), transparent 76%);
          filter: blur(30px) saturate(1.35);
          opacity: 0.78;
          transform: translateZ(0);
          animation: auraBreathe 1.42s cubic-bezier(.32,.02,.21,1) infinite;
        }
        .orb-sonic-shell {
          position: absolute;
          inset: -7%;
          border-radius: 43% 57% 52% 48% / 50% 44% 56% 50%;
          pointer-events: none;
          background:
            repeating-conic-gradient(from 0deg, rgba(255,255,255,0.0) 0 5deg, rgba(255,255,255,0.20) 6deg, rgba(125,246,255,0.10) 7deg, transparent 9deg),
            repeating-radial-gradient(circle at 50% 50%, transparent 0 12px, rgba(125,246,255,0.18) 13px, transparent 15px);
          filter: blur(0.4px) url(#orb-wobble-soft);
          opacity: 0.64;
          mix-blend-mode: screen;
          -webkit-mask-image: radial-gradient(circle, transparent 0 42%, black 53%, transparent 74%);
          mask-image: radial-gradient(circle, transparent 0 42%, black 53%, transparent 74%);
          animation: sonicSqueeze 620ms linear infinite;
        }
        .orb-core {
          position: absolute;
          inset: 1%;
          border-radius: 44% 56% 52% 48% / 48% 45% 55% 52%;
          overflow: hidden;
          background:
            radial-gradient(circle at 36% 27%, rgba(255,255,255,0.96) 0 5%, rgba(255,255,255,0.22) 11%, transparent 22%),
            radial-gradient(circle at 28% 72%, rgba(47,255,185,0.58), transparent 24%),
            radial-gradient(circle at 72% 28%, rgba(38,170,255,0.72), transparent 31%),
            repeating-radial-gradient(ellipse at 48% 54%, rgba(255,255,255,0.15) 0 1px, rgba(125,246,255,0.04) 2px, transparent 7px, transparent 15px),
            radial-gradient(circle at 54% 58%, rgba(125,246,255,0.82), rgba(24,145,190,0.58) 35%, rgba(4,23,29,0.92) 72%),
            linear-gradient(135deg, #7df6ff, #26aaff 48%, #2fffb9 100%);
          background-size: 100% 100%, 130% 130%, 120% 120%, 112% 112%, 100% 100%, 100% 100%;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.20) inset,
            0 0 48px rgba(125,246,255,0.58) inset,
            -24px -24px 70px rgba(255,255,255,0.12) inset,
            24px 30px 80px rgba(0,0,0,0.52) inset,
            0 0 70px rgba(125,246,255,0.48),
            0 0 140px rgba(38,170,255,0.22);
          filter: url(#orb-liquid-surface) saturate(1.18) contrast(1.04);
          animation:
            heartBeat 1.42s cubic-bezier(.32,.02,.21,1) infinite,
            liquidMorph 1.24s linear infinite,
            liquidCaustics 2.8s ease-in-out infinite;
          transform-origin: 50% 54%;
        }
        .orb-core::before {
          content: '';
          position: absolute;
          inset: -24%;
          border-radius: inherit;
          background:
            repeating-radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.14) 0 1px, transparent 1px 5px),
            repeating-linear-gradient(92deg, transparent 0 6px, rgba(255,255,255,0.16) 7px, transparent 9px),
            conic-gradient(from 20deg, rgba(255,255,255,0.0), rgba(255,255,255,0.34), rgba(47,255,185,0.23), rgba(38,170,255,0.26), rgba(255,255,255,0.0));
          filter: blur(0.45px) contrast(1.2) url(#orb-wobble-soft);
          mix-blend-mode: overlay;
          animation: waterAgitation 520ms linear infinite;
        }
        .orb-core::after {
          content: '';
          position: absolute;
          inset: 8%;
          border-radius: 48% 52% 44% 56% / 56% 43% 57% 44%;
          background:
            linear-gradient(115deg, transparent 0 24%, rgba(255,255,255,0.30) 35%, transparent 46%),
            radial-gradient(ellipse at 50% 10%, rgba(255,255,255,0.46), transparent 34%),
            radial-gradient(ellipse at 50% 95%, rgba(0,0,0,0.36), transparent 42%);
          opacity: 0.82;
          mix-blend-mode: soft-light;
          animation: innerTide 2.15s ease-in-out infinite alternate;
        }
        .orb-frequency {
          position: absolute;
          inset: 1%;
          border-radius: 999px;
          overflow: visible;
          opacity: 0.76;
          mix-blend-mode: screen;
          -webkit-mask-image: radial-gradient(circle, black 0 56%, rgba(0,0,0,0.72) 64%, transparent 74%);
          mask-image: radial-gradient(circle, black 0 56%, rgba(0,0,0,0.72) 64%, transparent 74%);
        }
        .orb-frequency::before,
        .orb-frequency::after {
          content: '';
          position: absolute;
          inset: -20%;
          background:
            repeating-linear-gradient(90deg, transparent 0 11px, rgba(255,255,255,0.23) 12px, transparent 14px),
            repeating-linear-gradient(0deg, transparent 0 17px, rgba(125,246,255,0.16) 18px, transparent 21px);
          filter: url(#orb-wobble);
          animation: frequencyShake 340ms linear infinite;
        }
        .orb-frequency::after {
          opacity: 0.58;
          transform: rotate(24deg) scale(1.12);
          animation-duration: 260ms;
          animation-direction: reverse;
        }
        .orb-label {
          position: absolute;
          z-index: 3;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: grid;
          gap: 7px;
          justify-items: center;
          text-align: center;
          pointer-events: none;
          text-transform: uppercase;
          text-shadow: 0 0 24px rgba(0,0,0,0.82);
        }
        .orb-label strong {
          font-size: clamp(13px, 2.1vw, 19px);
          line-height: 1;
          letter-spacing: 0.24em;
          font-weight: 1000;
        }
        .orb-label span {
          color: rgba(255,255,255,0.72);
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.20em;
        }
        .auth-panel {
          position: absolute;
          z-index: 15;
          width: min(100%, 464px);
          max-height: calc(100dvh - 44px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 34px;
          border: 1px solid rgba(125,246,255,0.24);
          background:
            linear-gradient(180deg, rgba(8,24,24,0.84), rgba(1,5,5,0.96)),
            rgba(0,0,0,0.88);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.05) inset,
            0 0 86px rgba(125,246,255,0.18),
            0 36px 120px rgba(0,0,0,0.90);
          padding: 22px;
          backdrop-filter: blur(30px) saturate(1.18);
          opacity: 0;
          transform: scale(0.76) translateY(26px);
          filter: blur(18px);
          pointer-events: none;
          transition: opacity 620ms ease 380ms, transform 780ms cubic-bezier(.16,.86,.19,1) 360ms, filter 720ms ease 360ms;
        }
        .auth-opened .auth-panel {
          opacity: 1;
          transform: scale(1) translateY(0);
          filter: blur(0);
          pointer-events: auto;
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
          width: min(100%, 188px);
          margin: 0 auto 12px;
          padding: 7px 13px 5px;
          border-radius: 25px;
          overflow: hidden;
          border: 1px solid rgba(125,246,255,0.14);
          background: linear-gradient(180deg, rgba(125,246,255,0.095), rgba(125,246,255,0.016));
          box-shadow: 0 20px 54px rgba(0,0,0,0.38), 0 0 42px rgba(125,246,255,0.10);
        }
        .auth-logo-shell::before {
          content: '';
          position: absolute;
          inset: -44%;
          background: conic-gradient(from 0deg, transparent, rgba(125,246,255,0.28), transparent 28% 100%);
          animation: authLogoSweep 3.8s linear infinite;
        }
        .auth-logo-shell::after {
          content: '';
          position: absolute;
          inset: 1px;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(3,12,12,0.78), rgba(1,4,4,0.92));
        }
        .auth-logo { position: relative; z-index: 1; width: 118px; height: 118px; border-radius: 0; margin: 0 auto; overflow: visible; border: 0; background: transparent; box-shadow: none; }
        .auth-logo img { width: 100%; height: 100%; object-fit: contain; display: block; filter: drop-shadow(0 0 18px rgba(125,246,255,0.18)); }
        .auth-eyebrow { color: #7df6ff; font-weight: 950; font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; margin: 0; }
        .auth-title { margin: 8px 0 7px; font-size: clamp(30px, 7vw, 43px); line-height: 0.92; letter-spacing: -0.07em; text-transform: uppercase; text-wrap: balance; }
        .auth-subtitle { margin: 0 auto; max-width: 350px; color: rgba(226,255,204,0.70); font-size: 13px; line-height: 1.45; }
        .auth-body { display: grid; gap: 14px; position: relative; z-index: 1; }
        .auth-access-note {
          margin: 12px 0 0;
          text-align: center;
          color: rgba(226,255,204,0.42);
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
        @keyframes authLogoSweep { to { transform: rotate(360deg); } }
        @keyframes starDrift { from { background-position: 8% 18%, 84% 20%, 50% 82%, 30% 42%; } to { background-position: 8% -82%, 84% -80%, 50% -18%, 30% -58%; } }
        @keyframes nebulaBreathe { 0%, 100% { transform: scale(1); opacity: 0.72; filter: blur(28px) saturate(1.12); } 48% { transform: scale(1.08); opacity: 1; filter: blur(18px) saturate(1.42); } }
        @keyframes gridPulse { 0%, 100% { transform: scale(1); opacity: 0.25; } 50% { transform: scale(1.05); opacity: 0.50; } }
        @keyframes scanFall { from { background-position: 0 0, 0 -310px; } to { background-position: 0 0, 0 310px; } }
        @keyframes heartBeat { 0%, 100% { transform: scale(1); } 10% { transform: scale(1.045); } 18% { transform: scale(0.985); } 29% { transform: scale(1.075); } 43% { transform: scale(1); } }
        @keyframes auraBreathe { 0%, 100% { transform: scale(0.94); opacity: 0.50; } 10% { transform: scale(1.06); opacity: 0.88; } 18% { transform: scale(0.98); opacity: 0.64; } 29% { transform: scale(1.12); opacity: 0.92; } 48% { transform: scale(1); opacity: 0.70; } }
        @keyframes liquidMorph { 0%, 100% { border-radius: 44% 56% 52% 48% / 48% 45% 55% 52%; } 12% { border-radius: 48% 52% 44% 56% / 42% 58% 46% 54%; } 25% { border-radius: 58% 42% 46% 54% / 54% 43% 57% 46%; } 37% { border-radius: 43% 57% 59% 41% / 58% 50% 50% 42%; } 50% { border-radius: 54% 46% 42% 58% / 45% 61% 39% 55%; } 63% { border-radius: 49% 51% 62% 38% / 62% 38% 53% 47%; } 75% { border-radius: 61% 39% 49% 51% / 46% 54% 44% 56%; } 88% { border-radius: 42% 58% 54% 46% / 51% 41% 59% 49%; } }
        @keyframes sonicSqueeze { 0% { transform: scaleX(1.03) scaleY(0.97) rotate(0deg); border-radius: 43% 57% 52% 48% / 50% 44% 56% 50%; opacity: 0.38; } 25% { transform: scaleX(0.96) scaleY(1.05) rotate(0.8deg); border-radius: 57% 43% 44% 56% / 41% 59% 47% 53%; opacity: 0.70; } 50% { transform: scaleX(1.06) scaleY(0.95) rotate(-0.9deg); border-radius: 48% 52% 60% 40% / 57% 43% 55% 45%; opacity: 0.48; } 75% { transform: scaleX(0.98) scaleY(1.04) rotate(0.5deg); border-radius: 61% 39% 48% 52% / 47% 53% 42% 58%; opacity: 0.76; } 100% { transform: scaleX(1.03) scaleY(0.97) rotate(0deg); border-radius: 43% 57% 52% 48% / 50% 44% 56% 50%; opacity: 0.38; } }
        @keyframes liquidCaustics { 0%, 100% { background-position: 0% 0%, 0% 0%, 0% 0%, 50% 48%, 50% 50%, 0% 0%; } 50% { background-position: 0% 0%, 18% 12%, -14% 18%, 45% 58%, 52% 48%, 0% 0%; } }
        @keyframes waterAgitation { from { transform: translate3d(-2%, -1%, 0) rotate(0deg) scale(1.06); } to { transform: translate3d(2%, 1%, 0) rotate(360deg) scale(1.11); } }
        @keyframes innerTide { from { transform: translate3d(-3%, 2%, 0) rotate(-6deg) scale(1.02); opacity: 0.62; } to { transform: translate3d(4%, -2%, 0) rotate(8deg) scale(1.10); opacity: 0.9; } }
        @keyframes frequencyShake { 0% { transform: translateX(-10px) translateY(0) skewX(-4deg); } 25% { transform: translateX(8px) translateY(-5px) skewX(5deg); } 50% { transform: translateX(-5px) translateY(6px) skewX(-7deg); } 75% { transform: translateX(11px) translateY(2px) skewX(4deg); } 100% { transform: translateX(-10px) translateY(0) skewX(-4deg); } }
        @keyframes soundRing { 0% { transform: scale(0.72); opacity: 0.62; } 64%, 100% { transform: scale(1.24); opacity: 0; } }

        @media (max-width: 560px) {
          .auth-shell { padding: calc(env(safe-area-inset-top) + 10px) 10px calc(env(safe-area-inset-bottom) + 10px); }
          .orb-stage { min-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }
          .liquid-orb-button { width: clamp(230px, 72vw, 318px); transform: translateY(-58px); }
          .liquid-orb-button:hover { transform: translateY(-58px) scale(1.012); }
          .auth-opened .liquid-orb-button { transform: translateY(-28px) scale(4.4); }
          .orb-copy { top: calc(50% + min(42vw, 170px)); }
          .orb-title { font-size: clamp(28px, 10vw, 40px); }
          .orb-subtitle { font-size: 12px; max-width: 310px; }
          .auth-panel {
            width: 100%;
            max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
            border-radius: 30px;
            padding: 15px;
          }
          .auth-logo-shell { width: 164px; padding: 6px 12px 4px; border-radius: 23px; margin-bottom: 10px; }
          .auth-logo-shell::after { border-radius: 22px; }
          .auth-logo { width: 108px; height: 108px; }
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
          .auth-panel, .liquid-orb-button, .orb-copy { transition-duration: 0.001ms !important; }
        }
      `}</style>
      <svg width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="orb-liquid-surface" x="-70%" y="-70%" width="240%" height="240%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.085" numOctaves="3" seed="21" result="liquidNoise">
            <animate attributeName="baseFrequency" dur="1.05s" values="0.018 0.085;0.032 0.155;0.020 0.105;0.040 0.190;0.018 0.085" repeatCount="indefinite" />
            <animate attributeName="seed" dur="0.7s" values="21;29;34;41;21" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="liquidNoise" scale="18" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" dur="1.42s" values="10;26;14;34;12;10" keyTimes="0;0.10;0.18;0.29;0.43;1" repeatCount="indefinite" />
          </feDisplacementMap>
        </filter>
        <filter id="orb-wobble" x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.12" numOctaves="2" seed="8" result="noise">
            <animate attributeName="baseFrequency" dur="0.48s" values="0.018 0.12;0.035 0.28;0.022 0.18;0.042 0.34;0.018 0.12" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" dur="0.62s" values="10;28;15;32;10" repeatCount="indefinite" />
          </feDisplacementMap>
        </filter>
        <filter id="orb-wobble-soft" x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.024 0.18" numOctaves="2" seed="13" result="softNoise">
            <animate attributeName="baseFrequency" dur="0.52s" values="0.024 0.18;0.045 0.30;0.020 0.20;0.052 0.36;0.024 0.18" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="10" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" dur="0.58s" values="6;16;9;20;6" repeatCount="indefinite" />
          </feDisplacementMap>
        </filter>
      </svg>
      <div className="star-field" />
      <div className="nebula-field" />
      <div className="frequency-grid" />
      <div className="scan-haze" />
      <div className="cosmic-vignette" />
      <section className="orb-stage" aria-label="Athlete Intelligence access portal">
        <button
          type="button"
          className="liquid-orb-button"
          onClick={() => setOpened(true)}
          aria-label="Open login screen"
          aria-expanded={opened}
        >
          <span className="orb-aura" aria-hidden="true" />
          <span className="orb-rings" aria-hidden="true" />
          <span className="orb-sonic-shell" aria-hidden="true" />
          <span className="orb-core" aria-hidden="true" />
          <span className="orb-frequency" aria-hidden="true" />
          <span className="orb-label" aria-hidden="true">
            <strong>Open</strong>
            <span>Tap the signal</span>
          </span>
        </button>

        <div className="orb-copy" aria-hidden={opened}>
          <p className="orb-kicker">AI Athlete Intelligence</p>
          <h1 className="orb-title">Touch the edge</h1>
          <p className="orb-subtitle">A liquid signal core tuned to premium player context, movement, and matchup intelligence.</p>
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
            <button className="auth-reset" type="button" onClick={() => setOpened(false)}>Return to orb</button>
          </section>
        )}
      </section>
    </main>
  )
}
