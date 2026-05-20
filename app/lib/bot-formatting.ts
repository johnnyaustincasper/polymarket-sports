export function formatPct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

export function formatCents(n: number): string {
  return (n * 100).toFixed(1) + '¢'
}

export function formatEdge(n: number): string {
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '¢'
}

export function formatUnits(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(3) + 'u'
}

export function formatGameTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function formatTimeUntil(iso: string, nowMs = Date.now()): string {
  const diff = new Date(iso).getTime() - nowMs
  if (diff <= 0) return 'Now'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
