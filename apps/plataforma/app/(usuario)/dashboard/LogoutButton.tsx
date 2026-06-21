'use client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <button
      onClick={logout}
      style={{
        fontSize: '13px', color: 'var(--muted)', padding: '5px 10px',
        border: '1px solid var(--border)', borderRadius: '6px',
      }}
    >
      Salir
    </button>
  )
}
