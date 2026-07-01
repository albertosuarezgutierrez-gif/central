'use client'
import { useState } from 'react'

export default function LoginForm() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('')
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (r.ok) location.href = '/admin/empleados'; else setErr((await r.json()).error ?? 'Error')
  }
  return (
    <form onSubmit={enviar} className="mt-5 grid gap-2.5">
      <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
      <input placeholder="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit" className="mt-1">Entrar</button>
      {err && <p className="text-alert text-sm">{err}</p>}
    </form>
  )
}
