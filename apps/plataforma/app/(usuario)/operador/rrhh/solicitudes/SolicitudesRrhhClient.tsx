'use client'
import { useState, useMemo } from 'react'
import type { SolicitudRrhh } from '@/lib/rrhh-operador'

const TIPO_ETIQUETA: Record<string, string> = {
  vacaciones: 'Vacaciones',
  matrimonio: 'Matrimonio / pareja de hecho',
  fallecimiento: 'Fallecimiento de familiar',
  hospitalizacion: 'Hospitalización de familiar',
  enfermedad_grave: 'Accidente o enfermedad grave',
  intervencion: 'Intervención quirúrgica de familiar',
  mudanza: 'Mudanza / traslado de domicilio',
  deber_inexcusable: 'Deber inexcusable',
  examenes: 'Exámenes / formación',
  lactancia: 'Lactancia',
  fuerza_mayor_familiar: 'Fuerza mayor familiar',
  permiso_retribuido: 'Otro permiso retribuido',
  parte_medico: 'Parte médico / consulta',
  baja: 'Baja médica (IT)',
  otro: 'Otro',
}

const ESTADO_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  solicitada: { label: 'Solicitada', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  aprobada:   { label: 'Aprobada',   color: 'var(--positive)', bg: 'var(--positive-bg)' },
  rechazada:  { label: 'Rechazada',  color: 'var(--negative)', bg: 'var(--negative-bg)' },
}

function fmt(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Tarjetas montadas de inicio; el resto sale con «Ver más» (el API trae hasta 500).
const PAGE = 50

export default function SolicitudesRrhhClient({ solicitudes }: { solicitudes: SolicitudRrhh[] }) {
  const [q, setQ] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('_all')
  const [filtroEstado, setFiltroEstado] = useState('_all')
  const [nVisibles, setNVisibles] = useState(PAGE)

  const empresas = useMemo(() => {
    const set = new Set(solicitudes.map(s => s.empresa_nombre))
    return Array.from(set).sort()
  }, [solicitudes])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return solicitudes.filter(s => {
      if (filtroEmpresa !== '_all' && s.empresa_nombre !== filtroEmpresa) return false
      if (filtroEstado !== '_all' && s.estado !== filtroEstado) return false
      if (!t) return true
      return s.empleado_nombre.toLowerCase().includes(t) ||
             (TIPO_ETIQUETA[s.tipo] ?? s.tipo).toLowerCase().includes(t)
    })
  }, [solicitudes, q, filtroEmpresa, filtroEstado])

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>RR.HH. · Solicitudes</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)', background: 'var(--border)', borderRadius: 20, padding: '2px 10px' }}>{visibles.length} / {solicitudes.length}</span>
      </div>

      <div className="solic-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          placeholder="Buscar por empleado o tipo…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--surface)' }}
        />
        <select
          value={filtroEmpresa}
          onChange={e => setFiltroEmpresa(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--surface)' }}
        >
          <option value="_all">Todas las empresas</option>
          {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
        </select>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--surface)' }}
        >
          <option value="_all">Todos los estados</option>
          <option value="solicitada">Solicitadas</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibles.slice(0, nVisibles).map(s => {
          const est = ESTADO_STYLE[s.estado]
          const rango = [fmt(s.fecha_inicio), fmt(s.fecha_fin)].filter(Boolean).join(' → ')
          return (
            <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
              <div className="solic-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.empleado_nombre}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}> · {s.empresa_nombre}</span>
                  <div style={{ marginTop: 2, fontSize: 14, color: 'var(--text)' }}>
                    {TIPO_ETIQUETA[s.tipo] ?? s.tipo}
                    {rango && <span style={{ color: 'var(--muted)', fontSize: 13 }}> · {rango}</span>}
                  </div>
                  {s.motivo && <div style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>{s.motivo}</div>}
                </div>
                <div className="solic-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {est && (
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 12, color: est.color, background: est.bg }}>
                      {est.label}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {fmt(s.creada_at)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
        {visibles.length > nVisibles && (
          <button onClick={() => setNVisibles(v => v + 100)}
            style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Ver más ({visibles.length - nVisibles} solicitudes restantes)
          </button>
        )}
        {visibles.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            {solicitudes.length === 0 ? 'Sin solicitudes en iarrhh' : 'Ninguna solicitud coincide'}
          </div>
        )}
      </div>

      <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
        Solo lectura. Para aprobar/rechazar, usa <a href={process.env.NEXT_PUBLIC_RRHH_URL ?? 'https://central-rrhh.vercel.app'} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>central-rrhh.vercel.app</a>.
      </p>
    </div>
  )
}
