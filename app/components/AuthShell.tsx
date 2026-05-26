export default function AuthShell({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: React.ReactNode }) {
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
          background: #030502;
          color: #f7fff0;
          padding: max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom));
          font-family: system-ui, -apple-system, sans-serif;
          position: relative;
          overflow: hidden;
          box-sizing: border-box;
        }
        .auth-grid-bg { position: fixed; inset: 0; background-image: linear-gradient(rgba(125,246,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(125,246,255,0.04) 1px, transparent 1px); background-size: 48px 48px; }
        .auth-glow-bg { position: fixed; inset: 0; background: radial-gradient(ellipse 60% 60% at 50% 35%, rgba(125,246,255,0.15), transparent 72%); }
        .auth-card {
          position: relative;
          z-index: 1;
          width: min(100%, 460px);
          max-height: calc(100dvh - 36px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
          border-radius: 32px;
          border: 1px solid rgba(125,246,255,0.24);
          background: linear-gradient(135deg, rgba(8,12,6,0.98), rgba(0,0,0,0.92));
          box-shadow: 0 0 70px rgba(125,246,255,0.12), 0 24px 90px rgba(0,0,0,0.82);
          padding: 28px;
          box-sizing: border-box;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .auth-card::-webkit-scrollbar { width: 0; height: 0; }
        .auth-head { text-align: center; margin-bottom: 24px; }
        .auth-logo { width: 118px; height: 118px; border-radius: 30px; margin: 0 auto 16px; overflow: hidden; border: 1px solid rgba(125,246,255,0.35); box-shadow: 0 0 42px rgba(125,246,255,0.18); }
        .auth-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .auth-eyebrow { color: #7df6ff; font-weight: 900; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; margin: 0; }
        .auth-title { margin: 8px 0 6px; font-size: 30px; letter-spacing: -0.04em; }
        .auth-subtitle { margin: 0; color: rgba(226,255,204,0.58); font-size: 13px; line-height: 1.45; }

        @media (max-width: 480px) {
          .auth-shell {
            min-height: 100svh;
            min-height: 100dvh;
            height: 100dvh;
            padding: calc(env(safe-area-inset-top) + 8px) 12px calc(env(safe-area-inset-bottom) + 8px);
            overflow: hidden;
          }
          .auth-card {
            width: min(100%, 392px);
            max-height: calc(100dvh - 18px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
            border-radius: 24px;
            padding: 14px;
            box-shadow: 0 0 46px rgba(125,246,255,0.10), 0 18px 54px rgba(0,0,0,0.72);
          }
          .auth-head { margin-bottom: 10px; }
          .auth-logo { width: 70px; height: 70px; border-radius: 18px; margin-bottom: 8px; }
          .auth-eyebrow { font-size: 8px; letter-spacing: 0.15em; }
          .auth-title { font-size: 21px; margin: 4px 0 3px; }
          .auth-subtitle { display: none; }
          .auth-card form { gap: 8px !important; }
          .auth-card input { padding: 12px 13px !important; font-size: 14px !important; border-radius: 14px !important; }
          .auth-card button { min-height: 42px; }
          .cl-rootBox, .cl-card, .cl-cardBox { width: 100% !important; max-width: 100% !important; }
          .cl-card { padding: 0 !important; }
          .cl-socialButtonsBlockButton { min-height: 40px !important; }
          .cl-formButtonPrimary { min-height: 40px !important; }
          .cl-footer, .cl-dividerRow { margin-top: 8px !important; }
        }
      `}</style>
      <div className="auth-grid-bg" />
      <div className="auth-glow-bg" />
      <section className="auth-card">
        <div className="auth-head">
          <div className="auth-logo">
            <img src="/brand/ai-athlete-intelligence-logo.jpg?v=cyan-20260525" alt="AI Athlete Intelligence" />
          </div>
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
        </div>
        {children}
      </section>
    </main>
  )
}
