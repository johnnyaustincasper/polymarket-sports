'use client'

import { SignUp } from '@clerk/nextjs'
import AuthShell from '../components/AuthShell'

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export default function SignUpPage() {
  if (!clerkEnabled) {
    return (
      <AuthShell eyebrow="SETUP NEEDED" title="Signup providers pending" subtitle="Add Clerk keys in Vercel to enable Discord, Google, and email signup.">
        <a href="/login" style={{ display: 'block', textAlign: 'center', color: '#a6ff3f', fontWeight: 900 }}>Back to temporary login</a>
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="START PREMIUM ACCESS" title="Create account" subtitle="Sign up with Discord, Google, or email. Subscription starts after account creation.">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/login"
        afterSignUpUrl="/subscribe"
        appearance={{
          variables: {
            colorPrimary: '#a6ff3f', colorBackground: '#050805', colorInputBackground: 'rgba(166,255,63,0.055)',
            colorInputText: '#f7fff0', colorText: '#f7fff0', colorTextSecondary: 'rgba(226,255,204,0.62)', borderRadius: '16px',
          },
          elements: {
            card: { background: 'transparent', boxShadow: 'none', border: 'none', width: '100%' },
            headerTitle: { display: 'none' }, headerSubtitle: { display: 'none' },
            socialButtonsBlockButton: { borderColor: 'rgba(166,255,63,0.22)', color: '#f7fff0' },
            formButtonPrimary: { color: '#051005', fontWeight: 900 }, footerActionLink: { color: '#a6ff3f' },
          },
        }}
      />
    </AuthShell>
  )
}
