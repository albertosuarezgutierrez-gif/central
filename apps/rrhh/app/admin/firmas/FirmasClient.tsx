'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Page from '@/components/ui/Page'
import Tabla from '@/components/ui/Tabla'

type Fila = {
  documento_id: string; documento: string; carpeta: string; estado_firma: string
  empleado_id: string; empleado: string; empleado_estado: string; email: string | null; telefono: string | null
  creada_at: string; firma_solicitada_at: string | null; dias_demora: number; demora_aprox: boolean
  visto_empleado_at: string | null
  ultimo_aviso_at: string | null; ultimo_aviso_tipo: string | null
  ultimo_email_estado: string | null; ultimo_push_estado: string | null
  n_recordatorios: number
}

const BTN_SEC = 'min-h-[44px] bg-paper-2 text-ink-2 border border-line hover:bg-line'
const TIPO: Record<string, string> = {
  solicitud_firma: 'Solicitud', recordatorio_firma: 'Recordatorio auto.', reclamacion_firma: 'Reclamación', documento_nuevo: 'Aviso',
}
const EMAIL: Record<string, string> = {
  enviado: 'email ✔', sin_email: 'sin email', sin_transporte: 'email no configurado', error: 'email falló',
}

function fecha(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
}

export default function FirmasClient() {
  const [estado, setEstado] = useState<'pendiente' | 'pendiente_empresa' | 'todos'>('pendiente')
  const [q, setQ] = useState('')
  const [qAplicada, setQAplicada] = useState('')
  const [visto, setVisto] = useState<'todos' | 'si' | 'no'>('todos')
  const [demora, setDemora] = useState(0)
  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [reclamando, setReclamando] = useState<string | null>(null)
  const pet = useRef(0)

  const cargar = useCallback(async (offset: number) => {
    const n = ++pet.current
    setCargando(true); setError('')
    const sp = new URLSearchParams({ estado, visto, demora: String(demora), q: qAplicada, offset: String(offset), limit: '50' })
    try {
      const r = await fetch(`/api/admin/firmas?${sp}`)
      const j = await r.json().catch(() => ({}))
      if (n !== pet.current) return // respuesta de un filtro anterior
      if (!r.ok) { setError(j.error ?? 'No se pudo cargar'); return }
      setFilas(prev => offset === 0 ? j.filas : [...prev, ...j.filas])
      setHayMas(!!j.hay_mas); setTotal(j.total ?? null)
    } catch { if (n === pet.current) setError('Error de red') }
    finally { if (n === pet.current) setCargando(false) }
  }, [estado, visto, demora, qAplicada])

  useEffect(() => { cargar(0) }, [cargar])
  useEffect(() => { const t = setTimeout(() => setQAplicada(q.trim()), 350); return () => clearTimeout(t) }, [q])

  async function reclamar(f: Fila) {
    setReclamando(f.documento_id)
    try {
      const r = await fetch('/api/admin/firmas/reclamar', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documento_id: f.documento_id }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(m => ({ ...m, [f.documento_id]: j.error ?? 'No se pudo reclamar' })); return }
      const a = j.aviso
      const txt = a ? `Reclamado · ${EMAIL[a.email_estado] ?? a.email_estado} · push ${a.push_estado === 'enviado' ? '✔' : 'no'}` : 'Reclamado (aviso sin registrar)'
      setMsg(m => ({ ...m, [f.documento_id]: txt }))
      // Recarga sin desmontar: actualiza la fila (último aviso, nº de recordatorios).
      setFilas(prev => prev.map(x => x.documento_id === f.documento_id ? {
        ...x, ultimo_aviso_at: new Date().toISOString(), ultimo_aviso_tipo: 'reclamacion_firma',
        ultimo_email_estado: a?.email_estado ?? null, ultimo_push_estado: a?.push_estado ?? null,
        n_recordatorios: x.n_recordatorios + 1, firma_solicitada_at: x.firma_solicitada_at ?? new Date().toISOString(),
      } : x))
    } finally { setReclamando(null) }
  }

  async function firmarEmpresa(f: Fila) {
    setReclamando(f.documento_id)
    try {
      const r = await fetch(`/api/admin/empleados/${f.empleado_id}/documentos/${f.documento_id}/firmar-empresa`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      setMsg(m => ({ ...m, [f.documento_id]: r.ok ? 'Firmado por la empresa · avisado el empleado' : (j.error ?? 'No se pudo firmar') }))
      if (r.ok) setFilas(prev => estado === 'pendiente_empresa' ? prev.filter(x => x.documento_id !== f.documento_id) : prev.map(x => x.documento_id === f.documento_id ? { ...x, estado_firma: 'pendiente', firma_solicitada_at: new Date().toISOString(), dias_demora: 0, demora_aprox: false } : x))
    } finally { setReclamando(null) }
  }

  return (
    <Page
      titulo="Firmas pendientes"
      subtitulo="Recordatorio automático a los 3 y 7 días de la solicitud y luego cada semana. «Reclamar» reenvía email y push ahora."
    >

      <div className="mb-3 grid grid-cols-1 gap-2 rounded-card border border-line bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar empleado, DNI o documento" className="text-sm" />
        <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)} className="text-sm">
          <option value="pendiente">Pendiente del empleado</option>
          <option value="pendiente_empresa">Pendiente de firmar la empresa</option>
          <option value="todos">Todas las pendientes</option>
        </select>
        <select value={visto} onChange={e => setVisto(e.target.value as typeof visto)} className="text-sm">
          <option value="todos">Abierto o no</option>
          <option value="no">No consta abierto</option>
          <option value="si">Abierto por el empleado</option>
        </select>
        <select value={demora} onChange={e => setDemora(Number(e.target.value))} className="text-sm">
          <option value={0}>Cualquier demora</option>
          <option value={3}>3 días o más</option>
          <option value={7}>7 días o más</option>
          <option value={14}>14 días o más</option>
          <option value={30}>30 días o más</option>
        </select>
      </div>

      {total != null && <p className="mb-2 text-sm text-ink-2">{total} {total === 1 ? 'documento' : 'documentos'}</p>}
      {error && <p className="mb-2 text-sm text-alert">{error}</p>}

      <Tabla fija>
          <thead>
            <tr className="border-b border-line bg-paper-2 text-left text-xs text-ink-3">
              <th className="px-3 py-2 md:w-[26%]">Documento</th>
              <th className="px-3 py-2 md:w-[16%]">Empleado</th>
              <th className="px-3 py-2 whitespace-nowrap">Demora</th>
              <th className="px-3 py-2">Abierto</th>
              <th className="px-3 py-2">Último aviso</th>
              <th className="px-3 py-2">Contacto</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.documento_id} className="border-b border-line align-top">
                <td className="px-3 py-2.5">
                  <a href={`/admin/empleados/${f.empleado_id}`} className="font-medium text-ink no-underline hover:text-accent">{f.documento}</a>
                  <div className="text-xs text-ink-3">{f.estado_firma === 'pendiente_empresa' ? 'Falta la firma de la empresa' : 'Falta la firma del empleado'}</div>
                  {msg[f.documento_id] && <div className="text-xs text-accent-ink">{msg[f.documento_id]}</div>}
                </td>
                <td className="px-3 py-2.5" data-label="Empleado">
                  <a href={`/admin/empleados/${f.empleado_id}`} className="text-ink no-underline hover:text-accent">{f.empleado}</a>
                  {f.empleado_estado !== 'activo' && <span className="ml-1 text-xs text-warn">({f.empleado_estado})</span>}
                </td>
                <td className="px-3 py-2.5" data-label="Demora">
                  <span className={`tabular-nums ${f.dias_demora >= 7 ? 'font-semibold text-alert' : f.dias_demora >= 3 ? 'text-warn' : ''}`}>
                    {f.dias_demora} {f.dias_demora === 1 ? 'día' : 'días'}
                  </span>
                  {f.demora_aprox && <span className="block text-xs text-ink-3" title="La fecha de solicitud no consta: se cuenta desde la subida">desde la subida</span>}
                </td>
                <td className="px-3 py-2.5" data-label="Abierto">
                  {f.visto_empleado_at ? <span className="text-ok">Sí · {fecha(f.visto_empleado_at)}</span> : <span className="text-ink-3">No consta</span>}
                </td>
                <td className="px-3 py-2.5" data-label="Último aviso">
                  {f.ultimo_aviso_at ? (
                    <span>
                      {TIPO[f.ultimo_aviso_tipo ?? ''] ?? f.ultimo_aviso_tipo} · {fecha(f.ultimo_aviso_at)}
                      <span className="block text-xs text-ink-3">
                        {EMAIL[f.ultimo_email_estado ?? ''] ?? 'email —'} · push {f.ultimo_push_estado === 'enviado' ? '✔' : f.ultimo_push_estado ? 'no' : '—'}
                        {f.n_recordatorios > 0 && ` · ${f.n_recordatorios} recl.`}
                      </span>
                    </span>
                  ) : <span className="text-ink-3">Ninguno</span>}
                </td>
                <td className="px-3 py-2.5" data-label="Contacto">
                  <span className="flex flex-col items-end gap-0.5 md:items-start">
                    {f.telefono ? <a href={`tel:${f.telefono.replace(/\s+/g, '')}`} className="text-accent no-underline">{f.telefono}</a> : <span className="text-ink-3">sin teléfono</span>}
                    {f.email ? <a href={`mailto:${f.email}`} className="break-all text-xs text-accent no-underline">{f.email}</a> : <span className="text-xs text-ink-3">sin email</span>}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {f.estado_firma === 'pendiente' ? (
                    <button type="button" disabled={reclamando === f.documento_id} onClick={() => reclamar(f)} className="min-h-[44px] px-3 text-xs">
                      {reclamando === f.documento_id ? 'Enviando…' : 'Reclamar'}
                    </button>
                  ) : (
                    <button type="button" disabled={reclamando === f.documento_id} onClick={() => firmarEmpresa(f)} className="min-h-[44px] px-3 text-xs">
                      {reclamando === f.documento_id ? 'Firmando…' : 'Firmar como empresa'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!cargando && filas.length === 0 && !error && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-ink-3">No hay firmas pendientes con estos filtros.</td></tr>
            )}
          </tbody>
      </Tabla>
      <div className="mt-3 flex items-center gap-3">
        {hayMas && <button type="button" className={BTN_SEC} disabled={cargando} onClick={() => cargar(filas.length)}>Ver más</button>}
        {cargando && <span className="text-sm text-ink-3">Cargando…</span>}
      </div>
    </Page>
  )
}
