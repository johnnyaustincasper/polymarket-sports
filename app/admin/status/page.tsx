import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getProviderStatus } from '@/app/lib/provider-status'

function statusBadge(ready: boolean, severity?: string) {
  if (ready) return '✅ Ready'
  if (severity === 'warning') return '⚠️ Warning'
  return '🚫 Blocked'
}

export default async function AdminStatusPage() {
  const { userId } = await auth()
  if (!userId) redirect('/login')

  // TODO: Add proper admin role check here later
  const status = getProviderStatus()
  const readinessChecks = Object.entries(status.readiness.checks)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Provider Status</h1>

      <div className="grid gap-6">
        {/* Readiness */}
        <section className={`rounded-xl border p-6 ${status.readiness.ready ? 'border-green-500/50 bg-green-950/20' : 'border-red-500/50 bg-red-950/20'}`}>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Production Readiness</h2>
            <span className="text-sm font-medium">{status.readiness.ready ? '✅ Ready' : '🚫 Not ready'}</span>
          </div>
          <p className="text-xs text-zinc-400 mb-4">Generated: {status.readiness.generatedAt}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {readinessChecks.map(([name, check]) => (
              <div key={name} className="rounded-lg border border-zinc-800 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium capitalize">{name}</span>
                  <span className="text-xs">{statusBadge(check.ready, check.severity)}</span>
                </div>
                <p className="mt-2 text-sm text-zinc-300">{check.message}</p>
              </div>
            ))}
          </div>
        </section>

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
