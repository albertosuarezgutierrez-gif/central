'use client'
// Redirigir /portal → /central
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PortalRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/central') }, [router])
  return null
}
