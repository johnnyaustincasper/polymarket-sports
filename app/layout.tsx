import type { Metadata, Viewport } from 'next'
import Providers from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Athlete Intelligence',
  description: 'Premium athlete intelligence, market signals, and source-aware edge analysis',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Athlete AI',
  },
  other: { 'mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#bfdbfe',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body style={{ background: 'transparent', minHeight: '100dvh' }} className="text-zinc-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
