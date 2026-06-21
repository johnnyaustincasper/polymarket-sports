import { redirect } from 'next/navigation'

export default async function SignInAliasCatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'sign-in'?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedParams = await params
  const resolvedSearch = await searchParams
  const suffix = (resolvedParams['sign-in'] || []).join('/')
  const query = new URLSearchParams()
  Object.entries(resolvedSearch || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item))
    else if (value != null) query.set(key, value)
  })
  redirect(`/login${suffix ? `/${suffix}` : ''}${query.size ? `?${query.toString()}` : ''}`)
}
