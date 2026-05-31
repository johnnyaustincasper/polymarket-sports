'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useClerk, useUser } from '@clerk/nextjs'

const C = {
  green: '#7df6ff', red: '#ff3f5f', bg: '#030500', border: 'rgba(125,246,255,0.14)',
  borderHot: 'rgba(125,246,255,0.52)', textPrimary: '#f7fff0', textSecondary: 'rgba(219,255,191,0.58)',
}

type Profile = {
  authType?: string; guest?: boolean; email?: string; username?: string; displayName?: string; details?: string; avatarUrl?: string
  subscriptionStatus?: string; hasStripeCustomer?: boolean
}

function initials(name?: string, email?: string) {
  const source = (name || email || 'AI').trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] || 'A') + (parts[1]?.[0] || 'I')).toUpperCase()
}
function statusTone(status?: string) {
  if (status === 'active' || status === 'trialing') return C.green
  if (status === 'past_due' || status === 'unpaid') return '#f8d94a'
  return C.textSecondary
}

function publicStatusLabel(status?: string) {
  if (status === 'active' || status === 'trialing') return 'Member access'
  if (status === 'past_due') return 'Payment needs attention'
  if (status === 'unpaid') return 'Access paused'
  return 'Membership pending'
}

function subscriptionCopy(status?: string, hasStripeCustomer?: boolean) {
  if (status === 'active' || status === 'trialing') return 'Premium board unlocked.'
  if (status === 'past_due' || status === 'unpaid') return 'Update billing to keep access live.'
  return hasStripeCustomer ? 'Billing connected.' : 'Choose a plan to unlock the board.'
}

function LogoutButton({ isMobile }: { isMobile: boolean }) {
  const { signOut } = useClerk()
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', cache: 'no-store' }).catch(() => null)
    document.cookie = 'ai_session=; Max-Age=0; path=/'
    document.cookie = 'ai_profile=; Max-Age=0; path=/'
    document.cookie = 'session=; Max-Age=0; path=/'
    await signOut().catch(() => null)
    window.location.replace('/login')
  }

  return <button onClick={logout} disabled={loggingOut} style={{ width: '100%', borderRadius: isMobile ? 13 : 16, border: '1px solid rgba(255,63,95,0.32)', background: 'rgba(255,63,95,0.08)', color: C.red, padding: isMobile ? '11px' : '14px', fontSize: 12, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: loggingOut ? 'wait' : 'pointer', marginBottom: isMobile ? 2 : 0 }}>{loggingOut ? 'Logging out…' : 'Logout'}</button>
}

