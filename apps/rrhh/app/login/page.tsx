'use client'
import { useState } from 'react'
import Wordmark from '@/components/Wordmark'

export default function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('')
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    if (r.ok) location.href = '/admin/empleados'; else setErr((await r.json()).error ?? 'Error')
  }
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm rounded-[18px] border border-line bg-card p-7 shadow-sm">
        <Wordmark className="text-2xl" />
        <h1 className="mt-3 text-xl">Acceso responsable</h1>
        <form onSubmit={enviar} className="mt-5 grid gap-2.5">
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input placeholder="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="mt-1">Entrar</button>
          {err && <p className="text-alert text-sm">{err}</p>}
        </form>
      </div>
    </main>
  )
}
