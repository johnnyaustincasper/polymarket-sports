'use client'

import { ClerkProvider } from '@clerk/nextjs'

export default function Providers({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) return <>{children}</>

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/login"
      signUpUrl="/sign-up"
      afterSignInUrl="/subscribe"
      afterSignUpUrl="/subscribe"
    >
      {children}
    </ClerkProvider>
  )
}
