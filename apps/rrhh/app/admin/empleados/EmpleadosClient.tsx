'use client'
import { useState } from 'react'
import ActivarPush from '@/components/ActivarPush'
import AdminShell from '@/components/AdminShell'

type E = { id: string; nombre: string; email: string | null; puesto: string | null; estado: string; acceso_token: string }

export default function EmpleadosClient({ inicial }: { inicial: E[] }) {
  const [lista, setLista] = useState<E[]>(inicial)
  const [nombre, setNombre] = useState(''); const [email, setEmail] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ nombre: string; email: string; puesto: string; estado: string }>({ nombre: '', email: '', puesto: '', estado: 'activo' })
  const [busy, setBusy] = useState(false)

  async function refrescar() {
    const g = await (await fetch('/api/admin/empleados')).json(); setLista(g.empleados)
  }

  async function alta(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/admin/empleados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre, email }) })
    if (r.ok) { setNombre(''); setEmail(''); await refrescar() }
  }

  function abrirEdicion(e: E) {
    setEditId(e.id)
    setEdit({ nombre: e.nombre, email: e.email ?? '', puesto: e.puesto ?? '', estado: e.estado || 'activo' })
  }

  async function guardar(id: string) {
    setBusy(true)
    const r = await fetch(`/api/admin/empleados/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(edit),
    })
    setBusy(false)
    if (r.ok) { setEditId(null); await refrescar() }
    else alert((await r.json()).error ?? 'No se pudo guardar')
  }

  async function borrar(e: E) {
    if (!confirm(`¿Borrar a ${e.nombre}? Se eliminará su ficha y su expediente. Esta acción no se puede deshacer.\n\nSi solo quieres que deje de tener acceso, usa "Editar" y ponle estado "baja".`)) return
    setBusy(true)
    const r = await fetch(`/api/admin/empleados/${e.id}`, { method: 'DELETE' })
    setBusy(false)
    if (r.ok) await refrescar(); else alert((await r.json()).error ?? 'No se pudo borrar')
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
          <li key={e.id} className="border-b border-line px-4 py-3 last:border-b-0">
            {editId === e.id ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <input placeholder="Nombre" value={edit.nombre} onChange={ev => setEdit(s => ({ ...s, nombre: ev.target.value }))} />
                  <input placeholder="Email" value={edit.email} onChange={ev => setEdit(s => ({ ...s, email: ev.target.value }))} />
                  <input placeholder="Puesto" value={edit.puesto} onChange={ev => setEdit(s => ({ ...s, puesto: ev.target.value }))} />
                  <select value={edit.estado} onChange={ev => setEdit(s => ({ ...s, estado: ev.target.value }))}>
                    <option value="activo">Activo</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy || !edit.nombre.trim()} onClick={() => guardar(e.id)}>Guardar</button>
                  <button className="bg-paper-2 text-ink-2 hover:bg-line" onClick={() => setEditId(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/admin/empleados/${e.id}`} className="font-medium text-ink no-underline hover:text-accent">{e.nombre}</a>
                {e.email && <span className="text-ink-3 text-sm">· {e.email}</span>}
                {e.estado === 'baja' && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink-3">baja</span>}
                <code className="ml-auto rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">/e/{e.acceso_token}</code>
                <button className="px-2 py-0.5 text-xs" onClick={() => abrirEdicion(e)}>Editar</button>
                <button className="bg-paper-2 px-2 py-0.5 text-xs text-alert hover:bg-line" onClick={() => borrar(e)}>Borrar</button>
              </div>
            )}
          </li>
        ))}
        {lista.length === 0 && <li className="px-4 py-3 text-ink-3">Sin empleados todavía</li>}
      </ul>
    </AdminShell>
  )
}
