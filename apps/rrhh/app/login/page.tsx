'use client'
import { useState } from 'react'

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('')
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (r.ok) location.href = '/admin/empleados'; else setErr((await r.json()).error ?? 'Error')
  }
  return (
    <main style={{ maxWidth: 360, margin: '64px auto', padding: 16 }}>
      <h1>RR.HH. · Acceso responsable</h1>
      <form onSubmit={enviar} style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input placeholder="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit">Entrar</button>
        {err && <p style={{ color: 'crimson' }}>{err}</p>}
      </form>
    </main>
  )
}
