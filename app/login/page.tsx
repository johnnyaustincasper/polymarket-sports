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
      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Wrong password.')
        setPassword('')
      }
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)' }}>
      <form onSubmit={submit} className="w-full max-w-xs px-4">
        <div className="rounded-3xl p-8 shadow-xl"
          style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
          <h1 className="text-2xl font-black text-zinc-900 mb-1 text-center">🏀 NBA Lines</h1>
          <p className="text-sm text-zinc-400 text-center mb-6">Enter password to continue</p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            maxLength={8}
            placeholder="••••••••"
            autoFocus
            className="w-full px-4 py-3 rounded-2xl text-center text-2xl tracking-[0.5em] border outline-none transition-all mb-3"
            style={{
              border: error ? '1.5px solid #ef4444' : '1.5px solid #e5e7eb',
              background: '#f9fafb',
            }}
          />
          {error && <p className="text-red-500 text-xs text-center mb-3">{error}</p>}
          <button type="submit" disabled={loading || password.length === 0}
            className="w-full py-3 rounded-2xl font-bold text-white transition-all"
            style={{ background: loading ? '#a5b4fc' : '#6366f1' }}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </div>
      </form>
    </div>
  )
}
