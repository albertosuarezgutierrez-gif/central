'use client'
import Boton from '@/components/ui/Boton'
import Chip from '@/components/ui/Chip'
import { useState, useEffect, Fragment } from 'react'
import Page from '@/components/ui/Page'
import Tabla from '@/components/ui/Tabla'
import {
  ETIQUETA_CAUSA, ETIQUETA_PLATAFORMA, tramoSinUbicacion, textoPrecision,
  type CausaIncidencia, type PlataformaIncidencia,
} from '@/lib/ubicacion-fichaje'

type Fichaje = {
  id: string; empleado_nombre: string | null; obra_nombre: string | null
  entrada_at: string; salida_at: string | null; horas_totales: number | null; estado: string
  observaciones: string | null
  lat_entrada: number | null; lng_entrada: number | null
  sin_ubicacion_entrada?: boolean; sin_ubicacion_salida?: boolean
  precision_entrada_m?: number | null
}
type Incidencia = {
  empleado_id: string; empleado_nombre: string | null; causa: CausaIncidencia; plataforma: PlataformaIncidencia
  total: number; fichados_sin_ubicacion: number; ultima_at: string
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

export default function FichajesClient() {
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
  // null = aún no cargadas o no se pudieron leer («no se sabe»); [] = revisadas, sin incidencias.
  const [incidencias, setIncidencias] = useState<Incidencia[] | null>(null)
  const [cargandoIncidencias, setCargandoIncidencias] = useState(true)
  // null = cargando (ni activado ni desactivado); 'error' = no se pudo leer
  const [sinUbic, setSinUbic] = useState<boolean | null | 'error'>(null)
  const [guardandoSinUbic, setGuardandoSinUbic] = useState(false)
  const [msgSinUbic, setMsgSinUbic] = useState('')
  useEffect(() => {
    fetch('/api/admin/empresa/ajustes')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setSinUbic(d.permite_fichar_sin_ubicacion === true))
      .catch(() => setSinUbic('error'))
  }, [])
  async function cambiarSinUbic() {
    if (typeof sinUbic !== 'boolean' || guardandoSinUbic) return
    const previo = sinUbic, nuevo = !sinUbic
    setSinUbic(nuevo); setGuardandoSinUbic(true); setMsgSinUbic('')
    try {
      const r = await fetch('/api/admin/empresa/ajustes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permite_fichar_sin_ubicacion: nuevo }),
      })
      if (!r.ok) throw new Error()
      setMsgSinUbic('Guardado ✓')
      setTimeout(() => setMsgSinUbic(m => m === 'Guardado ✓' ? '' : m), 2500)
    } catch {
      setSinUbic(previo); setMsgSinUbic('No se pudo guardar. Inténtalo de nuevo.')
    } finally { setGuardandoSinUbic(false) }
  }

  async function cargar() {
    const params = new URLSearchParams({ mes })
    if (empleadoId) params.set('empleado_id', empleadoId)
    const r = await fetch(`/api/admin/fichajes?${params}`)
    if (r.ok) setFichajes((await r.json()).fichajes)
  }
  useEffect(() => { cargar() }, [mes, empleadoId])
  useEffect(() => {
    fetch('/api/admin/fichajes/incidencias').then(r => r.ok ? r.json() : null).then(j => setIncidencias(j?.incidencias ?? null)).catch(() => {}).finally(() => setCargandoIncidencias(false))
  }, [])
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
    <Page titulo="Fichajes">

      <div className="mb-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input type="month" value={mes} onChange={e => setMes(e.target.value)} className="text-sm" />
        <select value={empleadoId} onChange={e => setEmpleadoId(e.target.value)} className="text-sm">
          <option value="">Todos los empleados</option>
          {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <span className="text-sm tabular-nums text-ink-3">{totalHoras > 0 ? `${totalHoras.toFixed(1)} h totales` : ''}</span>
        <button
          onClick={exportarCSV} disabled={exportando || fichajes.length === 0}
          className="min-h-[44px] bg-paper-2 text-ink-2 text-xs px-3 py-1.5 rounded border border-line lg:justify-self-end"
        >
          {exportando ? 'Exportando…' : 'Exportar CSV (ITSS)'}
        </button>
      </div>

      {activos.length > 0 && (
        <div className="mb-4 rounded-card border border-ok/30 bg-ok/10 p-3">
          <p className="mb-2 text-sm font-medium text-ok">En jornada ahora ({activos.length})</p>
          <div className="flex flex-wrap gap-2">
            {activos.map(f => (
              <Chip key={f.id} tono="ok">
                {f.empleado_nombre} · desde {fmt(f.entrada_at)}{f.obra_nombre ? ` · ${f.obra_nombre}` : f.lat_entrada != null ? ' · con ubicación' : ''}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <Tabla fija>
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
                      <td className="px-3 py-2.5 font-medium">{f.empleado_nombre ?? '—'}</td>
                      <td data-label="Fecha" className="px-3 py-2.5 text-ink-2">{fmtFecha(f.entrada_at)}</td>
                      <td data-label="Entrada" className="px-3 py-2.5 tabular-nums">{fmt(f.entrada_at)}</td>
                      <td data-label="Salida" className="px-3 py-2.5 tabular-nums">{f.salida_at ? fmt(f.salida_at) : <Chip tono="ok">activo</Chip>}</td>
                      <td data-label="Horas" className="px-3 py-2.5 text-right font-mono text-xs tabular-nums">{f.horas_totales != null ? Number(f.horas_totales).toFixed(2) : '—'}</td>
                      <td data-label="Obra" className="px-3 py-2.5 text-xs">
                        {f.obra_nombre
                          ? <span className="text-ink-2">{f.obra_nombre}</span>
                          : f.lat_entrada != null && f.lng_entrada != null
                            ? <a href={`https://maps.google.com/?q=${f.lat_entrada},${f.lng_entrada}`} target="_blank" rel="noopener noreferrer" className="text-accent no-underline hover:underline">Ver mapa</a>
                            : <span className="text-ink-3">—</span>}
                        {textoPrecision(f.precision_entrada_m) && (
                          <span className="ml-1 text-ink-3" title="Precisión del GPS al fichar la entrada">{textoPrecision(f.precision_entrada_m)}</span>
                        )}
                        {tramoSinUbicacion(f) && (
                          <Chip tono="aviso" className="ml-1">{tramoSinUbicacion(f)}</Chip>
                        )}
                      </td>
                      <td className="px-3 py-2.5 flex gap-1">
                        <Boton variante="secundario" title="Corregir" aria-label="Corregir fichaje"
                          onClick={() => { setEditId(f.id); setEditSalida(''); setEditObs(f.observaciones ?? ''); setEditMotivo(''); setErrorEdit(''); setAuditId(null) }}
                        >Corregir</Boton>
                        <Boton variante="fantasma" title="Ver historial de cambios" aria-label="Ver historial de cambios"
                          onClick={() => verAuditoria(f.id)}
                        >Historial</Boton>
                      </td>
                    </>
                  )}
                </tr>
                {auditId === f.id && (
                  <tr key={`audit-${f.id}`} className="border-b border-line bg-paper-2/50">
                    <td colSpan={7} className="px-3 py-2.5">
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
                              <span>{a.motivo}</span>
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
      </Tabla>

      <section className="mt-6">
        <h2 className="mb-1 text-base">Incidencias de ubicación</h2>
        <div className="mb-3 flex items-start gap-3 rounded border border-line bg-paper-2 p-3">
          {typeof sinUbic === 'boolean' ? (
            <button
              type="button" role="switch" aria-checked={sinUbic} aria-label="Permitir fichar sin ubicación (emergencia)"
              onClick={cambiarSinUbic} disabled={guardandoSinUbic}
              className="-m-1 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center disabled:opacity-60"
            >
              <span className={`relative inline-block h-6 w-11 rounded-full transition-colors ${sinUbic ? 'bg-ink' : 'bg-line'}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${sinUbic ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
            </button>
          ) : (
            <span className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center text-xs text-ink-3" aria-busy={sinUbic === null}>
              {sinUbic === null ? '…' : '—'}
            </span>
          )}
          <div className="min-w-0 flex-1 py-1">
            <p className="text-sm font-medium">Permitir fichar sin ubicación (emergencia)</p>
            <p className="text-xs text-ink-3">Si el GPS del móvil falla, el empleado podrá fichar igualmente. El fichaje queda marcado y lo verás aquí.</p>
            {sinUbic === null && <p className="mt-1 text-xs text-ink-3">Cargando…</p>}
            {sinUbic === 'error' && <p className="mt-1 text-xs text-alert">No se ha podido leer el ajuste.</p>}
            {msgSinUbic && <p role="status" className={`mt-1 text-xs ${msgSinUbic.startsWith('Guardado') ? 'text-ink-2' : 'text-alert'}`}>{msgSinUbic}</p>}
          </div>
        </div>
        <p className="mb-2 text-xs text-ink-3">Últimos 30 días: veces que el móvil del empleado no dio su ubicación al fichar.</p>
        {cargandoIncidencias ? (
          <p className="text-sm text-ink-3">Cargando…</p>
        ) : incidencias === null ? (
          <p className="text-sm text-ink-3">No se han podido cargar las incidencias.</p>
        ) : incidencias.length === 0 ? (
          <p className="text-sm text-ink-3">Sin incidencias de ubicación en los últimos 30 días.</p>
        ) : (
          <Tabla tablaClassName="md:min-w-[560px]">
            <thead>
              <tr className="border-b border-line bg-paper-2">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Empleado</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Causa</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Móvil</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-3">Veces</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-ink-3">Fichó sin ubicación</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Última</th>
              </tr>
            </thead>
            <tbody>
              {incidencias.map(i => (
                <tr key={`${i.empleado_id}-${i.causa}-${i.plataforma}`} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5 font-medium">{i.empleado_nombre ?? '—'}</td>
                  <td data-label="Causa" className="px-3 py-2.5 text-ink-2">{ETIQUETA_CAUSA[i.causa] ?? i.causa}</td>
                  <td data-label="Móvil" className="px-3 py-2.5 text-ink-2">{ETIQUETA_PLATAFORMA[i.plataforma] ?? i.plataforma}</td>
                  <td data-label="Veces" className="px-3 py-2.5 text-right tabular-nums">{i.total}</td>
                  <td data-label="Fichó sin ubicación" className="px-3 py-2.5 text-right tabular-nums">{i.fichados_sin_ubicacion}</td>
                  <td data-label="Última" className="px-3 py-2.5 text-ink-2">{fmtISO(i.ultima_at)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </section>
    </Page>
  )
}
