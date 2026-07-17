'use client'
import { useState, useEffect, Fragment } from 'react'
import AdminShell from '@/components/AdminShell'

type Fichaje = {
  id: string; empleado_nombre: string | null; obra_nombre: string | null
  entrada_at: string; salida_at: string | null; horas_totales: number | null; estado: string
  observaciones: string | null
  lat_entrada: number | null; lng_entrada: number | null
}
type Empleado = { id: string; nombre: string }
type AuditRow = { campo: string; valor_antes: string | null; valor_despues: string | null; motivo: string; creado_at: string }

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtISO(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
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
  const [editMotivo, setEditMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorEdit, setErrorEdit] = useState('')
  const [auditId, setAuditId] = useState<string | null>(null)
  const [auditoria, setAuditoria] = useState<AuditRow[]>([])
  const [exportando, setExportando] = useState(false)

  async function cargar() {
    const params = new URLSearchParams({ mes })
    if (empleadoId) params.set('empleado_id', empleadoId)
    const r = await fetch(`/api/admin/fichajes?${params}`)
    if (r.ok) setFichajes((await r.json()).fichajes)
  }
  useEffect(() => { cargar() }, [mes, empleadoId])
  useEffect(() => {
    fetch('/api/admin/empleados').then(r => r.ok ? r.json() : { empleados: [] }).then(j => setEmpleados(j.empleados ?? [])).catch(() => {})
  }, [])

  async function guardarEdicion(id: string) {
    if (!editMotivo.trim()) { setErrorEdit('El motivo es obligatorio'); return }
    setGuardando(true); setErrorEdit('')
    const body: Record<string, string> = { motivo: editMotivo }
    if (editSalida) body.salida_at = new Date(editSalida).toISOString()
    if (editObs) body.observaciones = editObs
    const r = await fetch(`/api/admin/fichajes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setGuardando(false)
    if (r.ok) { setEditId(null); await cargar() }
    else { const j = await r.json().catch(() => ({})); setErrorEdit(j.error ?? 'Error al guardar') }
  }

  async function verAuditoria(id: string) {
    if (auditId === id) { setAuditId(null); return }
    const r = await fetch(`/api/admin/fichajes/${id}`)
    if (r.ok) { const j = await r.json(); setAuditoria(j.auditoria ?? []) }
    setAuditId(id)
  }

  async function exportarCSV() {
    setExportando(true)
    const params = new URLSearchParams({ mes })
    if (empleadoId) params.set('empleado_id', empleadoId)
    const r = await fetch(`/api/admin/fichajes/exportar?${params}`)
    if (r.ok) {
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `fichajes_${mes}.csv`; a.click()
      URL.revokeObjectURL(url)
    }
    setExportando(false)
  }

  const activos = fichajes.filter(f => f.estado === 'activo')
  const cerrados = fichajes.filter(f => f.estado === 'cerrado')
  const totalHoras = cerrados.reduce((s, f) => s + Number(f.horas_totales ?? 0), 0)

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
        <button
          onClick={exportarCSV} disabled={exportando || fichajes.length === 0}
          className="ml-auto bg-paper-2 text-ink-2 text-xs px-3 py-1.5 rounded border border-line"
        >
          {exportando ? 'Exportando…' : '⬇ Exportar CSV (ITSS)'}
        </button>
      </div>

      {activos.length > 0 && (
        <div className="mb-4 rounded-card border border-ok/30 bg-ok/10 p-3">
          <p className="mb-2 text-sm font-medium text-ok">En jornada ahora ({activos.length})</p>
          <div className="flex flex-wrap gap-2">
            {activos.map(f => (
              <span key={f.id} className="rounded-full bg-ok/20 px-2 py-0.5 text-xs text-ok">
                {f.empleado_nombre} · desde {fmt(f.entrada_at)}{f.obra_nombre ? ` · ${f.obra_nombre}` : f.lat_entrada != null ? ' · 📍' : ''}
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
              <Fragment key={f.id}>
                <tr className="border-b border-line last:border-0 hover:bg-paper-2/50">
                  {editId === f.id ? (
                    <td colSpan={7} className="px-3 py-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          <label className="text-xs text-ink-3">Salida
                            <input type="datetime-local" value={editSalida} onChange={e => setEditSalida(e.target.value)} className="ml-1 text-xs" />
                          </label>
                          <input placeholder="Observaciones" value={editObs} onChange={e => setEditObs(e.target.value)} className="text-xs flex-1 min-w-[180px]" />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            placeholder="Motivo de la corrección (obligatorio)"
                            value={editMotivo}
                            onChange={e => setEditMotivo(e.target.value)}
                            className="text-xs flex-1 min-w-[220px] border-warn/50 focus:border-warn"
                          />
                          <button onClick={() => guardarEdicion(f.id)} disabled={guardando} className="text-xs px-2 py-1">
                            {guardando ? 'Guardando…' : 'Guardar'}
                          </button>
                          <button onClick={() => { setEditId(null); setErrorEdit('') }} className="bg-paper-2 text-ink-2 text-xs px-2 py-1">Cancelar</button>
                        </div>
                        {errorEdit && <p className="text-xs text-alert">{errorEdit}</p>}
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 font-medium">{f.empleado_nombre ?? '—'}</td>
                      <td className="px-3 py-2 text-ink-2">{fmtFecha(f.entrada_at)}</td>
                      <td className="px-3 py-2">{fmt(f.entrada_at)}</td>
                      <td className="px-3 py-2">{f.salida_at ? fmt(f.salida_at) : <span className="rounded-full bg-ok/20 px-1.5 text-xs text-ok">activo</span>}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{f.horas_totales != null ? Number(f.horas_totales).toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {f.obra_nombre
                          ? <span className="text-ink-2">{f.obra_nombre}</span>
                          : f.lat_entrada != null && f.lng_entrada != null
                            ? <a href={`https://maps.google.com/?q=${f.lat_entrada},${f.lng_entrada}`} target="_blank" rel="noopener noreferrer" className="text-accent no-underline hover:underline">📍 Ver mapa</a>
                            : <span className="text-ink-3">—</span>}
                      </td>
                      <td className="px-3 py-2 flex gap-1">
                        <button
                          onClick={() => { setEditId(f.id); setEditSalida(''); setEditObs(f.observaciones ?? ''); setEditMotivo(''); setErrorEdit(''); setAuditId(null) }}
                          className="px-2 py-1.5 text-xs min-h-[36px]" title="Corregir"
                        >✏️</button>
                        <button
                          onClick={() => verAuditoria(f.id)}
                          className="px-2 py-1.5 text-xs text-ink-3 min-h-[36px]" title="Ver historial de cambios"
                        >🕓</button>
                      </td>
                    </>
                  )}
                </tr>
                {auditId === f.id && (
                  <tr key={`audit-${f.id}`} className="border-b border-line bg-paper-2/50">
                    <td colSpan={7} className="px-3 py-2">
                      {auditoria.length === 0 ? (
                        <p className="text-xs text-ink-3">Sin correcciones registradas</p>
                      ) : (
                        <div className="space-y-1">
                          <p className="mb-1 text-xs font-semibold text-ink-3">Historial de correcciones</p>
                          {auditoria.map((a, i) => (
                            <div key={i} className="text-xs text-ink-2">
                              <span className="text-ink-3">{fmtISO(a.creado_at)}</span>
                              {' · '}
                              <span className="font-medium">{a.campo}</span>
                              {': '}
                              <span className="line-through text-ink-3">{a.valor_antes ?? '—'}</span>
                              {' → '}
                              <span>{a.valor_despues ?? '—'}</span>
                              {' · Motivo: '}
                              <span className="italic">{a.motivo}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
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
