'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { formatAge } from '../lib/time-format'

export default function UpdatedAgeLabel({ updatedAt, prefix = 'Updated', empty = null }: { updatedAt: Date | null; prefix?: string; empty?: ReactNode }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!updatedAt) return
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 1000)))
    update()
    const iv = setInterval(update, 1000)
    return () => clearInterval(iv)
  }, [updatedAt])

  if (!updatedAt) return <>{empty}</>
  return <>{prefix}{prefix ? ' ' : ''}{formatAge(seconds)}</>
}
