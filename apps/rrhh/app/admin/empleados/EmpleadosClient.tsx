'use client'
import { useState, useMemo } from 'react'
import ActivarPush from '@/components/ActivarPush'
import AdminShell from '@/components/AdminShell'
import AsistentePanelAdmin from '@/components/AsistentePanelAdmin'

type Vac = { aprobados: number; en_tramite: number; pendientes: number }
type E = { id: string; nombre: string; apellidos: string | null; dni: string | null; nss: string | null; email: string | null; puesto: string | null; estado: string; acceso_token: string | null; vacaciones?: Vac; fecha_reconocimiento_medico?: string | null }

function diasParaCaducarReconocimiento(fecha: string | null | undefined): number | null {
  if (!fecha) return null
  const expiry = new Date(fecha)
  expiry.setFullYear(expiry.getFullYear() + 1)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.floor((expiry.getTime() - hoy.getTime()) / 86400000)
}

export default function EmpleadosClient({ inicial, nombreUsuario, nombreEmpresa, logoUrl, colorPrimario }: { inicial: E[]; nombreUsuario: string; nombreEmpresa: string; logoUrl?: string | null; colorPrimario?: string | null }) {
  const [lista, setLista] = useState<E[]>(inicial)
  const [alta, setAlta] = useState({ apellidos: '', nombre: '', email: '', dni: '', telefono: '', puesto: '' })
  const [altaErr, setAltaErr] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ apellidos: '', nombre: '', email: '', puesto: '', estado: 'activo' })
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
      return [e.nombre, e.apellidos, e.email, e.dni, e.nss].some(v => (v ?? '').toLowerCase().includes(t))
    })
  }, [lista, q, filtro])

  async function crear(ev: React.FormEvent) {
    ev.preventDefault(); setAltaErr(''); setBusy(true)
    const r = await fetch('/api/admin/empleados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(alta) })
    setBusy(false)
    if (r.ok) { setAlta({ apellidos: '', nombre: '', email: '', dni: '', telefono: '', puesto: '' }); await refrescar() }
    else setAltaErr((await r.json()).error ?? 'No se pudo crear')
  }

  function abrirEdicion(e: E) {
    setEditId(e.id); setEdit({ apellidos: e.apellidos ?? '', nombre: e.nombre, email: e.email ?? '', puesto: e.puesto ?? '', estado: e.estado || 'activo' })
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
    <AdminShell activo="empleados" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} colorPrimario={colorPrimario}>
      {(nombreUsuario || nombreEmpresa) && (
        <p className="mb-4 text-sm text-ink-3">
          {nombreUsuario ? `Bienvenida, ${nombreUsuario}` : ''}{nombreUsuario && nombreEmpresa ? ' · ' : ''}{nombreEmpresa}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">Empleados</h1>
        <ActivarPush endpoint="/api/admin/push/subscribe" />
      </div>

      <AsistentePanelAdmin />

      {/* Alta */}
      <form onSubmit={crear} className="mb-4 rounded-[12px] border border-line bg-card p-3">
        <div className="flex flex-wrap gap-2">
          <input placeholder="Apellidos *" value={alta.apellidos} onChange={e => setAlta(s => ({ ...s, apellidos: e.target.value }))} />
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

      <div className="overflow-x-auto rounded-[12px] border border-line bg-card">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-2">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Nombre</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">DNI / NIE</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Nº SS</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Estado</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">Vacaciones</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(e => (
              <tr key={e.id} className="border-b border-line last:border-b-0 hover:bg-paper-2/50">
                {editId === e.id ? (
                  <td colSpan={6} className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <input placeholder="Apellidos" value={edit.apellidos} onChange={ev => setEdit(s => ({ ...s, apellidos: ev.target.value }))} />
                      <input placeholder="Nombre" value={edit.nombre} onChange={ev => setEdit(s => ({ ...s, nombre: ev.target.value }))} />
                      <input placeholder="Email" value={edit.email} onChange={ev => setEdit(s => ({ ...s, email: ev.target.value }))} />
                      <input placeholder="Puesto" value={edit.puesto} onChange={ev => setEdit(s => ({ ...s, puesto: ev.target.value }))} />
                      <select value={edit.estado} onChange={ev => setEdit(s => ({ ...s, estado: ev.target.value }))}>
                        <option value="activo">Activo</option>
                        <option value="baja">Baja</option>
                      </select>
                      <button disabled={busy || (!edit.nombre.trim() && !edit.apellidos.trim())} onClick={() => guardar(e.id)}>Guardar</button>
                      <button className="bg-paper-2 text-ink-2 hover:bg-line" onClick={() => setEditId(null)}>Cancelar</button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <a href={`/admin/empleados/${e.id}`} className="font-medium text-ink no-underline hover:text-accent">
                        {e.apellidos ? `${e.apellidos}, ${e.nombre}` : e.nombre}
                      </a>
                      {(() => { const d = diasParaCaducarReconocimiento(e.fecha_reconocimiento_medico); return d !== null && d <= 15 ? <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${d < 0 ? 'bg-alert/10 text-alert' : 'bg-warn/10 text-warn'}`} title="Reconocimiento médico">{d < 0 ? `Reconoc. caducado (${Math.abs(d)}d)` : `Reconoc. caduca en ${d}d`}</span> : null })()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">{e.dni ?? <span className="text-ink-3">—</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-3">{e.nss ?? <span className="text-ink-3">—</span>}</td>
                    <td className="px-4 py-3">
                      {e.estado === 'baja'
                        ? <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink-3">Baja</span>
                        : <span className="rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink-2">Activo</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {e.vacaciones && e.estado !== 'baja' && (
                        <span title={`Aprobados: ${e.vacaciones.aprobados} · En trámite: ${e.vacaciones.en_tramite}`}>
                          <span className="text-ok">{e.vacaciones.aprobados}</span>
                          {e.vacaciones.en_tramite > 0 && <span className="text-ink-3">+{e.vacaciones.en_tramite}</span>}
                          <span className="text-ink-3"> / </span>
                          <span className={e.vacaciones.pendientes <= 0 ? 'text-alert' : ''}>{e.vacaciones.pendientes} pend.</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button className="px-2 py-0.5 text-xs" title="Editar" onClick={() => abrirEdicion(e)}>✏️</button>
                        <button className="bg-paper-2 px-2 py-0.5 text-xs text-alert hover:bg-line" title="Borrar" onClick={() => borrar(e)}>🗑️</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-3 text-ink-3">{lista.length === 0 ? 'Sin empleados todavía' : 'Ningún empleado coincide'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  )
}
