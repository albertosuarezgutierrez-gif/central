'use client'
import { useState, useMemo } from 'react'
import ActivarPush from '@/components/ActivarPush'
import AdminShell from '@/components/AdminShell'

type E = { id: string; nombre: string; dni: string | null; nss: string | null; email: string | null; puesto: string | null; estado: string; acceso_token: string | null }

export default function EmpleadosClient({ inicial, nombreUsuario, nombreEmpresa }: { inicial: E[]; nombreUsuario: string; nombreEmpresa: string }) {
  const [lista, setLista] = useState<E[]>(inicial)
  const [alta, setAlta] = useState({ nombre: '', email: '', dni: '', telefono: '', puesto: '' })
  const [altaErr, setAltaErr] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ nombre: '', email: '', puesto: '', estado: 'activo' })
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'activos' | 'baja' | 'todos'>('activos')
  async function refrescar() {
    const g = await (await fetch('/api/admin/empleados')).json(); setLista(g.empleados)
  }

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return lista.filter(e => {
      if (filtro === 'activos' && e.estado === 'baja') return false
      if (filtro === 'baja' && e.estado !== 'baja') return false
      if (!t) return true
      return [e.nombre, e.email, e.dni, e.nss].some(v => (v ?? '').toLowerCase().includes(t))
    })
  }, [lista, q, filtro])

  async function crear(ev: React.FormEvent) {
    ev.preventDefault(); setAltaErr(''); setBusy(true)
    const r = await fetch('/api/admin/empleados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(alta) })
    setBusy(false)
    if (r.ok) { setAlta({ nombre: '', email: '', dni: '', telefono: '', puesto: '' }); await refrescar() }
    else setAltaErr((await r.json()).error ?? 'No se pudo crear')
  }

  function abrirEdicion(e: E) {
    setEditId(e.id); setEdit({ nombre: e.nombre, email: e.email ?? '', puesto: e.puesto ?? '', estado: e.estado || 'activo' })
  }
  async function guardar(id: string) {
    setBusy(true)
    const r = await fetch(`/api/admin/empleados/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(edit) })
    setBusy(false)
    if (r.ok) { setEditId(null); await refrescar() } else alert((await r.json()).error ?? 'No se pudo guardar')
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
      {(nombreUsuario || nombreEmpresa) && (
        <p className="mb-4 text-sm text-ink-3">
          {nombreUsuario ? `Bienvenida, ${nombreUsuario}` : ''}{nombreUsuario && nombreEmpresa ? ' · ' : ''}{nombreEmpresa}
        </p>
      )}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl">Empleados</h1>
        <ActivarPush endpoint="/api/admin/push/subscribe" />
      </div>

      {/* Alta */}
      <form onSubmit={crear} className="mb-4 rounded-[12px] border border-line bg-card p-3">
        <div className="flex flex-wrap gap-2">
          <input placeholder="Nombre *" value={alta.nombre} onChange={e => setAlta(s => ({ ...s, nombre: e.target.value }))} />
          <input placeholder="Email * (para firmar)" type="email" value={alta.email} onChange={e => setAlta(s => ({ ...s, email: e.target.value }))} />
          <input placeholder="DNI/NIE" value={alta.dni} onChange={e => setAlta(s => ({ ...s, dni: e.target.value }))} />
          <input placeholder="Teléfono" value={alta.telefono} onChange={e => setAlta(s => ({ ...s, telefono: e.target.value }))} />
          <input placeholder="Puesto" value={alta.puesto} onChange={e => setAlta(s => ({ ...s, puesto: e.target.value }))} />
          <button type="submit" disabled={busy}>Añadir</button>
        </div>
        {altaErr && <p className="text-alert mt-2 text-sm">⚠️ {altaErr}</p>}
      </form>

      {/* Buscador + filtro */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input placeholder="Buscar por nombre, DNI o Nº SS…" value={q} onChange={e => setQ(e.target.value)} className="min-w-[200px] flex-1" />
        <div className="flex gap-1">
          {(['activos', 'baja', 'todos'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={filtro === f ? '' : 'bg-paper-2 text-ink-2 hover:bg-line'}>
              {f === 'activos' ? 'Activos' : f === 'baja' ? 'Baja' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* Cabecera columnas — oculta en móvil */}
      <div className="mb-1 hidden grid-cols-[1fr_7rem_10rem_1fr_5rem_5.5rem] gap-x-4 px-4 text-xs font-semibold uppercase tracking-wide text-ink-3 sm:grid">
        <span>Nombre</span><span>DNI / NIE</span><span>Nº SS</span><span>Puesto</span><span>Estado</span><span></span>
      </div>

      <ul className="overflow-hidden rounded-[12px] border border-line bg-card">
        {visibles.map(e => (
          <li key={e.id} className="border-b border-line last:border-b-0">
            {editId === e.id ? (
              <div className="flex flex-col gap-2 px-4 py-3">
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
              /* Móvil: stack vertical · Desktop: grid de columnas */
              <div className="grid gap-x-4 px-4 py-3
                grid-cols-1 gap-y-0.5
                sm:grid-cols-[1fr_7rem_10rem_1fr_5rem_5.5rem] sm:items-center sm:gap-y-0">
                {/* Nombre */}
                <a href={`/admin/empleados/${e.id}`}
                  className="text-sm font-medium text-ink no-underline hover:text-accent">
                  {e.nombre}
                </a>
                {/* DNI */}
                <span className="font-mono text-xs text-ink-2">{e.dni ?? <span className="text-ink-3">—</span>}</span>
                {/* NSS */}
                <span className="font-mono text-xs text-ink-3">{e.nss ?? <span className="text-ink-3">—</span>}</span>
                {/* Puesto */}
                <span className="text-xs text-ink-2">{e.puesto ?? <span className="text-ink-3">—</span>}</span>
                {/* Estado */}
                <span>
                  {e.estado === 'baja'
                    ? <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink-3">Baja</span>
                    : <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink-2">Activo</span>}
                </span>
                {/* Acciones */}
                <div className="flex items-center gap-1 sm:justify-end">
                  <button className="px-2 py-0.5 text-xs" title="Editar" onClick={() => abrirEdicion(e)}>✏️</button>
                  <button className="bg-paper-2 px-2 py-0.5 text-xs text-alert hover:bg-line" title="Borrar" onClick={() => borrar(e)}>🗑️</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {visibles.length === 0 && <li className="px-4 py-3 text-ink-3">{lista.length === 0 ? 'Sin empleados todavía' : 'Ningún empleado coincide'}</li>}
      </ul>
    </AdminShell>
  )
}
