'use client'
import { useState } from 'react'
import ActivarPush from '@/components/ActivarPush'
import AdminShell from '@/components/AdminShell'

type E = { id: string; nombre: string; email: string | null; puesto: string | null; estado: string; acceso_token: string }

export default function EmpleadosClient({ inicial }: { inicial: E[] }) {
  const [lista, setLista] = useState<E[]>(inicial); const [nombre, setNombre] = useState(''); const [email, setEmail] = useState('')
  async function alta(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/admin/empleados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre, email }) })
    if (r.ok) { setNombre(''); setEmail(''); const g = await (await fetch('/api/admin/empleados')).json(); setLista(g.empleados) }
  }
  return (
    <AdminShell activo="empleados">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl">Empleados</h1>
        <ActivarPush endpoint="/api/admin/push/subscribe" />
      </div>
      <form onSubmit={alta} className="mb-4 flex flex-wrap gap-2">
        <input placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <button type="submit">Añadir</button>
      </form>
      <ul className="overflow-hidden rounded-[12px] border border-line bg-card">
        {lista.map(e => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 last:border-b-0">
            <a href={`/admin/empleados/${e.id}`} className="font-medium text-ink no-underline hover:text-accent">{e.nombre}</a>
            {e.email && <span className="text-ink-3 text-sm">· {e.email}</span>}
            <code className="ml-auto rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">/e/{e.acceso_token}</code>
          </li>
        ))}
        {lista.length === 0 && <li className="px-4 py-3 text-ink-3">Sin empleados todavía</li>}
      </ul>
    </AdminShell>
  )
}
