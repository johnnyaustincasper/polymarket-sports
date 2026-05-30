'use client'

import { SignIn } from '@clerk/nextjs'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthShell from '../components/AuthShell'

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export default function LoginPage() {
  if (clerkEnabled) {
    return (
      <AuthShell eyebrow="AI ATHLETE INTELLIGENCE" title="Unlock today's board" subtitle="Sign in or create your account to unlock the full daily player-prop board. Membership is required before the board opens.">
        <SignIn
          routing="path"
          path="/login"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/subscribe"
          appearance={clerkAppearance}
        />
      </AuthShell>
    )
  }

  return <LegacyLogin />
}

function LegacyLogin() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
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
        body: JSON.stringify({ email, code, name: mode === 'signup' ? name : undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        router.push(new URLSearchParams(window.location.search).get('next') || '/')
        router.refresh()
      } else {
        setError(data.error || 'Access denied.')
        setCode('')
      }
    } catch {
      setError('Connection error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const disabled = loading || !email.trim() || !code.trim() || (mode === 'signup' && !name.trim())

  return (
    <AuthShell eyebrow="ACCESS" title="Member access" subtitle="Use your account access code to sign in. Paid membership is required before the board opens.">
      <form onSubmit={submit} style={{ width: '100%', display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {(['signin', 'signup'] as const).map(option => (
            <button key={option} type="button" onClick={() => setMode(option)} style={tabStyle(mode === option)}>{option === 'signin' ? 'Sign In' : 'Sign Up'}</button>
          ))}
        </div>
        {mode === 'signup' && <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoComplete="name" style={inputStyle} />}
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="approved@email.com" autoComplete="email" autoFocus style={inputStyle} />
        <input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Invite / access code" autoComplete="one-time-code" style={inputStyle} />
        {error && <p style={{ color: '#ff4466', fontSize: 12, textAlign: 'center', fontWeight: 800 }}>{error}</p>}
        <button type="submit" disabled={disabled} style={primaryButton(disabled)}>{loading ? 'Verifying…' : 'Enter Intelligence'}</button>
      </form>
    </AuthShell>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '15px 16px', borderRadius: 16, fontSize: 15,
  background: 'rgba(125,246,255,0.055)', border: '1px solid rgba(125,246,255,0.22)',
  color: '#eaffd6', outline: 'none', boxSizing: 'border-box', caretColor: '#7df6ff',
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '12px 10px', borderRadius: 15, cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(125,246,255,0.48)' : 'rgba(255,255,255,0.08)'}`,
    background: active ? 'rgba(125,246,255,0.13)' : 'rgba(255,255,255,0.035)',
    color: active ? '#7df6ff' : 'rgba(226,255,204,0.55)', fontWeight: 900, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
  }
}

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '15px', borderRadius: 17, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, rgba(125,246,255,0.26), rgba(125,246,255,0.13))',
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.08)' : 'rgba(125,246,255,0.48)'}`,
    color: disabled ? 'rgba(226,255,204,0.3)' : '#7df6ff', boxShadow: !disabled ? '0 0 26px rgba(125,246,255,0.18)' : 'none',
  }
}

const clerkAppearance = {
  variables: {
    colorPrimary: '#7df6ff',
    colorBackground: '#050805',
    colorInputBackground: 'rgba(125,246,255,0.055)',
    colorInputText: '#f7fff0',
    colorText: '#f7fff0',
    colorTextSecondary: 'rgba(226,255,204,0.62)',
    borderRadius: '16px',
  },
  elements: {
    card: { background: 'transparent', boxShadow: 'none', border: 'none', width: '100%' },
    headerTitle: { display: 'none' },
    headerSubtitle: { display: 'none' },
    socialButtonsBlockButton: { borderColor: 'rgba(125,246,255,0.22)', color: '#f7fff0' },
    formButtonPrimary: { color: '#051005', fontWeight: 900 },
    footerActionLink: { color: '#7df6ff' },
  },
} as const
