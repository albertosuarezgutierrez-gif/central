'use client'

import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }
  return (
    <a onClick={logout} style={{ cursor: 'pointer', marginLeft: 'auto' }} className="muted">
      Salir
    </a>
  )
}
