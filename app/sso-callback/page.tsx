import { redirect } from 'next/navigation'

export default async function SsoCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearch = await searchParams
  const query = new URLSearchParams()
  Object.entries(resolvedSearch || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item))
    else if (value != null) query.set(key, value)
  })
  redirect(`/login/sso-callback${query.size ? `?${query.toString()}` : ''}`)
}
