'use client'

import { useState } from 'react'

export default function SubscriptionActions({ mode = 'checkout' }: { mode?: 'checkout' | 'portal' }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function go() {
    setLoading(true)
    setError('')
    try {
      const endpoint = mode === 'portal' ? '/api/stripe/portal' : '/api/stripe/checkout'
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error(data.error || data.reason || 'Stripe is not ready yet.')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open Stripe.')
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <button onClick={go} disabled={loading} style={{
        width: '100%', padding: '16px', borderRadius: 18, border: '1px solid rgba(166,255,63,0.52)',
        background: 'linear-gradient(135deg, rgba(166,255,63,0.95), rgba(197,255,93,0.78))', color: '#071005',
        fontSize: 13, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: loading ? 'wait' : 'pointer',
        boxShadow: '0 0 28px rgba(166,255,63,0.2)',
      }}>
        {loading ? 'Opening Stripe…' : mode === 'portal' ? 'Manage Subscription' : 'Subscribe — $25 / Month'}
      </button>
      {error && <p style={{ margin: 0, color: '#ff4466', fontSize: 12, textAlign: 'center', fontWeight: 800 }}>{error}</p>}
    </div>
  )
}
