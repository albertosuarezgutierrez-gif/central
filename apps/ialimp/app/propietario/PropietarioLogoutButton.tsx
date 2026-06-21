'use client'
import { useState } from 'react'

// Botón de cerrar sesión, flotante (position:fixed) para no alterar el layout
// del portal existente. Solo se muestra en el acceso por sesión.
export default function PropietarioLogoutButton({ nombre }: { nombre?: string }) {
  const [loading, setLoading] = useState(false)

  async function salir() {
    setLoading(true)
    try {
      await fetch('/api/propietario/auth/logout', { method: 'POST' })
    } catch { /* ignora */ }
    window.location.href = '/propietario'
  }

  return (
    <button
      onClick={salir}
      disabled={loading}
      title={nombre ? `Cerrar sesión de ${nombre}` : 'Cerrar sesión'}
      style={{
        position: 'fixed', top: 12, right: 12, zIndex: 9999,
        background: 'rgba(255,255,255,.92)', border: '1px solid #e2e8f0',
        color: '#4f46e5', borderRadius: 999, padding: '8px 14px',
        fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 12,
        cursor: 'pointer', boxShadow: '0 2px 10px rgba(79,70,229,.15)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {loading ? '…' : 'Salir'}
    </button>
  )
}
