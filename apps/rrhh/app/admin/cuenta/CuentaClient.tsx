'use client'
import { useState } from 'react'
import AdminShell from '@/components/AdminShell'

export default function CuentaClient() {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setError('')
    const r = await fetch('/api/auth/cambiar-password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actual, nueva }),
    })
    if (r.ok) { setActual(''); setNueva(''); setMsg('Contraseña actualizada') }
    else setError((await r.json()).error ?? 'Error')
  }

  return (
    <AdminShell activo="cuenta">
      <h1 className="text-2xl">Mi cuenta</h1>
      <section className="my-3 max-w-sm rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Cambiar contraseña</h2>
        <form onSubmit={enviar} className="grid gap-2.5">
          <input type="password" placeholder="Contraseña actual" value={actual} onChange={e => setActual(e.target.value)} />
          <input type="password" placeholder="Nueva contraseña (mín. 8)" value={nueva} onChange={e => setNueva(e.target.value)} minLength={8} />
          <button type="submit">Guardar</button>
          {msg && <p className="text-ok text-sm">{msg}</p>}
          {error && <p className="text-alert text-sm">{error}</p>}
        </form>
      </section>
    </AdminShell>
  )
}
