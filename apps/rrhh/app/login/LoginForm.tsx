'use client'
import { useState } from 'react'

type Empresa = { id: string; nombre: string }

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      if (j.empresas) { setEmpresas(j.empresas); return }
      location.href = '/admin/empleados'
    } else setErr(j.error ?? 'Error')
  }

  async function seleccionar(empresa_id: string) {
    setErr('')
    const r = await fetch('/api/auth/seleccionar-empresa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ empresa_id }) })
    if (r.ok) location.href = '/admin/empleados'
    else setErr((await r.json()).error ?? 'Error')
  }

  if (empresas) {
    return (
      <div className="mt-5 grid gap-2">
        <p className="text-sm text-ink-2">Elige la empresa con la que quieres trabajar hoy:</p>
        {empresas.map(e => (
          <button key={e.id} onClick={() => seleccionar(e.id)} className="text-left">{e.nombre}</button>
        ))}
        <button onClick={() => setEmpresas(null)} className="bg-paper-2 text-ink-2 hover:bg-line text-sm">Volver</button>
        {err && <p className="text-alert text-sm">{err}</p>}
      </div>
    )
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
