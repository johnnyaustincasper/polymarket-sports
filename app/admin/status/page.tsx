import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

async function getProviderStatus() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/provider-status`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('Failed to fetch provider status')
  return res.json()
}

export default async function AdminStatusPage() {
  const { userId } = await auth()
  if (!userId) redirect('/login')

  // TODO: Add proper admin role check here later
  const status = await getProviderStatus()

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Provider Status</h1>

      <div className="grid gap-6">
        {/* Billing */}
        <section className="rounded-xl border p-6">
          <h2 className="text-xl font-semibold mb-4">Billing</h2>
          <pre className="bg-zinc-950 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(status.billing, null, 2)}
          </pre>
        </section>

        {/* AI Providers */}
        <section className="rounded-xl border p-6">
          <h2 className="text-xl font-semibold mb-4">AI Providers</h2>
          <pre className="bg-zinc-950 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(status.ai, null, 2)}
          </pre>
        </section>

        {/* Auth */}
        <section className="rounded-xl border p-6">
          <h2 className="text-xl font-semibold mb-4">Auth</h2>
          <pre className="bg-zinc-950 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(status.auth, null, 2)}
          </pre>
        </section>

        {/* Warnings */}
        {status.warnings?.length > 0 && (
          <section className="rounded-xl border border-yellow-500/50 bg-yellow-950/20 p-6">
            <h2 className="text-xl font-semibold mb-4 text-yellow-400">Warnings</h2>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {status.warnings.map((w: string, i: number) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
