'use client'
import { useState, useEffect } from 'react'
import AdminShell from '@/components/AdminShell'

type Fichaje = {
  id: string; empleado_nombre: string | null; obra_nombre: string | null
  entrada_at: string; salida_at: string | null; horas_totales: number | null; estado: string
  observaciones: string | null
}
type Empleado = { id: string; nombre: string }

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function FichajesClient({ logoUrl, nombreEmpresa, colorPrimario, tieneFichaje }: { logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null; tieneFichaje?: boolean }) {
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const [mes, setMes] = useState(mesActual)
  const [empleadoId, setEmpleadoId] = useState('')
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [editSalida, setEditSalida] = useState('')
  const [editObs, setEditObs] = useState('')

  async function cargar() {
    const params = new URLSearchParams({ mes })
    if (empleadoId) params.set('empleado_id', empleadoId)
    const r = await fetch(`/api/admin/fichajes?${params}`)
    if (r.ok) setFichajes((await r.json()).fichajes)
  }
  useEffect(() => { cargar() }, [mes, empleadoId])
  useEffect(() => {
    fetch('/api/admin/empleados').then(r => r.json()).then(j => setEmpleados(j.empleados ?? []))
  }, [])

  async function guardarEdicion(id: string) {
    const body: Record<string, string> = {}
    if (editSalida) body.salida_at = new Date(editSalida).toISOString()
    if (editObs) body.observaciones = editObs
    await fetch(`/api/admin/fichajes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setEditId(null); await cargar()
  }

  const activos = fichajes.filter(f => f.estado === 'activo')
  const cerrados = fichajes.filter(f => f.estado === 'cerrado')
  const totalHoras = cerrados.reduce((s, f) => s + (f.horas_totales ?? 0), 0)

  return (
    <AdminShell activo="fichajes" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} colorPrimario={colorPrimario} tieneFichaje={tieneFichaje}>
      <h1 className="mb-4 text-2xl">Fichajes</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} className="text-sm" />
        <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)} className="text-sm">
          <option value="">Todos los empleados</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        {totalHoras > 0 && <span className="text-sm text-ink-3">{totalHoras.toFixed(1)} h totales</span>}
      </div>

      {activos.length > 0 && (
        <div className="mb-4 rounded-card border border-ok/30 bg-ok/10 p-3">
          <p className="mb-2 text-sm font-medium text-ok">En jornada ahora ({activos.length})</p>
          <div className="flex flex-wrap gap-2">
            {activos.map(f => (
              <span key={f.id} className="rounded-full bg-ok/20 px-2 py-0.5 text-xs text-ok">
                {f.empleado_nombre} · desde {fmt(f.entrada_at)}{f.obra_nombre ? ` · ${f.obra_nombre}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-2">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Empleado</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Fecha</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Entrada</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Salida</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-3">Horas</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Obra</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {fichajes.map(f => (
              <tr key={f.id} className="border-b border-line last:border-0 hover:bg-paper-2/50">
                {editId === f.id ? (
                  <td colSpan={7} className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <label className="text-xs text-ink-3">Salida
                        <input type="datetime-local" value={editSalida} onChange={e => setEditSalida(e.target.value)} className="ml-1 text-xs" />
                      </label>
                      <input placeholder="Observaciones" value={editObs} onChange={e => setEditObs(e.target.value)} className="text-xs" />
                      <button onClick={() => guardarEdicion(f.id)} className="text-xs px-2 py-0.5">Guardar</button>
                      <button onClick={() => setEditId(null)} className="bg-paper-2 text-ink-2 text-xs px-2 py-0.5">Cancelar</button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 font-medium">{f.empleado_nombre ?? '—'}</td>
                    <td className="px-3 py-2 text-ink-2">{fmtFecha(f.entrada_at)}</td>
                    <td className="px-3 py-2">{fmt(f.entrada_at)}</td>
                    <td className="px-3 py-2">{f.salida_at ? fmt(f.salida_at) : <span className="rounded-full bg-ok/20 px-1.5 text-xs text-ok">activo</span>}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{f.horas_totales?.toFixed(2) ?? '—'}</td>
                    <td className="px-3 py-2 text-ink-3 text-xs">{f.obra_nombre ?? '—'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => { setEditId(f.id); setEditSalida(''); setEditObs(f.observaciones ?? '') }} className="px-2 py-0.5 text-xs">✏️</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {fichajes.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-3 text-ink-3">Sin fichajes en este período</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  )
}
