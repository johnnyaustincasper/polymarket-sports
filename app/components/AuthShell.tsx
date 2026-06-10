type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

const intelligenceChips = ['Live signal movement', 'Player-specific context', 'Lineup + fatigue reads']
const terminalRows = [
  { label: 'PROP SIGNAL', value: 'movement detected' },
  { label: 'ROTATION WATCH', value: 'minutes volatility' },
  { label: 'MATCHUP LAYER', value: 'edge context ready' },
]

export default function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  return (
    <main className="auth-shell">
      <style>{`
        html, body { min-height: 100%; background: #020403; }
        .auth-shell {
          min-height: 100vh;
          min-height: 100svh;
          min-height: 100dvh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 50% -18%, rgba(125,246,255,0.28), transparent 32%),
            radial-gradient(circle at 88% 12%, rgba(38,170,255,0.16), transparent 28%),
            radial-gradient(circle at 8% 90%, rgba(47,255,185,0.13), transparent 30%),
            linear-gradient(180deg, #06120f 0%, #020605 48%, #000 100%);
          color: #f7fff0;
          padding: max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom));
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
          isolation: isolate;
        }
        .auth-shell *, .auth-shell *::before, .auth-shell *::after { box-sizing: border-box; }
        .auth-noise,
        .auth-grid-bg,
        .auth-scanlines,
        .auth-scanner-blade,
        .auth-radar,
        .auth-particles,
        .auth-spotlight,
        .auth-shell::before,
        .auth-shell::after {
          position: fixed;
          inset: 0;
          pointer-events: none;
        }
        .auth-shell::before {
          content: '';
          z-index: -5;
          background:
            linear-gradient(115deg, transparent 0 38%, rgba(125,246,255,0.09) 41%, transparent 44% 100%),
            linear-gradient(245deg, transparent 0 54%, rgba(38,170,255,0.08) 57%, transparent 60% 100%);
          background-size: 220% 220%, 260% 260%;
          animation: authBeams 9s ease-in-out infinite alternate;
        }
        .auth-shell::after {
          content: '';
          z-index: 6;
          height: 44%;
          top: auto;
          background: linear-gradient(180deg, transparent, rgba(0,0,0,0.84));
        }
        .auth-grid-bg {
          z-index: -4;
          opacity: 0.72;
          background-image:
            linear-gradient(rgba(125,246,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(125,246,255,0.05) 1px, transparent 1px),
            linear-gradient(rgba(125,246,255,0.10) 1px, transparent 1px),
            linear-gradient(90deg, rgba(125,246,255,0.10) 1px, transparent 1px);
          background-size: 42px 42px, 42px 42px, 168px 168px, 168px 168px;
          transform: perspective(820px) rotateX(58deg) translateY(7%);
          transform-origin: 50% 68%;
          mask-image: linear-gradient(180deg, transparent 0%, black 22%, black 72%, transparent 100%);
          animation: authGridDrift 12s linear infinite;
        }
        .auth-scanlines {
          z-index: 5;
          opacity: 0.42;
          background:
            repeating-linear-gradient(180deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 5px),
            linear-gradient(180deg, transparent 0%, rgba(125,246,255,0.08) 48%, transparent 52%);
          background-size: auto, 100% 280px;
          mix-blend-mode: screen;
          animation: authScan 4.8s linear infinite;
        }
        .auth-scanner-blade {
          z-index: 3;
          inset: -30% -20%;
          background:
            linear-gradient(100deg, transparent 0 43%, rgba(125,246,255,0.0) 46%, rgba(125,246,255,0.20) 49%, rgba(47,255,185,0.10) 50%, rgba(125,246,255,0.0) 54%, transparent 58% 100%);
          filter: blur(0.2px);
          opacity: 0.72;
          mix-blend-mode: screen;
          transform: translateX(-55%) skewX(-14deg);
          animation: authScannerBlade 5.4s cubic-bezier(.7,0,.2,1) infinite;
        }
        .auth-noise {
          z-index: 4;
          opacity: 0.16;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 260 260' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.65'/%3E%3C/svg%3E");
        }
        .auth-spotlight {
          z-index: -3;
          background: radial-gradient(circle at var(--mx, 50%) var(--my, 42%), rgba(125,246,255,0.16), transparent 35%);
          animation: authSpotlight 8s ease-in-out infinite alternate;
        }
        .auth-radar {
          z-index: -2;
          inset: auto auto 4% 50%;
          width: min(86vw, 640px);
          height: min(86vw, 640px);
          transform: translateX(-50%);
          border-radius: 999px;
          border: 1px solid rgba(125,246,255,0.09);
          background:
            conic-gradient(from 0deg, rgba(125,246,255,0.0), rgba(125,246,255,0.18), rgba(125,246,255,0.0) 22%),
            radial-gradient(circle, transparent 0 28%, rgba(125,246,255,0.10) 28.4% 28.8%, transparent 29.2% 47%, rgba(125,246,255,0.08) 47.4% 47.8%, transparent 48.2% 68%, rgba(125,246,255,0.06) 68.4% 68.8%, transparent 69.2%);
          filter: blur(0.2px);
          opacity: 0.72;
          mask-image: linear-gradient(180deg, transparent 0%, black 35%, transparent 100%);
          animation: authRadarSpin 8s linear infinite;
        }
        .auth-particles {
          z-index: -1;
          background-image:
            radial-gradient(circle, rgba(125,246,255,0.9) 0 1px, transparent 1.7px),
            radial-gradient(circle, rgba(47,255,185,0.8) 0 1px, transparent 1.9px),
            radial-gradient(circle, rgba(255,255,255,0.72) 0 1px, transparent 1.6px);
          background-size: 190px 230px, 260px 210px, 310px 280px;
          background-position: 12% 18%, 88% 28%, 52% 80%;
          opacity: 0.28;
          animation: authParticles 10s linear infinite;
        }
        .auth-frame {
          position: relative;
          z-index: 10;
          width: min(100%, 1120px);
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(370px, 460px);
          gap: clamp(18px, 4vw, 58px);
          align-items: center;
        }
        .auth-intro {
          display: grid;
          gap: 22px;
          min-width: 0;
        }
        .auth-kicker {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          width: fit-content;
          color: rgba(125,246,255,0.92);
          font-size: 11px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          padding: 11px 13px;
          border: 1px solid rgba(125,246,255,0.22);
          border-radius: 999px;
          background: rgba(4,14,14,0.58);
          box-shadow: 0 0 34px rgba(125,246,255,0.08), 0 0 0 1px rgba(255,255,255,0.035) inset;
          backdrop-filter: blur(18px);
        }
        .auth-kicker::before {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #2fffb9;
          box-shadow: 0 0 18px #2fffb9;
          animation: authPulseDot 1.5s ease-in-out infinite;
        }
        .auth-hero-title {
          max-width: 740px;
          margin: 0;
          font-size: clamp(52px, 8vw, 104px);
          line-height: 0.83;
          letter-spacing: -0.085em;
          text-transform: uppercase;
          text-wrap: balance;
          filter: drop-shadow(0 18px 42px rgba(0,0,0,0.72));
        }
        .auth-hero-title .cyan {
          display: block;
          color: #7df6ff;
          text-shadow: 0 0 30px rgba(125,246,255,0.24);
        }
        .auth-hero-copy {
          max-width: 600px;
          margin: 0;
          color: rgba(226,255,204,0.72);
          font-size: clamp(16px, 2.4vw, 21px);
          line-height: 1.42;
          text-wrap: pretty;
        }
        .auth-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .auth-chip {
          position: relative;
          overflow: hidden;
          color: rgba(247,255,240,0.88);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          border: 1px solid rgba(125,246,255,0.18);
          border-radius: 999px;
          padding: 11px 12px;
          background: linear-gradient(180deg, rgba(125,246,255,0.10), rgba(125,246,255,0.025));
          box-shadow: 0 14px 42px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.035) inset;
        }
        .auth-chip::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-140%);
          background: linear-gradient(90deg, transparent, rgba(125,246,255,0.28), transparent);
          animation: authChipSlash 4.6s ease-in-out infinite;
          animation-delay: var(--delay, 0s);
        }
        .auth-terminal {
          width: min(100%, 560px);
          border: 1px solid rgba(125,246,255,0.16);
          border-radius: 30px;
          background: linear-gradient(180deg, rgba(4,16,17,0.70), rgba(1,4,4,0.82));
          box-shadow: 0 30px 100px rgba(0,0,0,0.58), 0 0 48px rgba(125,246,255,0.08);
          overflow: hidden;
          backdrop-filter: blur(24px);
        }
        .auth-terminal-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 13px 15px;
          border-bottom: 1px solid rgba(125,246,255,0.12);
          color: rgba(226,255,204,0.52);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .auth-dots { display: flex; gap: 7px; }
        .auth-dots i { display: block; width: 8px; height: 8px; border-radius: 999px; background: rgba(125,246,255,0.32); }
        .auth-dots i:first-child { background: #2fffb9; box-shadow: 0 0 18px rgba(47,255,185,0.72); }
        .auth-terminal-body { padding: 12px; display: grid; gap: 8px; }
        .auth-terminal-row {
          position: relative;
          display: grid;
          grid-template-columns: 0.76fr 1fr;
          gap: 10px;
          align-items: center;
          min-height: 42px;
          padding: 10px 12px;
          border-radius: 17px;
          background: rgba(255,255,255,0.035);
          border: 1px solid rgba(255,255,255,0.055);
          overflow: hidden;
        }
        .auth-terminal-row::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(125,246,255,0.0), rgba(125,246,255,0.12), rgba(125,246,255,0.0));
          transform: translateX(-130%);
          animation: authRowSweep 3.9s ease-in-out infinite;
          animation-delay: var(--delay, 0s);
        }
        .auth-terminal-label,
        .auth-terminal-value { position: relative; z-index: 1; }
        .auth-terminal-label {
          color: rgba(125,246,255,0.84);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.14em;
        }
        .auth-terminal-value {
          color: rgba(247,255,240,0.76);
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .auth-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-height: calc(100dvh - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
          border-radius: 34px;
          border: 1px solid rgba(125,246,255,0.24);
          background:
            linear-gradient(180deg, rgba(8,24,24,0.83), rgba(1,4,4,0.95)),
            rgba(0,0,0,0.86);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.045) inset,
            0 0 84px rgba(125,246,255,0.16),
            0 34px 110px rgba(0,0,0,0.88);
          padding: 22px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          backdrop-filter: blur(28px) saturate(1.18);
        }
        .auth-card::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1px;
          background: conic-gradient(from var(--spin, 0deg), transparent, rgba(125,246,255,0.72), transparent 26%, transparent 72%, rgba(47,255,185,0.38), transparent);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          animation: authBorderSpin 6s linear infinite;
        }
        .auth-card::after {
          content: '';
          position: absolute;
          left: 18px;
          right: 18px;
          top: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(125,246,255,0.86), transparent);
          box-shadow: 0 0 24px rgba(125,246,255,0.58);
          animation: authTopFlash 2.8s ease-in-out infinite;
        }
        .auth-card::-webkit-scrollbar { width: 0; height: 0; }
        .auth-head { text-align: center; margin-bottom: 16px; position: relative; }
        .auth-logo-shell {
          position: relative;
          width: min(100%, 214px);
          margin: 0 auto 13px;
          padding: 9px 15px 7px;
          border-radius: 27px;
          background: linear-gradient(180deg, rgba(125,246,255,0.095), rgba(125,246,255,0.016));
          border: 1px solid rgba(125,246,255,0.14);
          box-shadow: 0 20px 54px rgba(0,0,0,0.38), 0 0 42px rgba(125,246,255,0.10);
          overflow: hidden;
        }
        .auth-logo-shell::before {
          content: '';
          position: absolute;
          inset: -42%;
          background: conic-gradient(from 0deg, transparent, rgba(125,246,255,0.28), transparent 26% 100%);
          animation: authLogoSweep 3.8s linear infinite;
        }
        .auth-logo-shell::after {
          content: '';
          position: absolute;
          inset: 1px;
          border-radius: 26px;
          background: linear-gradient(180deg, rgba(3,12,12,0.74), rgba(1,4,4,0.92));
        }
        .auth-logo { position: relative; z-index: 1; width: 142px; height: 142px; border-radius: 0; margin: 0 auto; overflow: visible; border: 0; background: transparent; box-shadow: none; }
        .auth-logo img { width: 100%; height: 100%; object-fit: contain; display: block; filter: drop-shadow(0 0 18px rgba(125,246,255,0.18)); }
        .auth-eyebrow { color: #7df6ff; font-weight: 950; font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; margin: 0; }
        .auth-title { margin: 8px 0 7px; font-size: clamp(32px, 7.2vw, 45px); line-height: 0.92; letter-spacing: -0.07em; text-transform: uppercase; text-wrap: balance; }
        .auth-subtitle { margin: 0 auto; max-width: 350px; color: rgba(226,255,204,0.68); font-size: 13px; line-height: 1.45; }
        .auth-mini-chips { display: none; }
        .auth-body { display: grid; gap: 14px; position: relative; z-index: 1; }
        .auth-access-note {
          margin: 2px 0 0;
          text-align: center;
          color: rgba(226,255,204,0.42);
          font-size: 10px;
          line-height: 1.35;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .auth-divider-label {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 2px 0;
          color: rgba(226,255,204,0.42);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .auth-divider-label::before,
        .auth-divider-label::after { content: ''; height: 1px; flex: 1; background: rgba(125,246,255,0.13); }
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
          position: relative !important;
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
        @keyframes authBeams { 0% { background-position: 0% 40%, 100% 20%; opacity: 0.65; } 100% { background-position: 100% 60%, 0% 80%; opacity: 1; } }
        @keyframes authGridDrift { from { background-position: 0 0, 0 0, 0 0, 0 0; } to { background-position: 0 42px, 42px 0, 0 168px, 168px 0; } }
        @keyframes authScan { from { background-position: 0 0, 0 -280px; } to { background-position: 0 0, 0 280px; } }
        @keyframes authScannerBlade { 0%, 42% { transform: translateX(-68%) skewX(-14deg); opacity: 0; } 50% { opacity: 0.85; } 68%, 100% { transform: translateX(68%) skewX(-14deg); opacity: 0; } }
        @keyframes authRadarSpin { to { transform: translateX(-50%) rotate(360deg); } }
        @keyframes authParticles { from { background-position: 12% 18%, 88% 28%, 52% 80%; } to { background-position: 12% -82%, 88% -72%, 52% -20%; } }
        @keyframes authSpotlight { 0% { --mx: 38%; --my: 22%; opacity: 0.74; } 100% { --mx: 68%; --my: 54%; opacity: 1; } }
        @keyframes authPulseDot { 0%, 100% { transform: scale(1); opacity: 0.72; } 50% { transform: scale(1.45); opacity: 1; } }
        @keyframes authLogoSweep { to { transform: rotate(360deg); } }
        @keyframes authChipSlash { 0%, 62% { transform: translateX(-140%); } 78%, 100% { transform: translateX(140%); } }
        @keyframes authRowSweep { 0%, 50% { transform: translateX(-130%); } 72%, 100% { transform: translateX(130%); } }
        @keyframes authTopFlash { 0%, 100% { opacity: 0.25; transform: scaleX(0.72); } 50% { opacity: 1; transform: scaleX(1); } }

        @media (max-width: 860px) {
          .auth-frame {
            display: flex;
            min-height: calc(100dvh - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
            align-items: center;
            justify-content: center;
          }
          .auth-intro { display: none; }
          .auth-card { max-width: 470px; }
          .auth-mini-chips {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 7px;
            margin: 12px auto 0;
          }
          .auth-mini-chips span {
            color: rgba(247,255,240,0.78);
            font-size: 8.5px;
            font-weight: 950;
            letter-spacing: 0.10em;
            text-transform: uppercase;
            border: 1px solid rgba(125,246,255,0.16);
            border-radius: 999px;
            padding: 7px 8px;
            background: rgba(125,246,255,0.055);
          }
        }

        @media (max-width: 480px) {
          .auth-shell {
            align-items: stretch;
            min-height: 100svh;
            min-height: 100dvh;
            padding: calc(env(safe-area-inset-top) + 8px) 10px calc(env(safe-area-inset-bottom) + 8px);
            overflow: hidden;
          }
          .auth-frame { min-height: calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }
          .auth-card {
            width: 100%;
            max-height: calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
            border-radius: 30px;
            padding: 15px;
            align-self: center;
            box-shadow: 0 0 54px rgba(125,246,255,0.13), 0 18px 58px rgba(0,0,0,0.75);
          }
          .auth-head { margin-bottom: 12px; }
          .auth-logo-shell { width: 164px; padding: 6px 12px 4px; border-radius: 23px; margin-bottom: 10px; }
          .auth-logo { width: 108px; height: 108px; }
          .auth-eyebrow { font-size: 8px; letter-spacing: 0.17em; }
          .auth-title { font-size: 31px; margin: 6px 0 5px; }
          .auth-subtitle { font-size: 12px; max-width: 310px; }
          .auth-body { gap: 10px; }
          .auth-card form { gap: 9px !important; }
          .auth-card input { padding: 13px 14px !important; font-size: 15px !important; border-radius: 16px !important; }
          .auth-card button { min-height: 44px; }
          .cl-socialButtonsBlockButton { min-height: 44px !important; }
          .cl-formButtonPrimary { min-height: 44px !important; }
          .cl-formFieldInput { min-height: 44px !important; }
          .cl-footer, .cl-dividerRow { margin-top: 9px !important; }
          .auth-scanlines { opacity: 0.34; }
          .auth-radar { width: 118vw; height: 118vw; bottom: -8%; }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
        }
      `}</style>
      <div className="auth-grid-bg" />
      <div className="auth-radar" />
      <div className="auth-particles" />
      <div className="auth-spotlight" />
      <div className="auth-scanner-blade" />
      <div className="auth-noise" />
      <div className="auth-scanlines" />
      <div className="auth-frame">
        <section className="auth-intro" aria-hidden="true">
          <div className="auth-kicker">Private premium access</div>
          <h2 className="auth-hero-title">See the edge <span className="cyan">before it moves</span></h2>
          <p className="auth-hero-copy">Player context, signal movement, rotation shifts, and matchup intelligence built for fast decisions before the board settles.</p>
          <div className="auth-chip-row">
            {intelligenceChips.map((chip, index) => (
              <span className="auth-chip" style={{ '--delay': `${index * 0.38}s` } as React.CSSProperties} key={chip}>{chip}</span>
            ))}
          </div>
          <div className="auth-terminal">
            <div className="auth-terminal-top">
              <span>AI signal terminal</span>
              <span className="auth-dots"><i /><i /><i /></span>
            </div>
            <div className="auth-terminal-body">
              {terminalRows.map((row, index) => (
                <div className="auth-terminal-row" style={{ '--delay': `${index * 0.62}s` } as React.CSSProperties} key={row.label}>
                  <span className="auth-terminal-label">{row.label}</span>
                  <span className="auth-terminal-value">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="auth-card">
          <div className="auth-head">
            <div className="auth-logo-shell">
              <div className="auth-logo">
                <img src="/brand/ai-athlete-intelligence-logo.png?v=transparent-20260525" alt="AI Athlete Intelligence" />
              </div>
            </div>
            <p className="auth-eyebrow">{eyebrow}</p>
            <h1 className="auth-title">{title}</h1>
            <p className="auth-subtitle">{subtitle}</p>
            <div className="auth-mini-chips">
              {intelligenceChips.map(chip => <span key={chip}>{chip}</span>)}
            </div>
          </div>
          <div className="auth-body">{children}</div>
          <p className="auth-access-note">Premium access only · secured member entry</p>
        </section>
      </div>
    </main>
  )
}
