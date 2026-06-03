'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AccessCodeRedeemer() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function redeem(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim() || loading) return
    setLoading(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/access-code/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Access code could not be redeemed.')
      setMessage(`${data.label || 'Free access'} unlocked. Opening the board…`)
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Access code could not be redeemed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={redeem} style={{ border: '1px solid rgba(125,246,255,0.18)', borderRadius: 22, padding: 16, background: 'rgba(0,0,0,0.22)', display: 'grid', gap: 10, marginBottom: 18 }}>
      <div>
        <div style={{ color: '#7df6ff', fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Have an access code?</div>
        <p style={{ margin: '5px 0 0', color: 'rgba(226,255,204,0.60)', fontSize: 12, lineHeight: 1.45 }}>Redeem a VIP or comp pass to unlock Athlete Intelligence without Stripe checkout.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Enter access code"
          autoComplete="one-time-code"
          style={{ minWidth: 0, padding: '13px 14px', borderRadius: 15, fontSize: 14, background: 'rgba(125,246,255,0.055)', border: '1px solid rgba(125,246,255,0.22)', color: '#eaffd6', outline: 'none', boxSizing: 'border-box', caretColor: '#7df6ff', textTransform: 'uppercase' }}
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          style={{ borderRadius: 15, padding: '0 14px', border: `1px solid ${loading || !code.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(125,246,255,0.48)'}`, background: loading || !code.trim() ? 'rgba(255,255,255,0.04)' : 'rgba(125,246,255,0.14)', color: loading || !code.trim() ? 'rgba(226,255,204,0.32)' : '#7df6ff', fontSize: 11, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', cursor: loading || !code.trim() ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Checking…' : 'Redeem'}
        </button>
      </div>
      {message && <p style={{ margin: 0, color: '#7df6ff', fontSize: 12, fontWeight: 800 }}>{message}</p>}
      {error && <p style={{ margin: 0, color: '#ff4466', fontSize: 12, fontWeight: 800 }}>{error}</p>}
    </form>
  )
}
