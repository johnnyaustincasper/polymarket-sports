'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) { router.push('/'); router.refresh() }
      else { setError('ACCESS DENIED'); setPassword('') }
    } catch { setError('CONNECTION ERROR') }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#02020f', fontFamily: 'system-ui, -apple-system, sans-serif',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(0,240,255,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,240,255,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }} />
      {/* Glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,240,255,0.06) 0%, transparent 70%)',
      }} />

      <form onSubmit={submit} style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 360, padding: '0 16px' }}>
        <div style={{
          background: 'rgba(8,8,28,0.95)',
          border: '1px solid rgba(0,240,255,0.2)',
          borderRadius: 28,
          padding: '48px 32px',
          boxShadow: '0 0 60px rgba(0,240,255,0.08), 0 24px 80px rgba(0,0,0,0.8)',
          backdropFilter: 'blur(24px)',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(168,85,247,0.2))',
              border: '1px solid rgba(0,240,255,0.4)',
              boxShadow: '0 0 30px rgba(0,240,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, color: '#00f0ff',
            }}>◈</div>
            <p style={{ color: '#00f0ff', fontWeight: 900, fontSize: 20, letterSpacing: '-0.02em', textShadow: '0 0 20px rgba(0,240,255,0.5)' }}>NBA LINES</p>
            <p style={{ color: 'rgba(180,200,255,0.4)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Restricted Access</p>
          </div>

          {/* Input */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              maxLength={8}
              placeholder="••••••••"
              autoFocus
              style={{
                width: '100%', padding: '16px', borderRadius: 16,
                textAlign: 'center', fontSize: 24, letterSpacing: '0.6em',
                background: error ? 'rgba(255,68,102,0.05)' : 'rgba(0,240,255,0.05)',
                border: `1px solid ${error ? 'rgba(255,68,102,0.4)' : 'rgba(0,240,255,0.2)'}`,
                color: '#00f0ff', outline: 'none', boxSizing: 'border-box',
                caretColor: '#00f0ff',
                boxShadow: error ? '0 0 16px rgba(255,68,102,0.1)' : 'none',
                transition: 'all 0.2s',
              }}
            />
            {error && <p style={{ color: '#ff4466', fontSize: 10, letterSpacing: '0.15em', textAlign: 'center', marginTop: 8, fontWeight: 800 }}>{error}</p>}
          </div>

          <button type="submit" disabled={loading || password.length === 0} style={{
            width: '100%', padding: '14px', borderRadius: 16, border: 'none',
            fontSize: 12, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase',
            cursor: password.length === 0 || loading ? 'not-allowed' : 'pointer',
            background: password.length === 0 || loading
              ? 'rgba(255,255,255,0.04)'
              : 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(168,85,247,0.2))',
            borderWidth: 1, borderStyle: 'solid',
            borderColor: password.length === 0 || loading ? 'rgba(255,255,255,0.08)' : 'rgba(0,240,255,0.4)',
            color: password.length === 0 || loading ? 'rgba(180,200,255,0.3)' : '#00f0ff',
            boxShadow: password.length > 0 && !loading ? '0 0 20px rgba(0,240,255,0.15)' : 'none',
            transition: 'all 0.2s',
          }}>
            {loading ? 'AUTHENTICATING…' : 'AUTHENTICATE'}
          </button>
        </div>
      </form>
    </div>
  )
}
