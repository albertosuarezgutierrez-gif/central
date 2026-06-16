'use client'
import { useState } from 'react'
import AdminShell from '@/components/AdminShell'

export default function CuentaClient({ convenio }: { convenio: { codigo: string; nombre: string } }) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const [cod, setCod] = useState(convenio.codigo)
  const [nom, setNom] = useState(convenio.nombre)
  const [convMsg, setConvMsg] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setError('')
    const r = await fetch('/api/auth/cambiar-password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actual, nueva }),
    })
    if (r.ok) { setActual(''); setNueva(''); setMsg('Contraseña actualizada') }
    else setError((await r.json()).error ?? 'Error')
  }

  async function guardarConvenio(e: React.FormEvent) {
    e.preventDefault(); setConvMsg('')
    const r = await fetch('/api/admin/cuenta/convenio', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ codigo: cod, nombre: nom }),
    })
    setConvMsg(r.ok ? 'Convenio guardado' : 'Error al guardar')
  }

  return (
    <AdminShell activo="cuenta">
      <h1 className="text-2xl">Mi cuenta</h1>

      <section className="my-3 max-w-sm rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Convenio colectivo</h2>
        <form onSubmit={guardarConvenio} className="grid gap-2.5">
          <input placeholder="Código del convenio (REGCON)" value={cod} onChange={e => setCod(e.target.value)} />
          <input placeholder="Nombre del convenio (opcional)" value={nom} onChange={e => setNom(e.target.value)} />
          <button type="submit">Guardar convenio</button>
          {convMsg && <p className="text-ok text-sm">{convMsg}</p>}
        </form>
        <p className="text-ink-3 mt-2 text-xs">El convenio determina los días de permisos y las tablas salariales aplicables.</p>
      </section>

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