export default function AccountMenu({ isMobile = false, forceOpen = false, onForceOpenConsumed, hideTrigger = false }: { isMobile?: boolean; forceOpen?: boolean; onForceOpenConsumed?: () => void; hideTrigger?: boolean }) {
  const { user } = useUser()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [details, setDetails] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadAccount = useCallback(async () => {
    try {
      const [accountRes, subRes] = await Promise.all([fetch('/api/account'), fetch('/api/account/subscription')])
      const accountData = await accountRes.json().catch(() => ({}))
      const subData = await subRes.json().catch(() => ({}))
      if (!accountRes.ok) throw new Error(accountData.error || 'Not signed in.')
      const nextProfile: Profile = { ...(accountData.profile || {}), subscriptionStatus: subData.status || accountData.profile?.subscriptionStatus, hasStripeCustomer: subData.canManageBilling ?? accountData.profile?.hasStripeCustomer }
      setProfile(nextProfile)
      setDisplayName(nextProfile.displayName || '')
      setUsername(nextProfile.username || '')
      setDetails(nextProfile.details || '')
      setAvatarUrl(nextProfile.avatarUrl || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load account.')
    }
  }, [])

  useEffect(() => { loadAccount() }, [loadAccount])

  const openDrawer = useCallback(() => { setMessage(''); setError(''); setOpen(true); loadAccount() }, [loadAccount])

  useEffect(() => {
    if (!forceOpen) return
    openDrawer()
    onForceOpenConsumed?.()
  }, [forceOpen, onForceOpenConsumed, openDrawer])

  async function saveProfile() {
    setSaving(true); setMessage(''); setError('')
    try {
      const res = await fetch('/api/account', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName, username, details, avatarUrl }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save profile.')
      setProfile(data.profile)
      setMessage('Profile updated.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save profile.') }
    finally { setSaving(false) }
  }

  async function uploadProfilePicture(file?: File) {
    if (!file) return
    if (!user) {
      setError('Image upload is available for signed-in accounts.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile image must be under 5 MB.')
      return
    }
    setSaving(true); setMessage(''); setError('')
    try {
      await user.setProfileImage({ file })
      await user.reload()
      const nextAvatar = user.imageUrl || ''
      setAvatarUrl(nextAvatar)
      const res = await fetch('/api/account', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName, username, details, avatarUrl: nextAvatar }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Image uploaded, but profile save failed.')
      setProfile(data.profile)
      setMessage('Profile picture updated.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not upload profile picture.') }
    finally {
      setSaving(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function manageBilling() {
    setBillingLoading(true); setError('')
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error(data.error || data.reason || 'Billing portal is not ready yet.')
      window.location.href = data.url
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to open billing.'); setBillingLoading(false) }
  }

  const avatar = profile?.avatarUrl
  const label = profile?.displayName || profile?.username || 'Account'
  const status = profile?.subscriptionStatus || 'unknown'
  const statusLabel = publicStatusLabel(status)
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 2147483647,
    background: isMobile ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.64)',
    backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
    display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end', alignItems: 'stretch',
  }
  const panelStyle: React.CSSProperties = {
    width: isMobile ? '100%' : 'min(430px, 100%)',
    height: isMobile ? '100dvh' : '100%',
    maxHeight: isMobile ? '100dvh' : undefined,
    padding: isMobile ? 'calc(env(safe-area-inset-top) + 12px) 14px calc(env(safe-area-inset-bottom) + 14px)' : 22,
    boxSizing: 'border-box',
    background: 'linear-gradient(145deg, rgba(8,13,5,0.995), rgba(3,5,0,0.995))',
    borderLeft: isMobile ? 'none' : `1px solid ${C.borderHot}`,
    boxShadow: isMobile ? 'none' : '-24px 0 90px rgba(0,0,0,0.72)',
    color: C.textPrimary,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as any,
  }
  const sectionStyle: React.CSSProperties = { borderRadius: isMobile ? 18 : 22, padding: isMobile ? 11 : 15, background: 'rgba(255,255,255,0.032)', border: `1px solid ${C.border}`, marginBottom: isMobile ? 9 : 14 }
  const inputCompact: React.CSSProperties = { width: '100%', boxSizing: 'border-box', borderRadius: isMobile ? 12 : 15, border: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.28)', color: C.textPrimary, padding: isMobile ? '10px 12px' : '13px 14px', fontSize: isMobile ? 13 : 14, outline: 'none' }

  return <>
    {!hideTrigger && <button onClick={openDrawer} aria-label="Open account" style={{ width: isMobile ? 38 : 42, height: isMobile ? 38 : 42, borderRadius: isMobile ? 13 : 14, padding: 0, overflow: 'hidden', background: 'rgba(255,255,255,0.045)', border: `1px solid ${C.borderHot}`, color: C.green, cursor: 'pointer', boxShadow: '0 0 18px rgba(125,246,255,0.12), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
      {avatar ? <img src={avatar} alt="Account" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 12, fontWeight: 950 }}>{initials(label, profile?.email)}</span>}
    </button>}
    {open && <div onClick={() => setOpen(false)} style={overlayStyle}>
      <aside onClick={e => e.stopPropagation()} style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: isMobile ? 10 : 20, position: 'sticky', top: 0, zIndex: 2, paddingBottom: isMobile ? 8 : 0, background: isMobile ? 'linear-gradient(180deg, rgba(6,10,3,1), rgba(6,10,3,0.88))' : 'transparent' }}><div><div style={{ color: C.green, fontSize: 10, fontWeight: 950, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Account Command</div><h2 style={{ margin: '5px 0 0', fontSize: isMobile ? 21 : 26, letterSpacing: '-0.04em' }}>Profile</h2></div><button onClick={() => setOpen(false)} aria-label="Close account" style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.045)', border: `1px solid ${C.border}`, color: C.textSecondary, cursor: 'pointer', fontSize: 18 }}>×</button></div>
        <section style={{ ...sectionStyle, padding: isMobile ? 10 : 16, borderRadius: isMobile ? 18 : 24, background: 'rgba(255,255,255,0.035)' }}><div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14 }}><button type="button" onClick={() => fileRef.current?.click()} style={{ width: isMobile ? 54 : 76, height: isMobile ? 54 : 76, borderRadius: isMobile ? 16 : 22, overflow: 'hidden', background: 'rgba(125,246,255,0.08)', border: `1px solid ${C.borderHot}`, color: C.green, display: 'grid', placeItems: 'center', flexShrink: 0, cursor: 'pointer', padding: 0 }}>{avatar ? <img src={avatar} alt="Profile avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontWeight: 950 }}>{initials(label, profile?.email)}</span>}</button><div style={{ minWidth: 0 }}><div style={{ fontSize: isMobile ? 14 : 16, fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div><div style={{ color: C.textSecondary, fontSize: isMobile ? 11 : 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.email || 'Loading account…'}</div><div style={{ color: statusTone(status), fontSize: 10, fontWeight: 950, marginTop: 6, textTransform: 'uppercase' }}>{statusLabel}</div><button type="button" onClick={() => fileRef.current?.click()} disabled={saving} style={{ marginTop: 8, borderRadius: 999, border: `1px solid ${C.border}`, background: 'rgba(125,246,255,0.07)', color: C.green, padding: '7px 10px', fontSize: 10, fontWeight: 950, letterSpacing: '0.10em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Uploading…' : 'Upload photo'}</button><input ref={fileRef} type="file" accept="image/*" onChange={e => uploadProfilePicture(e.target.files?.[0])} style={{ display: 'none' }} /></div></div></section>
        <section style={{ display: 'grid', gap: isMobile ? 7 : 10, marginBottom: isMobile ? 9 : 14 }}>{[
          ['Display name', displayName, setDisplayName, 'Johnny Casper'], ['Username', username, setUsername, 'johnny'], ['Profile picture URL', avatarUrl, setAvatarUrl, 'https://...']
        ].map(([lab, val, setter, ph]) => <label key={String(lab)} style={{ display: 'grid', gap: 5, color: C.textSecondary, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{String(lab)}<input value={String(val)} onChange={e => (setter as (v: string) => void)(e.target.value)} placeholder={String(ph)} style={inputCompact} /></label>)}
          <label style={{ display: 'grid', gap: 5, color: C.textSecondary, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Profile details<textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="Optional member details" rows={isMobile ? 2 : 3} style={{ ...inputCompact, resize: 'vertical' }} /></label>
          <button onClick={saveProfile} disabled={saving} style={{ borderRadius: isMobile ? 13 : 16, border: `1px solid ${C.borderHot}`, background: 'linear-gradient(135deg, rgba(125,246,255,0.95), rgba(197,255,93,0.78))', color: C.bg, padding: isMobile ? '11px' : '14px', fontSize: 12, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Saving…' : 'Save Profile'}</button></section>
        <section style={sectionStyle}><div style={{ color: C.textSecondary, fontSize: 10, fontWeight: 950, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Subscription</div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: isMobile ? 7 : 10 }}><div><div style={{ color: statusTone(status), fontSize: isMobile ? 15 : 18, fontWeight: 950, textTransform: 'capitalize' }}>{statusLabel}</div><div style={{ color: C.textSecondary, fontSize: isMobile ? 11 : 12, marginTop: 3 }}>{subscriptionCopy(status, profile?.hasStripeCustomer)}</div></div><span style={{ width: 10, height: 10, borderRadius: '50%', background: statusTone(status), boxShadow: `0 0 16px ${statusTone(status)}` }} /></div><button onClick={manageBilling} disabled={billingLoading} style={{ width: '100%', marginTop: isMobile ? 9 : 14, borderRadius: isMobile ? 13 : 16, border: `1px solid ${C.border}`, background: 'rgba(125,246,255,0.08)', color: C.green, padding: isMobile ? '11px' : '13px', fontSize: 12, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: billingLoading ? 'wait' : 'pointer' }}>{billingLoading ? 'Opening…' : 'Manage Billing'}</button></section>
        {(message || error) && <p style={{ margin: '0 0 10px', color: error ? C.red : C.green, fontSize: 12, fontWeight: 800, textAlign: 'center' }}>{error || message}</p>}
        <LogoutButton isMobile={isMobile} />
      </aside></div>}
  </>
}
