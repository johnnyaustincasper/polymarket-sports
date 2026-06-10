type AuthShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}

export default function AuthShell({ eyebrow, title, subtitle, children }: AuthShellProps) {
  return (
    <main className="auth-shell">
      <style>{`
        html, body { min-height: 100%; }
        .auth-shell {
          min-height: 100vh;
          min-height: 100svh;
          min-height: 100dvh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 50% 0%, rgba(125,246,255,0.18), transparent 32%),
            radial-gradient(circle at 14% 24%, rgba(33,118,255,0.16), transparent 30%),
            linear-gradient(180deg, #06120f 0%, #020403 52%, #000 100%);
          color: #f7fff0;
          padding: max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom));
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }
        .auth-grid-bg {
          position: fixed;
          inset: 0;
          opacity: 0.55;
          background-image:
            linear-gradient(rgba(125,246,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(125,246,255,0.035) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(circle at 50% 28%, black 0%, transparent 72%);
        }
        .auth-orb {
          position: fixed;
          width: 420px;
          height: 420px;
          border-radius: 999px;
          left: 50%;
          top: 8%;
          transform: translateX(-50%);
          background: radial-gradient(circle, rgba(125,246,255,0.15), rgba(125,246,255,0.035) 42%, transparent 70%);
          filter: blur(6px);
          pointer-events: none;
        }
        .auth-shell::after {
          content: '';
          position: fixed;
          inset: auto 0 0;
          height: 42%;
          background: linear-gradient(180deg, transparent, rgba(0,0,0,0.76));
          pointer-events: none;
        }
        .auth-card {
          position: relative;
          z-index: 1;
          width: min(100%, 470px);
          max-height: calc(100dvh - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
          border-radius: 36px;
          border: 1px solid rgba(125,246,255,0.18);
          background:
            linear-gradient(180deg, rgba(7,18,16,0.86), rgba(1,3,3,0.94)),
            rgba(0,0,0,0.84);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.035) inset,
            0 0 68px rgba(125,246,255,0.13),
            0 30px 100px rgba(0,0,0,0.86);
          padding: 26px;
          box-sizing: border-box;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          backdrop-filter: blur(22px);
        }
        .auth-card::-webkit-scrollbar { width: 0; height: 0; }
        .auth-head { text-align: center; margin-bottom: 18px; }
        .auth-logo-shell {
          width: min(100%, 220px);
          margin: 0 auto 14px;
          padding: 10px 16px 8px;
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(125,246,255,0.075), rgba(125,246,255,0.018));
          border: 1px solid rgba(125,246,255,0.10);
          box-shadow: 0 18px 48px rgba(0,0,0,0.34), 0 0 36px rgba(125,246,255,0.08);
        }
        .auth-logo { width: 150px; height: 150px; border-radius: 0; margin: 0 auto; overflow: visible; border: 0; background: transparent; box-shadow: none; }
        .auth-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
        .auth-eyebrow { color: #7df6ff; font-weight: 950; font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; margin: 0; }
        .auth-title { margin: 8px 0 6px; font-size: clamp(30px, 8vw, 44px); line-height: 0.95; letter-spacing: -0.065em; }
        .auth-subtitle { margin: 0 auto; max-width: 340px; color: rgba(226,255,204,0.64); font-size: 13px; line-height: 1.45; }
        .auth-proof-row {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 14px;
        }
        .auth-proof-chip {
          border: 1px solid rgba(125,246,255,0.12);
          border-radius: 999px;
          padding: 7px 8px;
          background: rgba(255,255,255,0.035);
          color: rgba(247,255,240,0.72);
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .auth-body { display: grid; gap: 14px; }
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
          min-height: 48px !important;
          border-radius: 18px !important;
          background: rgba(255,255,255,0.045) !important;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.03) inset !important;
        }
        .cl-socialButtonsBlockButton:hover { background: rgba(125,246,255,0.08) !important; }
        .cl-formButtonPrimary {
          min-height: 48px !important;
          border-radius: 18px !important;
          background: linear-gradient(135deg, #7df6ff, #26aaff) !important;
          box-shadow: 0 18px 34px rgba(38,170,255,0.22), 0 0 24px rgba(125,246,255,0.2) !important;
        }
        .cl-formFieldInput { border-radius: 18px !important; min-height: 48px !important; }
        .cl-dividerRow { margin: 14px 0 !important; }
        .cl-footer { margin-top: 12px !important; }

        @media (max-width: 480px) {
          .auth-shell {
            align-items: stretch;
            min-height: 100svh;
            min-height: 100dvh;
            padding: calc(env(safe-area-inset-top) + 10px) 10px calc(env(safe-area-inset-bottom) + 10px);
            overflow: hidden;
          }
          .auth-card {
            width: 100%;
            max-height: calc(100dvh - 20px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
            border-radius: 30px;
            padding: 16px;
            align-self: center;
            box-shadow: 0 0 46px rgba(125,246,255,0.10), 0 18px 54px rgba(0,0,0,0.72);
          }
          .auth-head { margin-bottom: 12px; }
          .auth-logo-shell { width: 172px; padding: 7px 13px 5px; border-radius: 24px; margin-bottom: 11px; }
          .auth-logo { width: 116px; height: 116px; }
          .auth-eyebrow { font-size: 8px; letter-spacing: 0.17em; }
          .auth-title { font-size: 34px; margin: 6px 0 5px; }
          .auth-subtitle { font-size: 12px; max-width: 300px; }
          .auth-proof-row { gap: 6px; margin-top: 11px; }
          .auth-proof-chip { font-size: 9px; padding: 6px 9px; letter-spacing: 0.055em; }
          .auth-body { gap: 11px; }
          .auth-card form { gap: 9px !important; }
          .auth-card input { padding: 13px 14px !important; font-size: 15px !important; border-radius: 16px !important; }
          .auth-card button { min-height: 44px; }
          .cl-socialButtonsBlockButton { min-height: 44px !important; }
          .cl-formButtonPrimary { min-height: 44px !important; }
          .cl-formFieldInput { min-height: 44px !important; }
          .cl-footer, .cl-dividerRow { margin-top: 9px !important; }
        }

        @media (max-width: 360px) {
          .auth-proof-row { display: none; }
        }
      `}</style>
      <div className="auth-grid-bg" />
      <div className="auth-orb" />
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
          <div className="auth-proof-row" aria-label="Athlete Intelligence highlights">
            <span className="auth-proof-chip">Daily board</span>
            <span className="auth-proof-chip">Player reads</span>
            <span className="auth-proof-chip">Line checks</span>
          </div>
        </div>
        <div className="auth-body">{children}</div>
      </section>
    </main>
  )
}
